import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { buildFishAudioSpeechProvider } from "./modes/speech-provider.js";

export default definePluginEntry({
  id: "fishaudio",
  name: "Fish Audio",
  description: "Low-latency Fish Audio speech provider using WebSocket TTS Live for real-time voice channels.",
  register(api) {
    api.registerSpeechProvider(buildFishAudioSpeechProvider() as any);
  },
});
