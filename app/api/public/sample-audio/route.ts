export const runtime = "nodejs";
import { loadSavedTts, r1TtsKey } from "@/lib/ttsCache";
import { voiceFor } from "@/lib/sarvamAgent";
import { SCENARIOS, SAMPLE_VOICES, sampleText, type DemoKey } from "@/app/landing/talkContent";

/**
 * Public: GET ?s=<scenario>&i=<line> → MP3 of one line of a website sample call, in real R1 voices.
 * Serves ONLY audio already saved (the HQ Reel studio makes it once) — never synthesises, so it costs nothing.
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const s = SCENARIOS.find((x) => x.key === sp.get("s"));
  const i = Number(sp.get("i"));
  const line = s && Number.isInteger(i) ? s.sample[i] : null;
  if (!s || !line) return Response.json({ error: "not found" }, { status: 404 });
  const v = voiceFor(line.who === "ai" ? SAMPLE_VOICES[s.key as DemoKey].ai : SAMPLE_VOICES[s.key as DemoKey].caller);
  const audio = await loadSavedTts(r1TtsKey(v.speaker, "en", 1, sampleText(line.text)));
  if (!audio) return Response.json({ error: "not ready" }, { status: 404 });
  return new Response(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=604800, immutable", "Content-Length": String(audio.byteLength) } });
}
