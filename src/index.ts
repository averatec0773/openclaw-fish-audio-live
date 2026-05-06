import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { buildFishAudioLiveSpeechProvider } from "./modes/speech-provider.js";

export default definePluginEntry({
  id: "fish-audio-live",
  name: "Fish Audio Live",
  description: "Low-latency Fish Audio speech provider using WebSocket TTS Live for real-time voice channels.",
  register(api) {
    api.registerSpeechProvider(buildFishAudioLiveSpeechProvider() as any);
  },
});
