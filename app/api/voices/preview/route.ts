export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { unauthorized } from "@/lib/auth";
import { previewLanguage, sampleLine, synthesizePreview, carrierLine } from "@/lib/voicePreview";
import { isForeignVoice } from "@/lib/voiceClone";
import { sarvamTts, voiceFor } from "@/lib/sarvamAgent";

const sarvamCache = new Map<string, ArrayBuffer>();

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
      if (!audio) {
        audio = await sarvamTts({ text, language: lang, speaker: v.speaker, pace });
        if (sarvamCache.size > 150) sarvamCache.delete(sarvamCache.keys().next().value as string);
        sarvamCache.set(key, audio);
      }
      return new Response(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=86400", "Content-Length": String(audio.byteLength) } });
    } catch (e: any) {
      console.error("[voice preview sarvam]", e?.message);
      return Response.json({ error: "Couldn't generate a voice preview." }, { status: 502 });
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
    return Response.json({ error: "Couldn't generate a preview for this voice." }, { status: 502 });
  }
}
