# Changelog

<!-- Format: [YYYY-MM-DD] vX.X.X — description -->

## v0.0.1 — Unreleased

Initial implementation of the Fish Audio Realtime SpeechProvider.

- WebSocket TTS Live primary transport (`wss://api.fish.audio/v1/tts/live`) with `latency: low` default.
- HTTP `/v1/tts` fallback when WebSocket is unavailable; user-configurable transport selection (`auto` / `websocket` / `http`).
- Plugin id `fish-audio-realtime` (distinct from `fish-audio`) so it coexists with `@conan-scott/openclaw-fish-audio`.
- Inline directives prefixed `fishaudio_*` / `fish_*` for voice, speed, model, latency, temperature, top_p.
- Voice list helper that returns user's own clones plus popular community voices.
- v2 RealtimeVoiceProvider (Mode C) placeholder under `src/modes/realtime-bridge.ts`.
- vitest unit tests for config, HTTP fallback, WebSocket Live (with mock socket), voice list, and SpeechProvider wrapper.
- Manual end-to-end procedure documented at `docs/manual-e2e.md`.
