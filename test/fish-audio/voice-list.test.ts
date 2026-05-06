import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { listVoices } from "../../src/fish-audio/voice-list.js";

describe("listVoices", () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  function jsonResponse(body: unknown) {
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }

  it("paginates self voices and merges popular community voices, deduplicating by id", async () => {
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (u: string | URL | Request) => {
      const url = String(u);
      calls.push(url);
      if (url.includes("self=true") && url.includes("page_number=1")) {
        return jsonResponse({ total: 2, items: [{ _id: "v1", title: "A" }, { _id: "v2", title: "B" }] });
      }
      if (url.includes("sort_by=score")) {
        return jsonResponse({ items: [{ _id: "v2", title: "B-popular" }, { _id: "v3", title: "C" }] });
      }
      return jsonResponse({ items: [] });
    }) as unknown as typeof globalThis.fetch;

    const out = await listVoices({ apiKey: "k", baseUrl: "https://api.fish.audio" });
    expect(out).toEqual([
      { id: "v1", name: "A" },
      { id: "v2", name: "B" },          // dedup wins to first occurrence
      { id: "v3", name: "C" },
    ]);
    expect(calls[0]).toContain("/model?type=tts&self=true&page_size=100&page_number=1");
  });

  it("falls back to id when title is missing", async () => {
    globalThis.fetch = vi.fn(async (u: string | URL | Request) => {
      const url = String(u);
      if (url.includes("self=true")) {
        return jsonResponse({ items: [{ _id: "vX" }] });
      }
      return jsonResponse({ items: [] });
    }) as unknown as typeof globalThis.fetch;
    const out = await listVoices({ apiKey: "k", baseUrl: "https://api.fish.audio" });
    expect(out).toEqual([{ id: "vX", name: "vX" }]);
  });

  it("throws if self-voices endpoint returns non-2xx", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response("nope", { status: 401 })
    ) as unknown as typeof globalThis.fetch;
    await expect(listVoices({ apiKey: "k", baseUrl: "https://api.fish.audio" }))
      .rejects.toThrow(/voices API error \(401\)/);
  });

  it("treats popular endpoint failure as non-fatal", async () => {
    globalThis.fetch = vi.fn(async (u: string | URL | Request) => {
      const url = String(u);
      if (url.includes("self=true")) {
        return jsonResponse({ items: [{ _id: "v1", title: "A" }] });
      }
      return new Response("oops", { status: 500 });
    }) as unknown as typeof globalThis.fetch;
    const out = await listVoices({ apiKey: "k", baseUrl: "https://api.fish.audio" });
    expect(out).toEqual([{ id: "v1", name: "A" }]);
  });
});
