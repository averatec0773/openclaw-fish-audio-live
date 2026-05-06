import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import { synthesizeViaWebSocket } from "../../src/fish-audio/websocket-live.js";

class MockWS extends EventEmitter {
  static instances: MockWS[] = [];
  url: string;
  options: any;
  sent: string[] = [];
  readyState = 0;

  constructor(url: string, options: any) {
    super();
    this.url = url;
    this.options = options;
    MockWS.instances.push(this);
  }
  send(data: string) { this.sent.push(data); }
  close() { this.readyState = 3; this.emit("close", 1000, Buffer.alloc(0)); }
  open() { this.readyState = 1; this.emit("open"); }
  recvJson(o: unknown) { this.emit("message", Buffer.from(JSON.stringify(o))); }
  fail(err: Error) { this.emit("error", err); }
  remoteClose(code = 1006) { this.emit("close", code, Buffer.alloc(0)); }
}

const baseParams = {
  text: "hi",
  apiKey: "k",
  baseUrl: "https://api.fish.audio",
  referenceId: "abc",
  model: "s2-pro" as const,
  format: "mp3" as const,
  latency: "low" as const,
  timeoutMs: 5000,
};

const tick = () => new Promise<void>((r) => setImmediate(r));

describe("synthesizeViaWebSocket", () => {
  it("connects to wss://, sends start/text/stop, collects audio chunks, returns concatenated buffer", async () => {
    MockWS.instances = [];
    const promise = synthesizeViaWebSocket(baseParams, { WebSocket: MockWS as any });
    await tick();

    expect(MockWS.instances).toHaveLength(1);
    const ws = MockWS.instances[0];
    expect(ws.url).toBe("wss://api.fish.audio/v1/tts/live");
    expect(ws.options.headers.Authorization).toBe("Bearer k");
    expect(ws.options.headers.model).toBe("s2-pro");

    ws.open();
    await tick();

    expect(ws.sent).toHaveLength(3);
    const start = JSON.parse(ws.sent[0]);
    expect(start.event).toBe("start");
    expect(start.request.reference_id).toBe("abc");
    expect(start.request.format).toBe("mp3");
    expect(start.request.latency).toBe("low");
    expect(JSON.parse(ws.sent[1])).toEqual({ event: "text", text: "hi" });
    expect(JSON.parse(ws.sent[2])).toEqual({ event: "stop" });

    ws.recvJson({ event: "audio", audio: Buffer.from("AB").toString("base64") });
    ws.recvJson({ event: "audio", audio: Buffer.from("CD").toString("base64") });
    ws.recvJson({ event: "finish", reason: "stop" });

    const buf = await promise;
    expect(buf.toString()).toBe("ABCD");
  });

  it("omits latency from start.request when value is 'normal'", async () => {
    MockWS.instances = [];
    const p = synthesizeViaWebSocket({ ...baseParams, latency: "normal" }, { WebSocket: MockWS as any });
    await tick();
    const ws = MockWS.instances[0];
    ws.open();
    await tick();
    const start = JSON.parse(ws.sent[0]);
    expect(start.request.latency).toBeUndefined();

    ws.recvJson({ event: "audio", audio: Buffer.from("X").toString("base64") });
    ws.recvJson({ event: "finish", reason: "stop" });
    await p;
  });

  it("rejects on FinishEvent reason='error' with the server message", async () => {
    MockWS.instances = [];
    const p = synthesizeViaWebSocket(baseParams, { WebSocket: MockWS as any });
    await tick();
    const ws = MockWS.instances[0];
    ws.open();
    await tick();
    ws.recvJson({ event: "finish", reason: "error", message: "boom" });
    await expect(p).rejects.toThrow(/boom/);
  });

  it("rejects when WebSocket emits error before finish", async () => {
    MockWS.instances = [];
    const p = synthesizeViaWebSocket(baseParams, { WebSocket: MockWS as any });
    await tick();
    const ws = MockWS.instances[0];
    ws.fail(new Error("ECONNREFUSED"));
    await expect(p).rejects.toThrow(/connection error.*ECONNREFUSED/);
  });

  it("rejects when WebSocket closes before finish", async () => {
    MockWS.instances = [];
    const p = synthesizeViaWebSocket(baseParams, { WebSocket: MockWS as any });
    await tick();
    MockWS.instances[0].remoteClose();
    await expect(p).rejects.toThrow(/closed before finish/);
  });

  it("rejects on timeout", async () => {
    vi.useFakeTimers();
    MockWS.instances = [];
    const p = synthesizeViaWebSocket({ ...baseParams, timeoutMs: 100 }, { WebSocket: MockWS as any });
    vi.advanceTimersByTime(150);
    await expect(p).rejects.toThrow(/timeout/);
    vi.useRealTimers();
  });

  it("converts http baseUrl to ws and https baseUrl to wss", async () => {
    MockWS.instances = [];
    void synthesizeViaWebSocket({ ...baseParams, baseUrl: "http://localhost:8080" }, { WebSocket: MockWS as any });
    await tick();
    expect(MockWS.instances[0].url).toBe("ws://localhost:8080/v1/tts/live");
  });

  it("rejects on empty audio (finish stop with no audio chunks)", async () => {
    MockWS.instances = [];
    const p = synthesizeViaWebSocket(baseParams, { WebSocket: MockWS as any });
    await tick();
    const ws = MockWS.instances[0];
    ws.open();
    await tick();
    ws.recvJson({ event: "finish", reason: "stop" });
    await expect(p).rejects.toThrow(/empty audio/);
  });
});
