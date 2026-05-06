import { describe, it, expect } from "vitest";
import {
  normalizeConfig,
  isValidVoiceId,
  normalizeBaseUrl,
  DEFAULT_BASE_URL,
} from "../../src/fish-audio/config.js";

describe("normalizeConfig", () => {
  it("applies defaults for empty input", () => {
    const cfg = normalizeConfig({});
    expect(cfg.apiKey).toBe("");
    expect(cfg.voiceId).toBe("");
    expect(cfg.baseUrl).toBe(DEFAULT_BASE_URL);
    expect(cfg.model).toBe("s2-pro");
    expect(cfg.latency).toBe("low");
    expect(cfg.transport).toBe("auto");
  });

  it("preserves apiKey and voiceId when provided", () => {
    const cfg = normalizeConfig({ apiKey: "k", voiceId: "abcdefghij1234567890" });
    expect(cfg.apiKey).toBe("k");
    expect(cfg.voiceId).toBe("abcdefghij1234567890");
  });

  it("rejects invalid latency values and falls back to default 'low'", () => {
    expect(normalizeConfig({ latency: "wat" }).latency).toBe("low");
    expect(normalizeConfig({ latency: "BALANCED" }).latency).toBe("balanced");
  });

  it("rejects invalid model values and falls back to default 's2-pro'", () => {
    expect(normalizeConfig({ model: "garbage" }).model).toBe("s2-pro");
    expect(normalizeConfig({ model: "s1" }).model).toBe("s1");
  });

  it("normalizes transport: only websocket/http kept; otherwise auto", () => {
    expect(normalizeConfig({ transport: "websocket" }).transport).toBe("websocket");
    expect(normalizeConfig({ transport: "http" }).transport).toBe("http");
    expect(normalizeConfig({ transport: "fancy" }).transport).toBe("auto");
  });

  it("validates speed/temperature/topP ranges (throws on out of range)", () => {
    expect(() => normalizeConfig({ speed: 5 })).toThrow(/speed/);
    expect(() => normalizeConfig({ speed: 0.1 })).toThrow(/speed/);
    expect(() => normalizeConfig({ temperature: 2 })).toThrow(/temperature/);
    expect(() => normalizeConfig({ topP: -1 })).toThrow(/topP/);
    expect(normalizeConfig({ speed: 1.2 }).speed).toBe(1.2);
  });
});

describe("normalizeBaseUrl", () => {
  it("returns default when empty", () => {
    expect(normalizeBaseUrl()).toBe(DEFAULT_BASE_URL);
    expect(normalizeBaseUrl("")).toBe(DEFAULT_BASE_URL);
    expect(normalizeBaseUrl("   ")).toBe(DEFAULT_BASE_URL);
  });
  it("trims whitespace and strips trailing slashes", () => {
    expect(normalizeBaseUrl(" https://example.com/// ")).toBe("https://example.com");
  });
});

describe("isValidVoiceId", () => {
  it("accepts 20–64 alphanumeric strings", () => {
    expect(isValidVoiceId("a".repeat(20))).toBe(true);
    expect(isValidVoiceId("a".repeat(64))).toBe(true);
    expect(isValidVoiceId("Abc123" + "x".repeat(20))).toBe(true);
  });
  it("rejects too short, too long, or non-alphanumeric", () => {
    expect(isValidVoiceId("short")).toBe(false);
    expect(isValidVoiceId("a".repeat(65))).toBe(false);
    expect(isValidVoiceId("path/traversal/abcdefghij")).toBe(false);
    expect(isValidVoiceId("has spaces inside aaaa")).toBe(false);
  });
});
