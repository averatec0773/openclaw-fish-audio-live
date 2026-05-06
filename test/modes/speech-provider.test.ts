import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/fish-audio/websocket-live.js", () => ({
  synthesizeViaWebSocket: vi.fn(),
}));
vi.mock("../../src/fish-audio/http-fallback.js", () => ({
  synthesizeViaHttp: vi.fn(),
}));
vi.mock("../../src/fish-audio/voice-list.js", () => ({
  listVoices: vi.fn(),
}));

import { buildFishAudioSpeechProvider } from "../../src/modes/speech-provider.js";
import { synthesizeViaWebSocket } from "../../src/fish-audio/websocket-live.js";
import { synthesizeViaHttp } from "../../src/fish-audio/http-fallback.js";

const wsFn = synthesizeViaWebSocket as unknown as ReturnType<typeof vi.fn>;
const httpFn = synthesizeViaHttp as unknown as ReturnType<typeof vi.fn>;

const VALID_VOICE = "abcdefghij1234567890";

const baseProviderConfig = {
  apiKey: "k",
  voiceId: VALID_VOICE,
  baseUrl: "https://api.fish.audio",
  model: "s2-pro",
  latency: "low",
  transport: "auto",
};

beforeEach(() => {
  wsFn.mockReset();
  httpFn.mockReset();
});

describe("buildFishAudioSpeechProvider", () => {
  it("exposes id, label, and supported models", () => {
    const p = buildFishAudioSpeechProvider();
    expect(p.id).toBe("fishaudio");
    expect(p.label).toMatch(/Fish Audio/i);
    expect(p.models).toEqual(["s2-pro", "s1"]);
  });

  it("isConfigured returns false when apiKey or voiceId missing", () => {
    const p = buildFishAudioSpeechProvider();
    expect(p.isConfigured({ providerConfig: {} })).toBe(false);
    expect(p.isConfigured({ providerConfig: { apiKey: "k" } })).toBe(false);
    expect(p.isConfigured({ providerConfig: { voiceId: VALID_VOICE } })).toBe(false);
    expect(p.isConfigured({ providerConfig: { apiKey: "k", voiceId: VALID_VOICE } })).toBe(true);
  });

  it("synthesize uses WebSocket by default (transport=auto)", async () => {
    wsFn.mockResolvedValueOnce(Buffer.from("wsbuf"));
    const p = buildFishAudioSpeechProvider();
    const out = await p.synthesize({
      text: "hi",
      providerConfig: baseProviderConfig,
      providerOverrides: {},
      timeoutMs: 30000,
      target: undefined,
    });
    expect(wsFn).toHaveBeenCalledTimes(1);
    expect(httpFn).not.toHaveBeenCalled();
    expect(out.audioBuffer).toEqual(Buffer.from("wsbuf"));
    expect(out.outputFormat).toBe("mp3");
    expect(out.fileExtension).toBe(".mp3");
  });

  it("synthesize falls back to HTTP when WebSocket throws and transport=auto", async () => {
    wsFn.mockRejectedValueOnce(new Error("ws unreachable"));
    httpFn.mockResolvedValueOnce(Buffer.from("httpbuf"));
    const p = buildFishAudioSpeechProvider();
    const out = await p.synthesize({
      text: "hi",
      providerConfig: baseProviderConfig,
      providerOverrides: {},
      timeoutMs: 30000,
      target: undefined,
    });
    expect(wsFn).toHaveBeenCalledTimes(1);
    expect(httpFn).toHaveBeenCalledTimes(1);
    expect(out.audioBuffer).toEqual(Buffer.from("httpbuf"));
  });

  it("synthesize does NOT fall back when transport=websocket", async () => {
    wsFn.mockRejectedValueOnce(new Error("nope"));
    const p = buildFishAudioSpeechProvider();
    await expect(p.synthesize({
      text: "hi",
      providerConfig: { ...baseProviderConfig, transport: "websocket" },
      providerOverrides: {},
      timeoutMs: 30000,
      target: undefined,
    })).rejects.toThrow(/nope/);
    expect(httpFn).not.toHaveBeenCalled();
  });

  it("synthesize forces HTTP when transport=http", async () => {
    httpFn.mockResolvedValueOnce(Buffer.from("h"));
    const p = buildFishAudioSpeechProvider();
    await p.synthesize({
      text: "hi",
      providerConfig: { ...baseProviderConfig, transport: "http" },
      providerOverrides: {},
      timeoutMs: 30000,
      target: undefined,
    });
    expect(wsFn).not.toHaveBeenCalled();
    expect(httpFn).toHaveBeenCalledTimes(1);
  });

  it("synthesize switches to opus when target=voice-note", async () => {
    wsFn.mockResolvedValueOnce(Buffer.from("o"));
    const p = buildFishAudioSpeechProvider();
    const out = await p.synthesize({
      text: "hi",
      providerConfig: baseProviderConfig,
      providerOverrides: {},
      timeoutMs: 30000,
      target: "voice-note",
    });
    expect(out.outputFormat).toBe("opus");
    expect(out.fileExtension).toBe(".opus");
    expect(out.voiceCompatible).toBe(true);
    expect(wsFn.mock.calls[0][0].format).toBe("opus");
  });

  it("synthesize switches to opus when target=audio-file (Discord voice channel)", async () => {
    wsFn.mockResolvedValueOnce(Buffer.from("o"));
    const p = buildFishAudioSpeechProvider();
    const out = await p.synthesize({
      text: "hi",
      providerConfig: baseProviderConfig,
      providerOverrides: {},
      timeoutMs: 30000,
      target: "audio-file",
    });
    expect(out.outputFormat).toBe("opus");
    expect(out.fileExtension).toBe(".opus");
    expect(out.voiceCompatible).toBe(true);
    expect(wsFn.mock.calls[0][0].format).toBe("opus");
  });

  it("synthesize throws when no apiKey configured (and FISH_AUDIO_API_KEY not set)", async () => {
    const p = buildFishAudioSpeechProvider();
    const originalEnv = process.env.FISH_AUDIO_API_KEY;
    delete process.env.FISH_AUDIO_API_KEY;
    try {
      await expect(p.synthesize({
        text: "hi",
        providerConfig: { ...baseProviderConfig, apiKey: "" },
        providerOverrides: {},
        timeoutMs: 30000,
        target: undefined,
      })).rejects.toThrow(/api key/i);
    } finally {
      if (originalEnv !== undefined) process.env.FISH_AUDIO_API_KEY = originalEnv;
    }
  });

  it("synthesize throws when no voiceId configured", async () => {
    const p = buildFishAudioSpeechProvider();
    await expect(p.synthesize({
      text: "hi",
      providerConfig: { ...baseProviderConfig, voiceId: "" },
      providerOverrides: {},
      timeoutMs: 30000,
      target: undefined,
    })).rejects.toThrow(/voiceId/);
  });

  it("synthesize honors providerOverrides.voiceId", async () => {
    wsFn.mockResolvedValueOnce(Buffer.from("x"));
    const p = buildFishAudioSpeechProvider();
    await p.synthesize({
      text: "hi",
      providerConfig: baseProviderConfig,
      providerOverrides: { voiceId: "z".repeat(20) },
      timeoutMs: 30000,
      target: undefined,
    });
    expect(wsFn.mock.calls[0][0].referenceId).toBe("z".repeat(20));
  });
});

