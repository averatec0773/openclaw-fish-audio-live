# Manual end-to-end verification — Discord voice channel

This is the MVP acceptance test. The plugin is "done" when this procedure passes.

## Preconditions

- A local OpenClaw gateway running with this plugin installed (`openclaw plugins install @averatec0773/openclaw-fish-audio-live` or via local `dist/` link).
- A Discord bot configured with `Message Content Intent`, `Server Members Intent`, and the `Connect`, `Speak`, `Send Messages`, `Read Message History` permissions on the target voice channel.
- An STT provider configured (e.g., Deepgram, OpenAI). Voice channels need transcription.
- An LLM configured.
- `~/.openclaw/openclaw.json` includes a fish-audio-live provider block (see README) with a valid `apiKey` and `voiceId`.
- Discord voice mode set to `streaming` (not `realtime`).

## Procedure

1. Start the OpenClaw gateway.
2. In a Discord text channel where the bot is allowed, run `/vc join`. Confirm the bot joins the voice channel.
3. Speak a short prompt in the voice channel (e.g., "Tell me a one-sentence joke").
4. Confirm:
   - The bot responds with audio.
   - The audio sounds like the configured Fish Audio voice (compare against a sample at fish.audio).
   - The opening of the response begins within ~1 second of you finishing speaking.
5. Measure: stopwatch the time from "you stop speaking" to "first audible AI syllable". Record the median across 3 trials below.
6. Run `/vc leave` to disconnect the bot.

## Fallback transport check

1. Edit `openclaw.json` and set `messages.tts.providers.fish-audio-live.transport` to `"http"`.
2. Restart the gateway.
3. Repeat steps 2–4 above. The conversation should still work; expect noticeably higher opening latency (~1–3 seconds) since the HTTP path waits for the full audio.
4. Reset `transport` to `"auto"` afterward.

## Observed time-to-first-audio (record here)

| Date       | Transport | Trial 1 | Trial 2 | Trial 3 | Median | Notes |
|------------|-----------|---------|---------|---------|--------|-------|
| YYYY-MM-DD | auto/ws   |   _ ms  |   _ ms  |   _ ms  |  _ ms  |       |
| YYYY-MM-DD | http      |   _ ms  |   _ ms  |   _ ms  |  _ ms  |       |

## Failure modes and what to check

- **Bot joins but no audio comes out:** Check OpenClaw logs for `Fish Audio API` errors. Verify `apiKey` and `voiceId`. Verify `streaming` mode (not `realtime`). Check that `messages.tts.provider` is set to `fish-audio-live`.
- **Audio sounds like a different provider, not Fish Audio:** Provider is being bypassed. Check Discord channel config — it may carry its own `channels.discord.voice.tts.provider` override; set it to `fish-audio-live`. If the symptom persists, the gateway may route voice TTS through a separate config path; in that case the `SpeechProvider` may need to implement `resolveTalkConfig` or `resolveTalkOverrides` as a pass-through.
- **Opening latency >2s on `transport: auto`:** WebSocket may be falling back to HTTP silently. Check logs for "Fish Audio WS:" messages. If WS is unavailable, address the network condition (proxy/firewall) and rerun.
