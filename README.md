# openclaw-fishaudio-realtime

A low-latency [Fish Audio](https://fish.audio) speech provider for [OpenClaw](https://openclaw.ai), using the [WebSocket TTS Live](https://docs.fish.audio/api-reference/endpoint/websocket/tts-live) endpoint to power real-time voice conversation in Discord voice channels.

## What it does

- Registers `fish-audio-realtime` as an OpenClaw `SpeechProvider`.
- Uses Fish Audio's WebSocket Live endpoint with `latency: low` by default to minimize time-to-first-audio.
- Falls back to the HTTP `/v1/tts` endpoint when the WebSocket cannot connect.
- Targeted at OpenClaw's Discord voice channel in `streaming` Talk mode (the user speaks → OpenClaw transcribes → LLM → this plugin synthesizes the AI's reply with Fish Audio).

## What it does *not* do (yet)

- Does **not** replace OpenClaw's `realtime` Talk mode (e.g., OpenAI Realtime, Gemini Live) — those modes synthesize audio inside the model and bypass speech providers.
- Does **not** provide STT, voice cloning upload, or barge-in. A future Mode C (`RealtimeVoiceProvider`) will own the full pipeline.

## Installation

```bash
openclaw plugins install @averatec0773/openclaw-fishaudio-realtime
```

Then restart OpenClaw.

## Getting an API key

1. Sign up at [fish.audio](https://fish.audio).
2. Account → API → Create API Key.
3. Copy the key (it begins with the prefix Fish Audio uses).

## Configuration

In `~/.openclaw/openclaw.json`:

```json5
{
  messages: {
    tts: {
      provider: "fish-audio-realtime",
      providers: {
        "fish-audio-realtime": {
          apiKey: "your-fish-audio-api-key",   // or set FISH_AUDIO_API_KEY env var
          voiceId: "reference-id-of-your-voice",
          model: "s2-pro",                      // s2-pro (default) | s1
          latency: "low",                       // low (default) | balanced | normal
          transport: "auto",                    // auto (WS, then HTTP) | websocket | http
          // speed: 1.0,                        // 0.5–2.0 (optional)
          // temperature: 0.7,                  // 0–1 (optional)
          // topP: 0.7,                         // 0–1 (optional)
        }
      }
    }
  }
}
```

For Discord voice channel use, configure the bot to use `streaming` Talk mode (not `realtime`) so this plugin's TTS is invoked. See OpenClaw's [Discord docs](https://docs.openclaw.ai/channels/discord) for the bot setup.

## Finding a voice ID

```bash
openclaw /voice list
```

The plugin returns your own cloned voices first, then a page of popular community voices.

## Inline directives

All directive keys are prefixed to avoid colliding with other speech providers. Both `fishaudio_*` and shorter `fish_*` aliases work.

```
[[tts:fishaudio_voice=<ref_id>]]    Switch voice
[[tts:fishaudio_speed=1.2]]         Prosody speed (0.5–2.0)
[[tts:fishaudio_model=s1]]          Model override
[[tts:fishaudio_latency=balanced]]  Latency mode
[[tts:fishaudio_temperature=0.7]]   Sampling temperature (0–1)
[[tts:fishaudio_top_p=0.8]]         Top-p sampling (0–1)
```

## End-to-end verification

See [`docs/manual-e2e.md`](docs/manual-e2e.md) for the manual Discord voice channel acceptance test.

## Relation to `@conan-scott/openclaw-fish-audio`

[Conan Scott's plugin](https://github.com/Conan-Scott/openclaw-fish-audio) (plugin id `fish-audio`) uses the HTTP batch endpoint. This plugin (id `fish-audio-realtime`) uses the WebSocket Live endpoint with HTTP fallback, optimized for real-time voice channel use. The two plugins coexist; pick whichever fits your latency requirements.

## License

MIT
