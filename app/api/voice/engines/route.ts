export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { getClientById } from "@/lib/supabase";
import { enginesFor } from "@/lib/voice/server";
import { DEFAULT_ENGINE } from "@/lib/voice/engines";

/** GET — the calling engines this workspace can pick from (Sarvam always; others once RANA HQ switches them on). */
export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const client = await getClientById(session.clientId);
  const engines = enginesFor(client).filter((e) => e.allowed && e.ready);
  return Response.json({ engines, default: DEFAULT_ENGINE });
}
