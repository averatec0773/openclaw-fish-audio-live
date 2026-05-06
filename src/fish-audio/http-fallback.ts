import type {
  FishAudioFormat,
  FishAudioLatency,
  FishAudioModel,
} from "./types.js";

export interface HttpSynthesisParams {
  text: string;
  apiKey: string;
  baseUrl: string;
  referenceId: string;
  model: FishAudioModel;
  format: FishAudioFormat;
  latency?: FishAudioLatency;
  speed?: number;
  temperature?: number;
  topP?: number;
  timeoutMs: number;
}

export async function synthesizeViaHttp(params: HttpSynthesisParams): Promise<Buffer> {
  if (!params.text.trim()) throw new Error("Fish Audio TTS: empty text");
  if (!params.referenceId.trim()) throw new Error("Fish Audio TTS: missing reference_id");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs);

  try {
    const url = `${params.baseUrl}/v1/tts`;
    const body: Record<string, unknown> = {
      text: params.text,
      reference_id: params.referenceId,
      format: params.format,
    };
    if (params.latency && params.latency !== "normal") body.latency = params.latency;
    if (params.speed !== undefined) body.prosody = { speed: params.speed };
    if (params.temperature !== undefined) body.temperature = params.temperature;
    if (params.topP !== undefined) body.top_p = params.topP;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
        model: params.model,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      let detail = "";
      try {
        const t = await res.text();
        detail = t.length > 500 ? `: ${t.slice(0, 500)}…` : (t ? `: ${t}` : "");
      } catch {
        // ignore body read failure
      }
      throw new Error(`Fish Audio API error (${res.status})${detail}`);
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) throw new Error("Fish Audio TTS: empty audio response");
    return buf;
  } finally {
    clearTimeout(timeout);
  }
}
