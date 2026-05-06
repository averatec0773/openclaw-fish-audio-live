import type {
  FishAudioFormat,
  FishAudioLatency,
  FishAudioModel,
  ServerEvent,
} from "./types.js";

export interface WsSynthesisParams {
  text: string;
  apiKey: string;
  baseUrl: string;
  referenceId: string;
  model: FishAudioModel;
  format: FishAudioFormat;
  latency: FishAudioLatency;
  speed?: number;
  temperature?: number;
  topP?: number;
  timeoutMs: number;
}

interface WebSocketLike {
  on(event: "open", fn: () => void): void;
  on(event: "message", fn: (data: Buffer | ArrayBuffer | string) => void): void;
  on(event: "error", fn: (err: Error) => void): void;
  on(event: "close", fn: (code: number, reason: Buffer) => void): void;
  send(data: string): void;
  close(code?: number): void;
}

interface WebSocketConstructor {
  new (url: string, options: { headers: Record<string, string> }): WebSocketLike;
}

export interface WsDeps {
  WebSocket: WebSocketConstructor;
}

export async function synthesizeViaWebSocket(
  params: WsSynthesisParams,
  deps: WsDeps,
): Promise<Buffer> {
  if (!params.text.trim()) throw new Error("Fish Audio TTS: empty text");
  if (!params.referenceId.trim()) throw new Error("Fish Audio TTS: missing reference_id");

  const wsUrl = params.baseUrl.replace(/^http/i, "ws") + "/v1/tts/live";

  return new Promise<Buffer>((resolve, reject) => {
    const ws = new deps.WebSocket(wsUrl, {
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        model: params.model,
      },
    });

    const chunks: Buffer[] = [];
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch { /* ignore */ }
      reject(new Error(`Fish Audio WS: timeout after ${params.timeoutMs}ms`));
    }, params.timeoutMs);

    function settleResolve(v: Buffer) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try { ws.close(); } catch { /* ignore */ }
      resolve(v);
    }
    function settleReject(err: Error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try { ws.close(); } catch { /* ignore */ }
      reject(err);
    }

    ws.on("open", () => {
      const startBody: Record<string, unknown> = {
        text: "",
        reference_id: params.referenceId,
        format: params.format,
      };
      if (params.latency !== "normal") startBody.latency = params.latency;
      if (params.speed !== undefined) startBody.prosody = { speed: params.speed };
      if (params.temperature !== undefined) startBody.temperature = params.temperature;
      if (params.topP !== undefined) startBody.top_p = params.topP;

      try {
        ws.send(JSON.stringify({ event: "start", request: startBody }));
        ws.send(JSON.stringify({ event: "text", text: params.text }));
        ws.send(JSON.stringify({ event: "stop" }));
      } catch (err) {
        settleReject(new Error(`Fish Audio WS send failed: ${(err as Error).message}`));
      }
    });

    ws.on("message", (data: Buffer | ArrayBuffer | string) => {
      let evt: ServerEvent;
      try {
        const text = typeof data === "string"
          ? data
          : Buffer.isBuffer(data) ? data.toString("utf8") : Buffer.from(data).toString("utf8");
        evt = JSON.parse(text) as ServerEvent;
      } catch {
        return; // ignore non-JSON frames
      }
      if (evt.event === "audio") {
        chunks.push(Buffer.from(evt.audio, "base64"));
      } else if (evt.event === "finish") {
        if (evt.reason === "stop") {
          const total = Buffer.concat(chunks);
          if (total.length === 0) {
            settleReject(new Error("Fish Audio WS: empty audio"));
          } else {
            settleResolve(total);
          }
        } else {
          settleReject(new Error(`Fish Audio WS error: ${evt.message ?? "unknown"}`));
        }
      }
    });

    ws.on("error", (err: Error) => {
      settleReject(new Error(`Fish Audio WS connection error: ${err.message}`));
    });

    ws.on("close", () => {
      settleReject(new Error("Fish Audio WS closed before finish"));
    });
  });
}
