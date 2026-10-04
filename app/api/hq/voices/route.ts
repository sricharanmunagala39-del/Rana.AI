export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { requireHq } from "@/lib/hq";
import { sarvamConfig } from "@/lib/sarvamAgent";
import { setSetting } from "@/lib/platformSettings";
import { accountVoices, elevenAccount, elevenReady, getWebVoice, runtimeAgent, ELEVEN_MODELS, DEFAULT_ELEVEN_MODEL, WEB_VOICE_KEY, type WebVoice } from "@/lib/elevenlabs";

/** GET → both voice engines' status, RANA's ElevenLabs voices and what the website uses. */
export async function GET(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session, "view"); if (denied) return denied;
  const web = await getWebVoice();
  const eleven: any = { ready: elevenReady(), models: ELEVEN_MODELS };
  if (eleven.ready) {
    const [acc, voices] = await Promise.allSettled([elevenAccount(), accountVoices()]);
    if (acc.status === "fulfilled") eleven.account = acc.value; else eleven.error = String(acc.reason?.message || acc.reason);
    if (voices.status === "fulfilled") eleven.voices = voices.value; else eleven.error = eleven.error || String(voices.reason?.message || voices.reason);
  }
  return Response.json({ sarvam: { ready: !!sarvamConfig() }, eleven, web });
}

/** PATCH { engine, voiceId?, voiceName?, model? } → which engine the website's live voice uses. */
export async function PATCH(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session, "clients"); if (denied) return denied;
  const b = await req.json().catch(() => ({} as any));
  const engine = b.engine === "elevenlabs" ? "elevenlabs" : "sarvam";
  const prev = await getWebVoice();
  const next: WebVoice = {
    engine,
    voiceId: String(b.voiceId ?? prev.voiceId ?? "").slice(0, 64) || undefined,
    voiceName: String(b.voiceName ?? prev.voiceName ?? "").slice(0, 80) || undefined,
    model: ELEVEN_MODELS.some((m) => m.id === b.model) ? b.model : prev.model || DEFAULT_ELEVEN_MODEL,
  };
  if (engine === "elevenlabs") {
    if (!elevenReady()) return Response.json({ error: "Add ELEVENLABS_API_KEY in Vercel first, then redeploy." }, { status: 400 });
    if (!next.voiceId) return Response.json({ error: "Pick a voice first." }, { status: 400 });
    // Set up (or update) the runtime agent now, so a problem shows here and not on a visitor's call.
    try { const a = await runtimeAgent(next.model!, next.voiceId); next.model = a.model; }
    catch (e: any) { return Response.json({ error: String(e?.message || e) }, { status: 502 }); }
  }
  await setSetting(WEB_VOICE_KEY, next, session!.email);
  return Response.json({ ok: true, web: next });
}