describe("parseDirectiveToken", () => {
  const allowAll = { allowVoice: true, allowModelId: true, allowVoiceSettings: true };

  it("handles fish_voice with valid id", () => {
    const p = buildFishAudioSpeechProvider();
    const result = p.parseDirectiveToken!({
      key: "fish_voice",
      value: VALID_VOICE,
      policy: allowAll,
      currentOverrides: {},
    });
    expect(result.handled).toBe(true);
    expect(result.overrides).toEqual({ voiceId: VALID_VOICE });
  });

  it("rejects fish_voice with invalid id (warn, no override)", () => {
    const p = buildFishAudioSpeechProvider();
    const result = p.parseDirectiveToken!({
      key: "fish_voice", value: "bad", policy: allowAll, currentOverrides: {},
    });
    expect(result.handled).toBe(true);
    expect(result.overrides).toBeUndefined();
    expect(result.warnings?.[0]).toMatch(/invalid/i);
  });

  it("handles fish_speed within range", () => {
    const p = buildFishAudioSpeechProvider();
    expect(p.parseDirectiveToken!({
      key: "fish_speed", value: "1.5", policy: allowAll, currentOverrides: {},
    }).overrides).toEqual({ speed: 1.5 });
  });

  it("warns on fish_speed out of range", () => {
    const p = buildFishAudioSpeechProvider();
    const r = p.parseDirectiveToken!({
      key: "fish_speed", value: "9", policy: allowAll, currentOverrides: {},
    });
    expect(r.handled).toBe(true);
    expect(r.warnings?.[0]).toMatch(/speed/);
  });

  it("ignores unknown keys", () => {
    const p = buildFishAudioSpeechProvider();
    expect(p.parseDirectiveToken!({
      key: "openai_voice", value: "alloy", policy: allowAll, currentOverrides: {},
    }).handled).toBe(false);
  });
});
