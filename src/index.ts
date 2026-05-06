import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { buildFishAudioRealtimeSpeechProvider } from "./modes/speech-provider.js";

export default definePluginEntry({
  id: "fish-audio-realtime",
  name: "Fish Audio Realtime",
  description: "Low-latency Fish Audio speech provider using WebSocket TTS Live for real-time voice channels.",
  register(api) {
    api.registerSpeechProvider(buildFishAudioRealtimeSpeechProvider() as any);
  },
});
