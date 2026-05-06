import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { synthesizeViaHttp } from "../../src/fish-audio/http-fallback.js";

describe("synthesizeViaHttp", () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  function ok(buf: Buffer | string = Buffer.from("audio-bytes")) {
    return new Response(typeof buf === "string" ? Buffer.from(buf) : buf, { status: 200 });
  }

  it("posts to <baseUrl>/v1/tts with correct headers and body shape", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedInit = init;
      return ok();
    }) as unknown as typeof globalThis.fetch;

    const buf = await synthesizeViaHttp({
      text: "hello",
      apiKey: "k",
      baseUrl: "https://api.fish.audio",
      referenceId: "abc",
      model: "s2-pro",
      format: "mp3",
      latency: "low",
      timeoutMs: 5000,
    });

    expect(buf).toEqual(Buffer.from("audio-bytes"));
    expect(capturedUrl).toBe("https://api.fish.audio/v1/tts");
    expect(capturedInit?.method).toBe("POST");
    const headers = new Headers(capturedInit?.headers);
    expect(headers.get("Authorization")).toBe("Bearer k");
    expect(headers.get("model")).toBe("s2-pro");
    expect(headers.get("Content-Type")).toBe("application/json");
    const body = JSON.parse(capturedInit?.body as string);
    expect(body.text).toBe("hello");
    expect(body.reference_id).toBe("abc");
    expect(body.format).toBe("mp3");
    expect(body.latency).toBe("low");
  });

  it("omits latency from body when value is 'normal'", async () => {
    let body: any;
    globalThis.fetch = vi.fn(async (_url, init) => {
      body = JSON.parse((init as RequestInit).body as string);
      return ok();
    }) as unknown as typeof globalThis.fetch;
    await synthesizeViaHttp({
      text: "hi", apiKey: "k", baseUrl: "https://api.fish.audio",
      referenceId: "abc", model: "s2-pro", format: "mp3", latency: "normal", timeoutMs: 1000,
    });
    expect(body.latency).toBeUndefined();
  });

  it("includes prosody.speed, temperature, top_p when provided", async () => {
    let body: any;
    globalThis.fetch = vi.fn(async (_u, init) => {
      body = JSON.parse((init as RequestInit).body as string);
      return ok();
    }) as unknown as typeof globalThis.fetch;
    await synthesizeViaHttp({
      text: "hi", apiKey: "k", baseUrl: "https://api.fish.audio",
      referenceId: "abc", model: "s2-pro", format: "mp3",
      speed: 1.2, temperature: 0.5, topP: 0.8, timeoutMs: 1000,
    });
    expect(body.prosody).toEqual({ speed: 1.2 });
    expect(body.temperature).toBe(0.5);
    expect(body.top_p).toBe(0.8);
  });

  it("throws on non-2xx with a truncated error body", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response("e".repeat(2000), { status: 500 }),
    ) as unknown as typeof globalThis.fetch;
    await expect(synthesizeViaHttp({
      text: "hi", apiKey: "k", baseUrl: "https://api.fish.audio",
      referenceId: "abc", model: "s2-pro", format: "mp3", timeoutMs: 1000,
    })).rejects.toThrow(/Fish Audio API error \(500\)/);
  });

  it("throws on empty audio response", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(Buffer.alloc(0), { status: 200 }),
    ) as unknown as typeof globalThis.fetch;
    await expect(synthesizeViaHttp({
      text: "hi", apiKey: "k", baseUrl: "https://api.fish.audio",
      referenceId: "abc", model: "s2-pro", format: "mp3", timeoutMs: 1000,
    })).rejects.toThrow(/empty/);
  });

  it("throws on empty text input", async () => {
    await expect(synthesizeViaHttp({
      text: "   ", apiKey: "k", baseUrl: "https://api.fish.audio",
      referenceId: "abc", model: "s2-pro", format: "mp3", timeoutMs: 1000,
    })).rejects.toThrow(/empty text/);
  });

  it("throws on missing referenceId", async () => {
    await expect(synthesizeViaHttp({
      text: "hi", apiKey: "k", baseUrl: "https://api.fish.audio",
      referenceId: "", model: "s2-pro", format: "mp3", timeoutMs: 1000,
    })).rejects.toThrow(/reference_id/);
  });
});
