// Custom (cloned) voices. The browser trims and joins the recordings into one clean clip of up to
// 60 seconds; this module sends it to Cartesia's instant clone and keeps the voice private to the
// client that made it, together with who confirmed the speaker's consent and when.
import { sb } from "./db";
import { claimResource, ownersOf } from "./ownership";

const CARTESIA_BASE = "https://api.cartesia.ai";
const CARTESIA_VERSION = "2026-08-14";
export const MAX_CLIP_BYTES = 4 * 1024 * 1024; // Vercel's request limit is 4.5 MB; a 60 s mono WAV is ~2.9 MB
export const CLONE_LANGUAGES: Record<string, string> = {
  te: "Telugu", hi: "Hindi", en: "English", ta: "Tamil", kn: "Kannada", ml: "Malayalam", mr: "Marathi",
  bn: "Bengali", gu: "Gujarati", pa: "Punjabi", ur: "Urdu", ar: "Arabic", es: "Spanish", fr: "French",
  de: "German", pt: "Portuguese",
};

export type CustomVoice = {
  id: string; client_id: string; cartesia_voice_id: string; name: string; language: string; gender: string | null;
  description: string | null; source_files: number; clip_seconds: number | null; quality: any;
  consent_speaker_name: string; consent_confirmed_by: string; consent_confirmed_at: string;
  created_by: string | null; created_at: string; deleted_at: string | null;
};

function key() {
  const k = process.env.CARTESIA_API_KEY;
  if (!k) throw new Error("CARTESIA_API_KEY is not set");
  return k;
}

/** POST /voices/clone (multipart). Returns Cartesia's voice metadata ({ id, name, language, … }). */
export async function cloneOnCartesia(opts: { clip: Blob; filename: string; name: string; language: string; description?: string | null }): Promise<any> {
  const form = new FormData();
  form.append("clip", opts.clip, opts.filename);
  form.append("name", opts.name);
  form.append("language", opts.language);
  if (opts.description) form.append("description", opts.description.slice(0, 500));
  form.append("tagline", "Cloned voice".slice(0, 32));
  const res = await fetch(`${CARTESIA_BASE}/voices/clone`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}`, "Cartesia-Version": CARTESIA_VERSION },
    body: form,
  });
  const text = await res.text();
  let data: any; try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`Cartesia clone ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

export async function deleteOnCartesia(voiceId: string): Promise<void> {
  const res = await fetch(`${CARTESIA_BASE}/voices/${encodeURIComponent(voiceId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${key()}`, "Cartesia-Version": CARTESIA_VERSION },
  });
  if (!res.ok && res.status !== 404) throw new Error(`Cartesia delete ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

export async function saveCustomVoice(row: Omit<CustomVoice, "id" | "created_at" | "deleted_at" | "consent_confirmed_at">): Promise<CustomVoice> {
  const r = await sb<CustomVoice[]>(`/custom_voices`, { method: "POST", body: JSON.stringify(row) });
  await claimResource(row.client_id, "voice" as any, row.cartesia_voice_id, row.name);
  return r[0];
}

export async function listCustomVoices(clientId: string): Promise<CustomVoice[]> {
  return sb<CustomVoice[]>(`/custom_voices?client_id=eq.${clientId}&deleted_at=is.null&order=created_at.desc`);
}

export async function getCustomVoice(clientId: string, id: string): Promise<CustomVoice | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const r = await sb<CustomVoice[]>(`/custom_voices?client_id=eq.${clientId}&id=eq.${id}&deleted_at=is.null&limit=1`);
  return r?.[0] ?? null;
}

export async function markDeleted(id: string) {
  await sb(`/custom_voices?id=eq.${id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ deleted_at: new Date().toISOString() }) });
}

/** Voice ids (from a list) that belong to some OTHER client — these must never be shown or used. */
export async function foreignVoiceIds(clientId: string, ids: string[]): Promise<Set<string>> {
  const owners = await ownersOf("voice" as any, ids.filter(Boolean));
  return new Set(Object.entries(owners).filter(([, c]) => c !== clientId).map(([id]) => id));
}

/** True when this voice id is a cloned voice owned by a different client. */
export async function isForeignVoice(clientId: string, voiceId: string | null | undefined): Promise<boolean> {
  if (!voiceId) return false;
  return (await foreignVoiceIds(clientId, [voiceId])).has(voiceId);
}
