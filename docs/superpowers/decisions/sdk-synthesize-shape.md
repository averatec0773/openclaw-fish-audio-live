# SDK SpeechProvider.synthesize shape

**Date:** 2026-05-06
**Source:** `node_modules/openclaw/dist/plugin-sdk/src/plugins/types.d.ts`

## Signature found

From `node_modules/openclaw/dist/plugin-sdk/src/plugins/types.d.ts` lines 1424–1440:

```typescript
export type SpeechProviderPlugin = {
    id: SpeechProviderId;
    label: string;
    aliases?: string[];
    autoSelectOrder?: number;
    models?: readonly string[];
    voices?: readonly string[];
    resolveConfig?: (ctx: SpeechProviderResolveConfigContext) => SpeechProviderConfig;
    parseDirectiveToken?: (ctx: SpeechDirectiveTokenParseContext) => SpeechDirectiveTokenParseResult;
    resolveTalkConfig?: (ctx: SpeechProviderResolveTalkConfigContext) => SpeechProviderConfig;
    resolveTalkOverrides?: (ctx: SpeechProviderResolveTalkOverridesContext) => SpeechProviderConfig | undefined;
    prepareSynthesis?: (ctx: SpeechProviderPrepareSynthesisContext) => SpeechProviderPreparedSynthesis | undefined | Promise<SpeechProviderPreparedSynthesis | undefined>;
    isConfigured: (ctx: SpeechProviderConfiguredContext) => boolean;
    synthesize: (req: SpeechSynthesisRequest) => Promise<SpeechSynthesisResult>;
    synthesizeTelephony?: (req: SpeechTelephonySynthesisRequest) => Promise<SpeechTelephonySynthesisResult>;
    listVoices?: (req: SpeechListVoicesRequest) => Promise<SpeechVoiceOption[]>;
};
```

From `node_modules/openclaw/dist/plugin-sdk/src/tts/provider-types.d.ts` lines 35–60:

```typescript
// Request type
export type SpeechSynthesisRequest = {
    text: string;
    cfg: OpenClawConfig;
    providerConfig: SpeechProviderConfig;
    target: SpeechSynthesisTarget;
    providerOverrides?: SpeechProviderOverrides;
    timeoutMs: number;
};

// Return type
export type SpeechSynthesisResult = {
    audioBuffer: Buffer;
    outputFormat: string;
    fileExtension: string;
    voiceCompatible: boolean;
};

// Telephony variant (optional)
export type SpeechTelephonySynthesisRequest = {
    text: string;
    cfg: OpenClawConfig;
    providerConfig: SpeechProviderConfig;
    providerOverrides?: SpeechProviderOverrides;
    timeoutMs: number;
};

export type SpeechTelephonySynthesisResult = {
    audioBuffer: Buffer;
    outputFormat: string;
    sampleRate: number;
};
```

## Streaming support

**BUFFERED.**

Evidence:
- `synthesize` returns `Promise<SpeechSynthesisResult>` where `SpeechSynthesisResult.audioBuffer` is a `Buffer` — a single in-memory blob, not an iterable or stream.
- No `synthesizeStream` method exists anywhere in the `SpeechProviderPlugin` interface.
- No chunk callback parameter in `SpeechSynthesisRequest` (the request has `text`, `cfg`, `providerConfig`, `target`, `providerOverrides`, `timeoutMs` — nothing streaming-related).
- A broad search for `AsyncIterable`, `onChunk`, `synthesizeStream` across all `dist/plugin-sdk/src/tts/*.d.ts` returned zero matches.
- The only `push` hit in the TTS types was on `directives.d.ts` line 11, which is unrelated (it refers to pushing text tokens into a directive parser, not audio chunks).

## Implications for Task 7

BUFFERED: Task 7 must collect **all** Fish.audio WebSocket Live audio chunks into a single `Buffer` before returning from `synthesize`. The WebSocket connection is opened, all `binary` frames are accumulated (e.g. via `Buffer.concat`), the connection is closed (or drained on the `"end"` event), and the completed buffer is returned as `SpeechSynthesisResult.audioBuffer`.

The WebSocket Live client (Task 5) does not need to change — the difference is only that Task 7 awaits full receipt of all audio before resolving the `Promise`. No piping or backpressure wiring is needed on the SDK side.

## Other relevant SDK exports

All of these are accessible from `"openclaw/plugin-sdk/speech-core"` (the public barrel at `dist/plugin-sdk/speech-core.d.ts` → `dist/plugin-sdk/src/plugin-sdk/speech-core.d.ts`):

| Export | Import path |
|--------|-------------|
| `assertOkOrThrowProviderError` | `"openclaw/plugin-sdk/speech-core"` |
| `createProviderHttpError` | `"openclaw/plugin-sdk/speech-core"` |
| `readResponseTextLimited` | `"openclaw/plugin-sdk/speech-core"` |
| `SpeechVoiceOption` (type) | `"openclaw/plugin-sdk/speech-core"` |
| `SpeechSynthesisRequest` (type) | `"openclaw/plugin-sdk/speech-core"` |
| `SpeechProviderPlugin` (type) | `"openclaw/plugin-sdk/speech-core"` |
| `normalizeResolvedSecretInputString` | `"openclaw/plugin-sdk/secret-input"` (via `dist/plugin-sdk/src/plugin-sdk/secret-input.d.ts`) |

`normalizeResolvedSecretInputString` is **not** re-exported from the `speech-core` barrel; Task 7 should import it from `"openclaw/plugin-sdk/secret-input"` or `"openclaw/plugin-sdk/secret-input-runtime"`.
