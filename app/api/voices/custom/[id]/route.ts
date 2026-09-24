export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { unauthorized, forbidUnless } from "@/lib/auth";
import { getCustomVoice, deleteOnCartesia, markDeleted } from "@/lib/voiceClone";
import { releaseResource } from "@/lib/ownership";
import { audit } from "@/lib/audit";
import { getScriptsForClient } from "@/lib/supabase";

/** DELETE — remove a cloned voice from Cartesia and from this client. Id = our row id or the Cartesia voice id. */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  const denied = forbidUnless(session, "admin"); if (denied) return denied;
  const { listCustomVoices } = await import("@/lib/voiceClone");
  const v = (await getCustomVoice(session.clientId, params.id))
    ?? (await listCustomVoices(session.clientId)).find((x) => x.cartesia_voice_id === params.id) ?? null;
  if (!v) return Response.json({ error: "Voice not found" }, { status: 404 });
  // An employee still speaking with this voice would break on its next call.
  const using = (await getScriptsForClient(session.clientId)).filter((s: any) => s.speaker === v.cartesia_voice_id);
  if (using.length) return Response.json({ error: `${using.map((s: any) => s.name).join(", ")} still use${using.length === 1 ? "s" : ""} this voice. Pick another voice for ${using.length === 1 ? "that employee" : "them"} first.` }, { status: 409 });
  try {
    await deleteOnCartesia(v.cartesia_voice_id);
    await markDeleted(v.id);
    await releaseResource(session.clientId, "voice" as any, v.cartesia_voice_id);
    await audit(session, "voice_deleted", { req, targetType: "voice", targetId: v.cartesia_voice_id, detail: { name: v.name } });
    return Response.json({ ok: true });
  } catch (e: any) {
    return Response.json({ error: e?.message || "Couldn't delete this voice" }, { status: 502 });
  }
}
