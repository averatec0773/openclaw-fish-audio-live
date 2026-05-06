import type {
  FishAudioProviderConfig,
  FishAudioLatency,
  FishAudioModel,
  FishAudioTransport,
} from "./types.js";

export const DEFAULT_BASE_URL = "https://api.fish.audio";
const VALID_LATENCY: readonly FishAudioLatency[] = ["normal", "balanced", "low"];
const VALID_MODEL: readonly FishAudioModel[] = ["s2-pro", "s1"];

function trimToString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function asNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function requireInRange(v: number, min: number, max: number, name: string): number {
  if (v < min || v > max) {
    throw new RangeError(`${name} must be in [${min}, ${max}], got ${v}`);
  }
  return v;
}

export function normalizeBaseUrl(s?: string): string {
  const t = s?.trim();
  if (!t) return DEFAULT_BASE_URL;
  return t.replace(/\/+$/, "");
}

export function isValidVoiceId(id: string): boolean {
  return /^[a-zA-Z0-9]{20,64}$/.test(id);
}

export function normalizeConfig(raw: Record<string, unknown>): FishAudioProviderConfig {
  const apiKey = trimToString(raw.apiKey) ?? "";
  const voiceId = trimToString(raw.voiceId) ?? "";
  const baseUrl = normalizeBaseUrl(trimToString(raw.baseUrl));

  const rawModel = trimToString(raw.model);
  const model: FishAudioModel = (rawModel && (VALID_MODEL as readonly string[]).includes(rawModel))
    ? (rawModel as FishAudioModel)
    : "s2-pro";

  const rawLatency = typeof raw.latency === "string" ? raw.latency.trim().toLowerCase() : "";
  const latency: FishAudioLatency = (VALID_LATENCY as readonly string[]).includes(rawLatency)
    ? (rawLatency as FishAudioLatency)
    : "low";

  const rawTransport = trimToString(raw.transport);
  const transport: FishAudioTransport =
    rawTransport === "websocket" || rawTransport === "http" ? rawTransport : "auto";

  const speed = asNumber(raw.speed);
  if (speed !== undefined) requireInRange(speed, 0.5, 2.0, "speed");
  const temperature = asNumber(raw.temperature);
  if (temperature !== undefined) requireInRange(temperature, 0, 1, "temperature");
  const topP = asNumber(raw.topP);
  if (topP !== undefined) requireInRange(topP, 0, 1, "topP");

  return { apiKey, baseUrl, voiceId, model, latency, speed, temperature, topP, transport };
}
