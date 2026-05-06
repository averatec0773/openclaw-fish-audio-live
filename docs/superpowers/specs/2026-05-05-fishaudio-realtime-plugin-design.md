# Fish Audio Realtime — OpenClaw Plugin Design

**Date:** 2026-05-05
**Status:** Approved for implementation (pending user spec review)
**Owner:** averatec0773

---

## 1. Context and problem

OpenClaw natively integrates Discord voice channels: a configured bot can join via `/vc join` and run a `streaming` Talk session that pipes audio through STT → LLM → TTS → playback. The TTS step is pluggable via `registerSpeechProvider`. Fish Audio currently has one community speech provider — [`@conan-scott/openclaw-fish-audio`](https://github.com/Conan-Scott/openclaw-fish-audio) — but it uses Fish Audio's HTTP batch endpoint (`POST /v1/tts`), which produces noticeable opening latency on every assistant utterance and breaks the conversational rhythm in real-time voice channel use.

Fish Audio offers a lower-latency path — `wss://api.fish.audio/v1/tts/live` — with streaming text input, streaming audio output, and an explicit `latency: low` mode. **No existing OpenClaw plugin uses this transport.** Building one is the smallest delta that materially improves the Discord voice channel experience.

## 2. Goals and non-goals

### Goals (v1 / MVP)

1. Ship an OpenClaw plugin that registers a `SpeechProvider` named `fish-audio-realtime`, using Fish Audio's WebSocket Live endpoint as its primary transport.
2. Reduce time-to-first-audio for assistant replies in Discord voice channels (relative to Conan Scott's HTTP-based plugin) by combining the Live endpoint, `latency: low`, and (if SDK supports it) chunked output to OpenClaw.
3. Provide a clean fallback path to HTTP `/v1/tts` if the WebSocket connection cannot be established or fails mid-session.
4. Architect the codebase so that a future v2 RealtimeVoiceProvider (Plan C — full STT+LLM+TTS bridge) can be added without restructuring the Fish Audio core.
5. Coexist peacefully with `@conan-scott/openclaw-fish-audio`: distinct plugin id, distinct npm package, no shared global state.

### Non-goals (v1)

- No STT (transcription) provider. Users keep their existing OpenClaw STT setup (Deepgram, OpenAI, etc.).
- No `RealtimeVoiceProvider` registration. Plan C is explicitly v2 work.
- No voice cloning upload, voice training, or voice management UI.
- No audio resampling pipeline (only needed for Plan C).
- No replacement of OpenClaw's `realtime` Talk mode — when a user picks `realtime` mode (e.g., OpenAI Realtime), this plugin is bypassed by design.

## 3. Architecture

### Repository layout

```
openclaw-fishaudio-realtime/
├── README.md, CHANGELOG.md, LICENSE       ← published with the package
├── package.json, openclaw.plugin.json     ← published manifest
├── tsconfig.json, vitest.config.ts        ← build/test config
├── .env.example, .gitignore               ← repo conventions
├── src/
│   ├── fish-audio/                        ← shared core (used by Mode A and future Mode C)
│   │   ├── websocket-live.ts              ← Fish Audio WS Live client
│   │   ├── http-fallback.ts               ← Fish Audio /v1/tts client
│   │   ├── config.ts                      ← config normalization + validation
│   │   ├── voice-list.ts                  ← /model API for /voice list
│   │   └── types.ts                       ← Fish Audio protocol types
│   ├── modes/
│   │   ├── speech-provider.ts             ← v1 entry: registerSpeechProvider wrapper
│   │   └── realtime-bridge.ts             ← v2 stub (file exists but only exports a placeholder)
│   └── index.ts                           ← definePluginEntry, registers Mode A
├── test/                                  ← vitest unit and integration tests
└── docs/superpowers/specs/                ← design history (this file)
```

The harness template content (`CLAUDE.md`, `Makefile`, `.claude/`, `conventions/`, `memory/`) is **gitignored** — it exists locally to give Claude operating context but is not part of the published plugin.

### Data flow (Mode A: `SpeechProvider`)

```
Discord voice channel (user speaks)
    │
    ▼
OpenClaw Talk subsystem (`streaming` mode)
    │  ├── captures PCM
    │  ├── routes to user-configured STT provider
    │  ├── feeds transcript to user-configured LLM
    │  └── receives assistant reply text
    ▼
this plugin: SpeechProvider.synthesize({ text, target, ... })
    │  ├── normalize config (apiKey, voiceId, model, latency, ...)
    │  ├── try WebSocket Live:
    │  │     ├── connect wss://api.fish.audio/v1/tts/live
    │  │     ├── send StartEvent (with reference_id, format, latency)
    │  │     ├── send TextEvent(s) (full text in one chunk; chunk_length default 300)
    │  │     ├── send StopEvent
    │  │     └── collect AudioEvent chunks → audio buffer
    │  └── on WS failure: fall back to POST /v1/tts (HTTP)
    ▼
OpenClaw delivers audio to Discord voice channel for playback
```

### Mode A vs. future Mode C

The same plugin can later expose Mode C (`RealtimeVoiceProvider`) by adding a second registration in `index.ts`:

```ts
api.registerSpeechProvider(buildFishAudioSpeechProvider());        // v1
api.registerRealtimeVoiceProvider(buildFishAudioVoiceBridge());    // v2
```

The Fish Audio protocol code (`websocket-live.ts`, `http-fallback.ts`, `config.ts`) is reused unchanged. Mode C adds STT routing, LLM orchestration, audio resampling, and barge-in handling, but does not modify the shared core.

## 4. Key technical decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Primary synthesis transport | Fish Audio WebSocket Live (`wss://api.fish.audio/v1/tts/live`) with `latency: low` | The reason this plugin exists. |
| 2 | Fallback transport | HTTP `POST /v1/tts` with same config | Guarantees the plugin works even when WebSocket is blocked (proxies, firewalls). |
| 3 | SDK streaming output | **Verify before implementation begins** by reading `openclaw/plugin-sdk/speech-core` types: if `synthesize` supports an async-iterable / chunk-callback return shape, stream chunks; otherwise buffer all chunks then return one `Buffer`. | Documentation is unclear; this gate determines whether OpenClaw can play chunks as they arrive. Both branches ship the same WebSocket Live core. |
| 4 | Default `latency` mode | `low` | Distinguishes this plugin from Conan Scott's (which defaults to `normal`); aligns with the realtime conversational target. |
| 5 | Default `model` | `s2-pro` | Fish Audio's current strongest model; matches Conan Scott. |
| 6 | Output `format` | `mp3` by default; `opus` when `req.target === "voice-note"` | Matches Conan Scott and OpenClaw channel conventions. Discord plays both. |
| 7 | API key resolution order | (a) `req.providerConfig.apiKey` (via `normalizeResolvedSecretInputString`), (b) `process.env.FISH_AUDIO_API_KEY` | OpenClaw standard pattern. |
| 8 | Inline directives | `fishaudio_voice` / `fish_voice`, `fishaudio_speed` / `fish_speed`, `fish_model`, `fish_latency`, `fish_temperature`, `fish_top_p` | Compatible with Conan Scott's directive names so users can switch plugins without changing prompts. |
| 9 | Plugin id | `fish-audio-realtime` | Avoids collision with Conan Scott's `fish-audio` so both can be installed simultaneously. |
| 10 | npm package | `@averatec0773/openclaw-fishaudio-realtime` | Matches repo name. |
| 11 | Node version | `>= 22` (LTS) | Matches OpenClaw's minimum. |
| 12 | License | MIT | Community plugin convention. |
| 13 | HTTP error handling | `assertOkOrThrowProviderError` (from `openclaw/plugin-sdk/provider-http`) | Official helper; capped error body, request-id capture. |
| 14 | WebSocket retry/fallback policy | 1 connection attempt with timeout (default 8s); on failure or mid-session error, fall through to HTTP. No automatic reconnect inside a single `synthesize` call. | A single utterance is short-lived; reconnect logic adds complexity without latency benefit. |
| 15 | Voice list endpoint | Reuse Conan Scott's pattern: paginate user clones via `/model?type=tts&self=true`, plus one page of public top-scored voices | Same data source, same UX. |

## 5. Configuration schema

User configuration in `openclaw.json`:

```json5
{
  messages: {
    tts: {
      provider: "fish-audio-realtime",
      providers: {
        "fish-audio-realtime": {
          // Required (one of these must resolve to a key)
          apiKey: "...",                    // or use FISH_AUDIO_API_KEY env var

          // Required
          voiceId: "...",                   // Fish Audio reference_id (20–64 alphanum)

          // Optional — defaults shown
          model: "s2-pro",                  // s2-pro | s1
          latency: "low",                   // low | balanced | normal
          baseUrl: "https://api.fish.audio",
          transport: "auto",                // auto (WS, fall back to HTTP) | websocket | http

          // Optional prosody/sampling
          speed: 1.0,                       // 0.5 – 2.0
          temperature: 0.7,                 // 0 – 1
          topP: 0.7,                        // 0 – 1
        }
      }
    }
  }
}
```

`configSchema` in `openclaw.plugin.json` mirrors this with JSON Schema validation (types, enums, ranges).

## 6. Testing strategy

### Unit (vitest)
- `config.ts`: normalization and validation across raw config shapes (full, partial, invalid).
- `websocket-live.ts`: with a mock WebSocket server, assert correct StartEvent shape, TextEvent batching, StopEvent timing, AudioEvent chunk concatenation, error/timeout handling.
- `http-fallback.ts`: request shape (headers including `model`), response decoding, error mapping.
- Directive parsing: each `fish_*` / `fishaudio_*` key, including range violations.

### Integration
- `speech-provider.ts`: end-to-end through `synthesize` with the WebSocket Live core mocked, verifying transport selection, fallback on WS failure, and output Buffer correctness.

### Manual end-to-end (the actual MVP acceptance gate)
- Spin up a local OpenClaw gateway with this plugin installed, a Discord bot configured, an STT provider configured, and an LLM configured.
- Issue `/vc join` to bring the bot into a voice channel.
- Speak in the voice channel and confirm the assistant's reply is audibly synthesized with the configured Fish Audio voice (i.e., this plugin actually ran).
- Measure observed time-to-first-audio (from end of user utterance to first audible AI syllable) and record the number in the README so future regressions are visible.
- Run the same flow once with `transport: "http"` to confirm the fallback path works end-to-end.

## 7. Open questions and risks

### Open question 1 — SDK streaming output (high impact)
Does `openclaw/plugin-sdk/speech-core` expose a streaming variant of `synthesize` (async iterable, callback-based, or otherwise)? Documentation does not say. This is **the first thing to check after `npm install openclaw`**, before any plugin code is written.

- **If yes:** stream FishAudio audio chunks to OpenClaw as they arrive. Time-to-first-audio approaches Fish Audio's own (~200–500 ms).
- **If no:** buffer all chunks then return a single audioBuffer. Still faster than HTTP batch (Live endpoint produces audio faster), but bounded by full-utterance synthesis time.

Both branches reuse the same WebSocket Live client; only the wrapper differs. The decision does not affect the v2 RealtimeVoiceProvider path (which has full control over chunk delivery via the bridge interface).

### Open question 2 — exact Fish Audio Live behavior in `latency: low` mode
We have not yet confirmed empirically how aggressive `latency: low` is (e.g., observed first-chunk latency, quality cost). Surface this as a measurement during the manual end-to-end test and document the observed numbers in the README.

### Risk 1 — mid-session WebSocket failure
A network blip mid-utterance leaves the user hearing a truncated reply. v1 policy: on mid-session error, abandon the WebSocket, log a warning, and let OpenClaw's existing retry/error surface take over (we do not transparently retry inside `synthesize`). Document this clearly so operators know what to expect.

### Risk 2 — OpenClaw plugin SDK version drift
Conan Scott's plugin pins `openclaw ^2026.5.3-beta.2`. We will pin the same minimum, document compat in `package.json`'s `openclaw.compat.pluginApi`, and validate against the latest stable at release time.

### Risk 3 — Discord voice channel routing
If OpenClaw's Discord channel routes voice output through a different code path that bypasses `messages.tts.provider`, our SpeechProvider may not actually be invoked in voice channel context. The manual end-to-end test is the verification gate. Mitigation if this turns out to be true: switch the example config to `talk.tts.provider` (or whatever path OpenClaw uses for voice channel TTS) and ensure the plugin implements `resolveTalkConfig` / `resolveTalkOverrides` (mirroring Conan Scott's plugin) so it is reachable from the Talk subsystem.

## 8. Future work (out of v1 scope, but not blocked by it)

- **Mode C — `RealtimeVoiceProvider` bridge** (~1 week incremental on top of Mode A). Adds a full STT → LLM → Fish Audio TTS pipeline as a single OpenClaw realtime voice provider, enabling barge-in, lowest-possible opening latency, and use in OpenClaw's `realtime` Talk mode.
- Voice cloning upload helper (call Fish Audio's voice training endpoint from a CLI tool).
- Telemetry: optional Prom/OTEL hooks for time-to-first-audio histograms.
- Multi-tenant per-channel voice overrides (different Discord channels → different voice IDs).

## 9. References

- [Fish Audio WebSocket TTS Live](https://docs.fish.audio/api-reference/endpoint/websocket/tts-live)
- [OpenClaw plugin SDK overview](https://docs.openclaw.ai/plugins/sdk-overview)
- [OpenClaw provider plugins guide](https://docs.openclaw.ai/plugins/sdk-provider-plugins)
- [OpenClaw Discord channel docs](https://docs.openclaw.ai/channels/discord)
- [OpenClaw TTS tools docs](https://docs.openclaw.ai/tools/tts)
- [Conan Scott's plugin (structural reference)](https://github.com/Conan-Scott/openclaw-fish-audio)
- [averatec-harness-template](https://github.com/averatec0773/averatec-harness-template)
