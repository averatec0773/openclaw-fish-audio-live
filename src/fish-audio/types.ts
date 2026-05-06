export type FishAudioModel = "s2-pro" | "s1";
export type FishAudioLatency = "normal" | "balanced" | "low";
export type FishAudioFormat = "mp3" | "opus" | "wav" | "pcm";
export type FishAudioTransport = "auto" | "websocket" | "http";

export interface FishAudioProviderConfig {
  apiKey: string;
  baseUrl: string;
  voiceId: string;
  model: FishAudioModel;
  latency: FishAudioLatency;
  speed?: number;
  temperature?: number;
  topP?: number;
  transport: FishAudioTransport;
}

export interface StartEventBody {
  text: string;
  reference_id: string;
  format: FishAudioFormat;
  latency?: FishAudioLatency;
  chunk_length?: number;
  prosody?: { speed?: number };
  temperature?: number;
  top_p?: number;
}

export type StartEvent = { event: "start"; request: StartEventBody };
export type TextEvent = { event: "text"; text: string };
export type FlushEvent = { event: "flush" };
export type StopEvent = { event: "stop" };
export type ClientEvent = StartEvent | TextEvent | FlushEvent | StopEvent;

export interface AudioEvent { event: "audio"; audio: string }
export interface FinishEvent { event: "finish"; reason: "stop" | "error"; message?: string }
export type ServerEvent = AudioEvent | FinishEvent;

export interface VoiceItem { id: string; name: string }
