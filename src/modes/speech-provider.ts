import { default as WS } from "ws";
import {
  isValidVoiceId,
  normalizeConfig,
} from "../fish-audio/config.js";
import { synthesizeViaHttp } from "../fish-audio/http-fallback.js";
import { synthesizeViaWebSocket } from "../fish-audio/websocket-live.js";
import { listVoices as listVoicesImpl } from "../fish-audio/voice-list.js";
import type {
  FishAudioFormat,
  FishAudioLatency,
  FishAudioModel,
  FishAudioProviderConfig,
} from "../fish-audio/types.js";

interface DirectivePolicy {
  allowVoice: boolean;
  allowModelId: boolean;
  allowVoiceSettings: boolean;
}

interface DirectiveCtx {
  key: string;
  value: string;
  policy: DirectivePolicy;
  currentOverrides?: Record<string, unknown>;
}

interface DirectiveResult {
  handled: boolean;
  overrides?: Record<string, unknown>;
  warnings?: string[];
}

interface SynthesisRequest {
  text: string;
  providerConfig: Record<string, unknown>;
  providerOverrides?: Record<string, unknown>;
  timeoutMs: number;
  target?: string;
}

interface SynthesisResult {
  audioBuffer: Buffer;
  outputFormat: FishAudioFormat;
  fileExtension: string;
  voiceCompatible: boolean;
}

export interface SpeechProviderPlugin {
  id: string;
  label: string;
  autoSelectOrder: number;
  models: readonly string[];
  parseDirectiveToken?: (ctx: DirectiveCtx) => DirectiveResult;
  isConfigured: (req: { providerConfig: Record<string, unknown> }) => boolean;
  listVoices: (req: { providerConfig?: Record<string, unknown>; apiKey?: string; baseUrl?: string }) => Promise<Array<{ id: string; name: string }>>;
  synthesize: (req: SynthesisRequest) => Promise<SynthesisResult>;
}

const PLUGIN_ID = "fish-audio-live";
const WS_TIMEOUT_MS = 8000;
const HTTP_TIMEOUT_MS = 30000;

