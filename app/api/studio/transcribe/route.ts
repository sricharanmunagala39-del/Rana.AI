export const runtime = "nodejs";
export const maxDuration = 60;
import { studioGuard } from "@/lib/studioAuth";
import { sarvamFetch, classifySarvamError, CUSTOMER_MESSAGE } from "@/lib/sarvamHealth";

const LANGS = ["hi", "bn", "kn", "ml", "mr", "od", "pa", "ta", "te", "en", "gu", "ur"];

/**
 * POST (body = one WAV chunk up to ~30 s, from the browser) ?lang=te|auto → { text, language }.
 * Used by "Record" / "Upload audio" in the Script Studio: the client speaks their script, we write it down.
 */
export async function POST(req: Request) {
  const g = await studioGuard(req);
  if (g instanceof Response) return g;
  const key = process.env.SARVAM_CHAT_API_KEY || process.env.SARVAM_API_KEY;
  if (!key) return Response.json({ error: "Speech-to-text isn't set up yet — RANA support has been told." }, { status: 503 });
  const audio = await req.arrayBuffer();
  if (audio.byteLength < 2000) return Response.json({ text: "", language: null });
  if (audio.byteLength > 2_500_000) return Response.json({ error: "That piece of audio is too long." }, { status: 413 });
  const raw = (new URL(req.url).searchParams.get("lang") || "auto").toLowerCase().split("-")[0];
  const code = raw === "or" ? "od" : raw;
  const form = new FormData();
  form.append("file", new Blob([audio], { type: "audio/wav" }), "chunk.wav");
  form.append("model", process.env.SARVAM_STT_MODEL || "saaras:v3");
  form.append("mode", "transcribe");
  form.append("language_code", LANGS.includes(code) ? `${code}-IN` : "unknown");
  try {
    const res = await sarvamFetch("stt", "https://api.sarvam.ai/speech-to-text", { method: "POST", headers: { "api-subscription-key": key }, body: form, timeoutMs: 45000, retry: true });
    const text = await res.text();
    if (!res.ok) {
      console.error("[transcribe]", res.status, text.slice(0, 300));
      return Response.json({ error: CUSTOMER_MESSAGE[classifySarvamError(res.status, text)] }, { status: 502 });
    }
    const d = JSON.parse(text);
    return Response.json({ text: String(d.transcript || "").trim(), language: d.language_code || null });
  } catch (e: any) {
    console.error("[transcribe]", e?.message);
    return Response.json({ error: "Couldn't turn that audio into text. Please try again." }, { status: 502 });
  }
}
