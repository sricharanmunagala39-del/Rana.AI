export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { unauthorized, forbidUnless } from "@/lib/auth";
import { sb } from "@/lib/db";
import { getClientById } from "@/lib/supabase";
import { sendTest } from "@/lib/leadAlerts";

const last = new Map<string, number>();

/** POST { id } — send a sample lead through this channel right now. */
export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  const denied = forbidUnless(session, "admin"); if (denied) return denied;
  const { id } = await req.json().catch(() => ({} as any));
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ""))) return Response.json({ error: "Bad id" }, { status: 400 });
  if (Date.now() - (last.get(id) || 0) < 10000) return Response.json({ error: "Wait a few seconds before sending another test." }, { status: 429 });
  last.set(id, Date.now());
  const integ = ((await sb<any[]>(`/integrations?id=eq.${id}&client_id=eq.${session.clientId}&limit=1`).catch(() => [])) || [])[0];
  if (!integ) return Response.json({ error: "Not found" }, { status: 404 });
  const r = await sendTest(integ, await getClientById(session.clientId));
  return Response.json(r, { status: r.ok ? 200 : 502 });
}
