import crypto from "crypto";
import { sb } from "@/lib/db";

/** Saved TTS audio (tts_cache): the same voice saying the same line is synthesised once, ever. */
export const ttsCacheId = (key: string) => crypto.createHash("sha256").update(key).digest("hex");
/** The cache key the R1 voice preview uses: speaker | language | pace | text. */
export const r1TtsKey = (speaker: string, lang: string, pace: number, text: string) => `${speaker}|${lang}|${pace}|${text}`;

export async function loadSavedTts(key: string): Promise<ArrayBuffer | null> {
  const rows = (await sb<any[]>(`/tts_cache?key=eq.${ttsCacheId(key)}&select=audio_b64`).catch(() => [])) || [];
  if (!rows[0]?.audio_b64) return null;
  const buf = Buffer.from(rows[0].audio_b64, "base64");
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

export async function saveTts(key: string, audio: ArrayBuffer) {
  if (audio.byteLength > 600_000) return;
  await sb(`/tts_cache?on_conflict=key`, { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: JSON.stringify({ key: ttsCacheId(key), audio_b64: Buffer.from(audio).toString("base64"), bytes: audio.byteLength }) });
}