function trim(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
function asNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
function clampLatency(v: unknown): FishAudioLatency {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return s === "normal" || s === "balanced" || s === "low" ? s : "low";
}
function clampModel(v: unknown): FishAudioModel {
  const s = trim(v);
  return s === "s2-pro" || s === "s1" ? s : "s2-pro";
}

function readConfig(raw: Record<string, unknown>): FishAudioProviderConfig {
  return normalizeConfig(raw);
}

function parseNumber(s: string): number | undefined {
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : undefined;
}

function parseDirectiveToken(ctx: DirectiveCtx): DirectiveResult {
  const overrides = { ...(ctx.currentOverrides ?? {}) };
  switch (ctx.key) {
    case "fishaudio_voice":
    case "fish_voice":
    case "fishaudio_voiceid": {
      if (!ctx.policy.allowVoice) return { handled: true };
      if (!isValidVoiceId(ctx.value)) {
        return { handled: true, warnings: [`invalid Fish Audio voice ID "${ctx.value}"`] };
      }
      return { handled: true, overrides: { ...overrides, voiceId: ctx.value } };
    }
    case "fishaudio_model":
    case "fish_model": {
      if (!ctx.policy.allowModelId) return { handled: true };
      return { handled: true, overrides: { ...overrides, model: ctx.value } };
    }
    case "fishaudio_speed":
    case "fish_speed": {
      if (!ctx.policy.allowVoiceSettings) return { handled: true };
      const v = parseNumber(ctx.value);
      if (v === undefined) return { handled: true, warnings: ["invalid speed value"] };
      if (v < 0.5 || v > 2.0) return { handled: true, warnings: [`speed must be in [0.5, 2.0], got ${v}`] };
      return { handled: true, overrides: { ...overrides, speed: v } };
    }
    case "fishaudio_latency":
    case "fish_latency": {
      if (!ctx.policy.allowVoiceSettings) return { handled: true };
      const s = ctx.value.trim().toLowerCase();
      if (s !== "normal" && s !== "balanced" && s !== "low") {
        return { handled: true, warnings: [`invalid Fish Audio latency "${ctx.value}"`] };
      }
      return { handled: true, overrides: { ...overrides, latency: s } };
    }
    case "fishaudio_temperature":
    case "fish_temperature": {
      if (!ctx.policy.allowVoiceSettings) return { handled: true };
      const v = parseNumber(ctx.value);
      if (v === undefined) return { handled: true, warnings: ["invalid temperature value"] };
      if (v < 0 || v > 1) return { handled: true, warnings: [`temperature must be in [0, 1], got ${v}`] };
      return { handled: true, overrides: { ...overrides, temperature: v } };
    }
    case "fishaudio_top_p":
    case "fish_top_p": {
      if (!ctx.policy.allowVoiceSettings) return { handled: true };
      const v = parseNumber(ctx.value);
      if (v === undefined) return { handled: true, warnings: ["invalid top_p value"] };
      if (v < 0 || v > 1) return { handled: true, warnings: [`top_p must be in [0, 1], got ${v}`] };
      return { handled: true, overrides: { ...overrides, topP: v } };
    }
    default:
      return { handled: false };
  }
}

export function buildFishAudioLiveSpeechProvider(): SpeechProviderPlugin {
  return {
    id: PLUGIN_ID,
    label: "Fish Audio Live",
    autoSelectOrder: 16,
    models: ["s2-pro", "s1"] as const,

    parseDirectiveToken,

    isConfigured: ({ providerConfig }) => {
      const cfg = readConfig(providerConfig);
      const hasKey = Boolean(cfg.apiKey || process.env.FISH_AUDIO_API_KEY);
      return hasKey && Boolean(cfg.voiceId);
    },

    listVoices: async (req) => {
      const cfg = req.providerConfig ? readConfig(req.providerConfig) : undefined;
      const apiKey = req.apiKey || cfg?.apiKey || process.env.FISH_AUDIO_API_KEY;
      if (!apiKey) throw new Error("Fish Audio API key missing");
      return listVoicesImpl({ apiKey, baseUrl: req.baseUrl ?? cfg?.baseUrl ?? "https://api.fish.audio" });
    },

    synthesize: async (req) => {
      const cfg = readConfig(req.providerConfig);
      const overrides = req.providerOverrides ?? {};
      const apiKey = cfg.apiKey || process.env.FISH_AUDIO_API_KEY;
      if (!apiKey) throw new Error("Fish Audio API key missing");

      const voiceId = trim(overrides.voiceId) ?? cfg.voiceId;
      if (!voiceId) {
        throw new Error(`Fish Audio: no voiceId configured. Set messages.tts.providers.${PLUGIN_ID}.voiceId`);
      }

      const useOpus = req.target === "voice-note" || req.target === "audio-file";
      const format: FishAudioFormat = useOpus ? "opus" : "mp3";

      const merged = {
        text: req.text,
        apiKey,
        baseUrl: cfg.baseUrl,
        referenceId: voiceId,
        model: clampModel(overrides.model ?? cfg.model),
        format,
        latency: clampLatency(overrides.latency ?? cfg.latency),
        speed: asNumber(overrides.speed) ?? cfg.speed,
        temperature: asNumber(overrides.temperature) ?? cfg.temperature,
        topP: asNumber(overrides.topP) ?? cfg.topP,
      };

      let audioBuffer: Buffer;

      if (cfg.transport === "http") {
        audioBuffer = await synthesizeViaHttp({ ...merged, timeoutMs: HTTP_TIMEOUT_MS });
      } else {
        try {
          audioBuffer = await synthesizeViaWebSocket(
            { ...merged, timeoutMs: WS_TIMEOUT_MS },
            { WebSocket: WS as unknown as new (url: string, opts: { headers: Record<string, string> }) => any },
          );
        } catch (wsErr) {
          if (cfg.transport === "websocket") throw wsErr;
          audioBuffer = await synthesizeViaHttp({ ...merged, timeoutMs: HTTP_TIMEOUT_MS });
        }
      }

      return {
        audioBuffer,
        outputFormat: format,
        fileExtension: useOpus ? ".opus" : ".mp3",
        voiceCompatible: useOpus,
      };
    },
  };
}
