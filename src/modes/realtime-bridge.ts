// Reserved for v2: a Mode C RealtimeVoiceProvider implementation that owns
// the full STT → LLM → Fish Audio TTS pipeline as a single OpenClaw realtime
// voice provider. Not registered in v1.

export function buildFishAudioVoiceBridge(): never {
  throw new Error("RealtimeVoiceProvider mode is not implemented in v1.");
}
