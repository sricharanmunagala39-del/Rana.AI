export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { requireHq } from "@/lib/hq";
import { addLibraryVoice, libraryVoices } from "@/lib/elevenlabs";

/** GET ?language=hi&gender=female&search=… → ElevenLabs public voice library (natural voices to choose from). */
export async function GET(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session, "view"); if (denied) return denied;
  const q = new URL(req.url).searchParams;
  const clip = (k: string) => (q.get(k) || "").slice(0, 40) || undefined;
  try {
    const voices = await libraryVoices({ language: clip("language"), gender: clip("gender"), search: clip("search"), accent: clip("accent"), useCase: clip("useCase") });
    return Response.json({ voices });
  } catch (e: any) { return Response.json({ error: String(e?.message || e) }, { status: 502 }); }
}

/** POST { ownerId, voiceId, name } → copies a library voice into RANA's account so calls can use it. */
export async function POST(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session, "clients"); if (denied) return denied;
  const b = await req.json().catch(() => ({} as any));
  if (!b.ownerId || !b.voiceId) return Response.json({ error: "Missing voice." }, { status: 400 });
  try {
    const voiceId = await addLibraryVoice(String(b.ownerId), String(b.voiceId), String(b.name || "RANA voice"));
    return Response.json({ ok: true, voiceId });
  } catch (e: any) { return Response.json({ error: String(e?.message || e) }, { status: 502 }); }
}
