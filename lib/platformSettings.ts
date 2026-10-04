// RANA-wide settings chosen in HQ (table platform_settings: key → jsonb value). Server only.
import { sb } from "./db";

const cache = new Map<string, { at: number; v: any }>();

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 20_000) return hit.v as T;
  try {
    const rows = await sb<{ value: any }[]>(`/platform_settings?key=eq.${encodeURIComponent(key)}&select=value`);
    const v = rows?.[0]?.value ?? fallback;
    cache.set(key, { at: Date.now(), v });
    return v as T;
  } catch (e: any) {
    console.error("[settings] read", key, e?.message || e);
    return fallback;
  }
}

export async function setSetting(key: string, value: any, by?: string | null): Promise<void> {
  await sb(`/platform_settings?on_conflict=key`, {
    method: "POST", prefer: "resolution=merge-duplicates,return=minimal",
    body: JSON.stringify({ key, value, updated_by: by || null, updated_at: new Date().toISOString() }),
  });
  cache.set(key, { at: Date.now(), v: value });
}
