export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { getClientById } from "@/lib/supabase";
import { PLANS, usageOf } from "@/lib/plans";

/** GET → this workspace's plan, limits and minutes used this billing period, plus the price list. */
export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const client: any = await getClientById(session.clientId);
  if (!client) return Response.json({ error: "Workspace not found" }, { status: 404 });
  const usage = await usageOf(client);
  return Response.json({ usage, plans: PLANS, number: client.sarvam_agent_number || null });
}
