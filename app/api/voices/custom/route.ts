export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { unauthorized } from "@/lib/auth";
import { listCustomVoices } from "@/lib/voiceClone";

/** GET — this client's cloned voices, with who confirmed consent. */
export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  const rows = await listCustomVoices(session.clientId);
  return Response.json({ voices: rows });
}
