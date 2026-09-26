export const runtime = "nodejs";
import crypto from "crypto";
import { sb } from "@/lib/db";
import { getSession } from "@/lib/session";
import { unauthorized } from "@/lib/auth";
import { previewLanguage, sampleLine, synthesizePreview, carrierLine } from "@/lib/voicePreview";
import { isForeignVoice } from "@/lib/voiceClone";
import { sarvamTts, voiceFor } from "@/lib/sarvamAgent";

import { friendly } from "@/lib/sarvamHealth";

const sarvamCache = new Map<string, ArrayBuffer>();
const cacheId = (key: string) => crypto.createHash("sha256").update(key).digest("hex");
async function loadSaved(key: string): Promise<ArrayBuffer | null> {
  const rows = (await sb<any[]>(`/tts_cache?key=eq.${cacheId(key)}&select=audio_b64`).catch(() => [])) || [];
  if (!rows[0]?.audio_b64) return null;
  const buf = Buffer.from(rows[0].audio_b64, "base64");
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}
async function saveForGood(key: string, audio: ArrayBuffer) {
  if (audio.byteLength > 600_000) return;
  await sb(`/tts_cache?on_conflict=key`, { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: JSON.stringify({ key: cacheId(key), audio_b64: Buffer.from(audio).toString("base64"), bytes: audio.byteLength }) });
}

/**
 * GET /api/voices/preview?voiceId=…&lang=te&name=Shanti&gender=feminine[&text=…][&speed=1.1]
 * Returns MP3 of this voice saying one line, so every voice can be compared on the same sentence.
 */
export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  const sp = new URL(req.url).searchParams;
  // ?engine=sarvam → the Sarvam agent's own voice (Bulbul v3), so previews sound exactly like the calls.
  if (sp.get("engine") === "sarvam") {
    const lang = previewLanguage(sp.get("lang"));
    const say = (sp.get("say") || "").replace(/\s+/g, " ").trim().slice(0, 80);
    const custom = (sp.get("text") || "").replace(/\s+/g, " ").trim().slice(0, 240);
    const v = voiceFor(sp.get("voice"));
    const text = say ? carrierLine(lang, say) : custom || sampleLine(lang, v.name, v.gender);
    const pace = Number(sp.get("speed")) || 1;
    const key = `${v.speaker}|${lang}|${pace}|${text}`;
    try {
      let audio = sarvamCache.get(key);
      // Saved for good after the first time: the same voice saying the same line never costs twice.
      if (!audio) audio = (await loadSaved(key)) || undefined;
      if (!audio) {
        audio = await sarvamTts({ text, language: lang, speaker: v.speaker, pace });
        await saveForGood(key, audio).catch(() => {}); // awaited: serverless may stop right after the response
      }
      if (sarvamCache.size > 150) sarvamCache.delete(sarvamCache.keys().next().value as string);
      sarvamCache.set(key, audio);
      return new Response(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=86400", "Content-Length": String(audio.byteLength) } });
    } catch (e: any) {
      console.error("[voice preview sarvam]", e?.message);
      return Response.json({ error: friendly(e, "Couldn't generate a voice preview.") }, { status: 502 });
    }
  }
  const voiceId = sp.get("voiceId") || "";
  if (!/^[\w-]{6,80}$/.test(voiceId)) return Response.json({ error: "Unknown voice" }, { status: 400 });
  if (await isForeignVoice(session.clientId, voiceId)) return Response.json({ error: "Unknown voice" }, { status: 404 });
  const lang = previewLanguage(sp.get("lang"));
  const custom = (sp.get("text") || "").replace(/\s+/g, " ").trim().slice(0, 240);
  // ?say=WORD → the word inside a short sentence in this language (pronunciation test).
  const say = (sp.get("say") || "").replace(/\s+/g, " ").trim().slice(0, 80);
  const text = say ? carrierLine(lang, say) : custom || sampleLine(lang, sp.get("name") || "", sp.get("gender"));
  const speed = Number(sp.get("speed")) || 1;
  try {
    const audio = await synthesizePreview({ voiceId, text, language: lang, speed });
    return new Response(audio, {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=86400", "Content-Length": String(audio.byteLength) },
    });
  } catch (e: any) {
    console.error("[voice preview]", e?.message);
    return Response.json({ error: friendly(e, "Couldn't generate a preview for this voice.") }, { status: 502 });
  }
}
