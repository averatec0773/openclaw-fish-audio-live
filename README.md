# openclaw-fishaudio-realtime

An OpenClaw plugin that registers Fish Audio as a low-latency speech provider, optimized for real-time voice conversation in Discord voice channels.

> **Status:** scaffolding / pre-MVP. The plugin code has not been implemented yet — the design is captured in [`docs/superpowers/specs/`](docs/superpowers/specs/).

## What it does (target MVP)

- Registers `fish-audio-realtime` as an OpenClaw `SpeechProvider`.
- Uses Fish Audio's [WebSocket TTS Live](https://docs.fish.audio/api-reference/endpoint/websocket/tts-live) endpoint with `latency: low`, falling back to the HTTP `/v1/tts` endpoint if the WebSocket connection is unavailable.
- Targeted at OpenClaw's Discord voice channel in `streaming` Talk mode: the user speaks, OpenClaw transcribes (via the user's configured STT) and runs the LLM, and this plugin synthesizes the AI's reply with Fish Audio's voice and streams it back to the channel.

## What it does *not* do (yet)

- Does **not** replace OpenClaw's `realtime` Talk mode (e.g., OpenAI Realtime / Gemini Live) — those modes synthesize audio inside the model and bypass speech providers entirely.
- Does **not** provide STT, voice cloning upload, or barge-in coordination. Those belong to a future v2 (`RealtimeVoiceProvider` mode) — the codebase is structured to allow that addition without a rewrite.

## Relation to other Fish Audio plugins

[`@conan-scott/openclaw-fish-audio`](https://github.com/Conan-Scott/openclaw-fish-audio) is an existing Fish Audio speech provider that uses the HTTP batch endpoint. This plugin focuses specifically on the WebSocket Live endpoint to reduce time-to-first-audio in real-time voice scenarios. The two plugins coexist; this one's plugin id is `fish-audio-realtime` to avoid collisions.

## License

MIT
