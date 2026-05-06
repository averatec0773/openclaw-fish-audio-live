# openclaw-fish-audio-live

A low-latency [Fish Audio](https://fish.audio) speech provider for [OpenClaw](https://openclaw.ai), using the [WebSocket TTS Live](https://docs.fish.audio/api-reference/endpoint/websocket/tts-live) endpoint to power real-time voice conversation in Discord voice channels.

## What it does

- Registers `fish-audio-live` as an OpenClaw `SpeechProvider`.
- Uses Fish Audio's WebSocket Live endpoint with `latency: low` by default to minimize time-to-first-audio.
- Falls back to the HTTP `/v1/tts` endpoint when the WebSocket cannot connect.
- Targeted at OpenClaw's Discord voice channel in `streaming` Talk mode (the user speaks → OpenClaw transcribes → LLM → this plugin synthesizes the AI's reply with Fish Audio).

## What it does *not* do (yet)

- Does **not** replace OpenClaw's `realtime` Talk mode (e.g., OpenAI Realtime, Gemini Live) — those modes synthesize audio inside the model and bypass speech providers.
- Does **not** provide STT, voice cloning upload, or barge-in. A future Mode C (`RealtimeVoiceProvider`) will own the full pipeline.

## Installation

```bash
openclaw plugins install @averatec0773/openclaw-fish-audio-live
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
      provider: "fish-audio-live",
      providers: {
        "fish-audio-live": {
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

## Discord voice channel quickstart

The full set of OpenClaw config blocks needed for `/vc join` to actually play synthesized audio in a Discord voice channel — these requirements come from upstream `@openclaw/discord` and the bundled `talk-voice` plugin, not from this plugin alone, and are easy to miss when you read only the `messages.tts` snippet above:

```json5
{
  // 1. Per-bot Discord voice config — without `voice.enabled: true` the
  //    `/vc` slash commands don't appear and the Guild Voice States intent
  //    is not requested.
  channels: {
    discord: {
      accounts: {
        "<your-bot-account-id>": {
          voice: {
            enabled: true,
            tts: { provider: "fish-audio-live", auto: "inbound" }
          }
        }
      }
    }
  },

  // 2. The bundled talk-voice plugin reads top-level `talk` to decide
  //    which provider services voice replies. Without this it silently
  //    falls back and you get no audio.
  talk: {
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
    interruptOnSpeech: false   // see note below
  },

  // 3. STT (input side). gpt-4o-transcribe works; gpt-4o-mini-transcribe
  //    currently returns an empty `text` field via OpenClaw's call shape
  //    and silently fails — pin to gpt-4o-transcribe for now.
  tools: {
    media: {
      audio: {
        enabled: true,
        models: [{ provider: "openai", model: "gpt-4o-transcribe" }]
      }
    }
  }
}
```

### Headphones, please

Discord does not aggressively cancel echo on the bot side. If you test on speakers, the bot's own TTS playback will be captured by your microphone, transcribed, and treated as a new turn — you will hear an unsolicited follow-up reply. Use headphones or set `talk.interruptOnSpeech: false` (which prevents the in-progress reply from being cut, but does not stop the echo turn from being processed afterward).

### Verbose debug logging

OpenClaw exposes per-stage voice timings (`capture ready / transcription ok / reply ok / tts ok / playback start / playback done`) only when verbose is enabled. **Set the CLI flag, not the env var** — `OPENCLAW_VERBOSE=1` is read in only one non-load-bearing path, so it looks like it should work but silently no-ops:

```yaml
# docker-compose.yml command argv
command: ["node", "dist/index.js", "gateway", "--bind", "0.0.0.0", "--port", "18789", "--verbose"]
```

### Bot leaves voice channel on every restart

Each container/gateway restart drops the bot from any voice channel it was in; the user has to `/vc join` again. To auto-rejoin a known channel, set `channels.discord.accounts.<id>.voice.autoJoin` (a list of `{ guildId, channelId }` entries).

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

[Conan Scott's plugin](https://github.com/Conan-Scott/openclaw-fish-audio) (plugin id `fish-audio`) uses the HTTP batch endpoint. This plugin (id `fish-audio-live`) uses the WebSocket Live endpoint with HTTP fallback, optimized for real-time voice channel use. The two plugins coexist; pick whichever fits your latency requirements.

## License

MIT
