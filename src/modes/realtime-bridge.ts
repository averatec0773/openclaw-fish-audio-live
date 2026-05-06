// Reserved for v2: a Mode C RealtimeVoiceProvider implementation that owns
// the full STT → LLM → Fish Audio Live TTS pipeline as a single OpenClaw
// realtime voice provider. See docs/superpowers/specs/2026-05-05-fishaudio-
// realtime-plugin-design.md section 8 ("Future work").
//
// Not registered in v1.

export function buildFishAudioRealtimeVoiceBridge(): never {
  throw new Error("RealtimeVoiceProvider mode is not implemented in v1. See spec section 8.");
}
