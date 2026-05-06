import type { VoiceItem } from "./types.js";

interface RawItem { _id?: string; title?: string }
interface ApiResponse { total?: number; items?: RawItem[] }

const PAGE_SIZE = 100;

export interface ListVoicesParams {
  apiKey: string;
  baseUrl: string;
}

export async function listVoices(params: ListVoicesParams): Promise<VoiceItem[]> {
  const headers = { Authorization: `Bearer ${params.apiKey}` };

  const own: RawItem[] = [];
  for (let page = 1; ; page++) {
    const url = `${params.baseUrl}/model?type=tts&self=true&page_size=${PAGE_SIZE}&page_number=${page}`;
    const r = await fetch(url, { headers });
    if (!r.ok) throw new Error(`Fish Audio voices API error (${r.status})`);
    const j = (await r.json()) as ApiResponse;
    const items = Array.isArray(j.items) ? j.items : [];
    if (items.length === 0) break;
    own.push(...items);
    if ((typeof j.total === "number" && own.length >= j.total) || items.length < PAGE_SIZE) break;
  }

  let popular: RawItem[] = [];
  try {
    const url = `${params.baseUrl}/model?type=tts&sort_by=score&page_size=${PAGE_SIZE}&page_number=1`;
    const r = await fetch(url, { headers });
    if (r.ok) {
      const j = (await r.json()) as ApiResponse;
      popular = Array.isArray(j.items) ? j.items : [];
    }
  } catch {
    // non-fatal: still return user's own voices
  }

  const seen = new Set<string>();
  const out: VoiceItem[] = [];
  for (const v of [...own, ...popular]) {
    const id = v._id?.trim() ?? "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: v.title?.trim() || id });
  }
  return out;
}
