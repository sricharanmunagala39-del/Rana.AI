export const runtime = "nodejs";
import { getClientById } from "@/lib/supabase";
import { clearSessionCookie, roleOf, ROLE_INFO } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { isHqEmail } from "@/lib/hq";
import { usageOf } from "@/lib/plans";

export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const client = await getClientById(session.clientId);
  if (!client) return Response.json({ error: "Client not found" }, { status: 404 });
  const role = roleOf(session);
  const c: any = client;
  const u = c.is_hq ? null : await usageOf(c).catch(() => null);
  return Response.json({
    id: client.id, name: client.name, industry: client.industry, sarvam_app_id: client.sarvam_app_id,
    hq: isHqEmail(session.email) && !session.hqFrom && !!c.is_hq,
    actingAsHq: !!session.hqFrom,
    plan: u ? { key: u.plan.key, name: u.plan.name, status: u.status, trialDaysLeft: u.trialDaysLeft, minutesUsed: u.minutesUsed, minutesIncluded: u.minutesIncluded } : null,
    user: { id: session.userId ?? null, email: session.email, name: session.name ?? null, role, roleLabel: ROLE_INFO[role].label, personal: !!session.userId },
  });
}

export async function POST() {
  const headers = new Headers();
  headers.set("Set-Cookie", clearSessionCookie());
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}
