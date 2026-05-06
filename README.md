# openclaw-fish-audio-live

A [Fish Audio](https://fish.audio) speech provider plugin for [OpenClaw](https://openclaw.ai). The plugin registers as a `SpeechProvider` and uses the [WebSocket TTS Live](https://docs.fish.audio/api-reference/endpoint/websocket/tts-live) endpoint for synthesis, with the HTTP `/v1/tts` endpoint as a fallback. The primary use case is real-time conversation in Discord voice channels; the plugin is also usable for any other target OpenClaw routes through a `SpeechProvider`, such as Telegram or WhatsApp voice notes.

The plugin id is `fish-audio-live`.

## Features

| Feature | |
|---|---|
| HTTP `/v1/tts` synthesis | ✅ |
| WebSocket `/v1/tts/live` transport | ✅ |
| Automatic WebSocket → HTTP fallback (`transport: "auto"`) | ✅ |
| Direct Opus output for the Discord voice channel target (`audio-file`) | ✅ |
| Direct Opus output for the voice-note target (Telegram, WhatsApp) | ✅ |
| Voice list combining the account's own voice clones with a page of popular community voices | ✅ |
| Inline directives: `fishaudio_voice` / `fish_speed` / `fish_model` / `fish_latency` / `fish_temperature` / `fish_top_p` | ✅ |
| Unit tests | 45 |

Out of scope: STT, voice cloning upload, barge-in, and the OpenClaw `realtime` Talk mode (the latter bypasses speech providers entirely).

## Install

```bash
openclaw plugins install @averatec0773/openclaw-fish-audio-live
```

Obtain an API key at [fish.audio](https://fish.audio) under Account → API. Restart OpenClaw after installation.

## Configure

Minimum configuration, sufficient for voice-note and chat TTS targets:

```json5
{
  messages: {
    tts: {
      provider: "fish-audio-live",
      providers: {
        "fish-audio-live": {
          apiKey: "your-fish-audio-api-key",   // or set FISH_AUDIO_API_KEY in the environment
          voiceId: "reference-id-of-your-voice",
          model: "s2-pro",                      // s2-pro (default) | s1
          latency: "low",                       // low (default) | balanced | normal
          transport: "auto"                     // auto | websocket | http
          // speed, temperature, topP are also accepted
        }
      }
    }
  }
}
```

### Discord voice channel — three additional blocks

`/vc join` produces no audio if any of the following blocks is missing. The requirements come from upstream `@openclaw/discord` and the bundled `talk-voice` plugin:

```json5
{
  channels: {                              // 1. Per-bot voice and TTS routing
    discord: {
      accounts: {
        "<your-bot-account-id>": {
          voice: {
            enabled: true,                 // gates /vc commands and the voice intent
            tts: { provider: "fish-audio-live", auto: "inbound" }
          }
        }
      }
    }
  },

  talk: {                                  // 2. Read by the talk-voice plugin
    provider: "fish-audio-live",
    providers: {
      "fish-audio-live": {
        voiceId: "your-fish-voice-id",
        model: "s2-pro",
        latency: "low",
        transport: "auto"
      }
    },
    speechLocale: "zh-CN",
    interruptOnSpeech: false               // see operational notes below
  },

  tools: {                                 // 3. STT (input side)
    media: {
      audio: {
        enabled: true,
        models: [{ provider: "openai", model: "gpt-4o-transcribe" }]
      }
    }
  }
}
```

### Operational notes

- Use headphones during testing. Discord does not perform aggressive echo cancellation on the bot side, so playback re-entering through a microphone will be transcribed and processed as a new turn.
- Verbose logging is enabled by the gateway CLI flag `--verbose`. The environment variable `OPENCLAW_VERBOSE=1` does not enable it. To turn verbose on under Docker Compose, append `"--verbose"` to the gateway `command:` array.
- The OpenAI model `gpt-4o-mini-transcribe` returns a 200 response with an empty `text` field when called through OpenClaw's transcription path. Use `gpt-4o-transcribe` in `tools.media.audio.models` until the upstream call shape is updated.
- The bot leaves any voice channel on each gateway restart; rejoining requires another `/vc join`. To rejoin automatically, set `channels.discord.accounts.<id>.voice.autoJoin` to a list of `{ guildId, channelId }` entries.

## End-to-end timing

Per-stage timings observed on a representative Discord voice channel turn (`gpt-4o-transcribe` for STT, `gpt-5-nano` with `tools.allow=["message"]` for the LLM, Fish Audio `s2-pro` voice clone, eastern-US VPS, reply ≈ 14 characters):

| Stage | Observed | Driver |
|---|---|---|
| Discord `speaking_end` grace | ~1.2s | Hardcoded by the upstream Discord plugin; not configurable. |
| OPUS decode plus WAV write | ~0.2s | Local I/O. |
| STT | 1.5–2.5s | OpenAI transcription TTFT. |
| LLM | 6–8s | OpenAI TTFT for `gpt-5-nano`. Switching to `claude-haiku-4-5` or `cerebras/llama-3.3-70b` reduces this stage. |
| TTS (this plugin) | ~1.0s | Fish Audio API plus buffer write. |
| Playback start | ~0.1s | Local. |
| End-to-end (stop-talking → audio plays) | ~10–13s | Currently dominated by the LLM stage. |

A direct `curl` to Fish Audio for the same input completes in roughly 0.8 seconds, matching the TTS stage above. Going materially below ~3 seconds end-to-end requires OpenClaw's `realtime` Talk mode, which the Discord channel plugin does not currently route through.

## Inline directives

Provider-prefixed directive keys are supported, with both `fishaudio_*` and `fish_*` aliases:

```text
[[tts:fish_voice=<ref_id>]]         Switch voice
[[tts:fish_speed=1.2]]              Prosody speed (0.5–2.0)
[[tts:fish_model=s1]]               s2-pro | s1
[[tts:fish_latency=balanced]]       low | balanced | normal
[[tts:fish_temperature=0.7]]        0–1
[[tts:fish_top_p=0.8]]              0–1
```

## Voice list

```bash
openclaw /voice list
```

Returns the account's own voice clones first, followed by a page of popular community voices.

## Verification

A manual Discord voice channel acceptance procedure is documented at [`docs/manual-e2e.md`](docs/manual-e2e.md).

## License

MIT
