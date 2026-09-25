export const runtime = "nodejs";
import { getClientById } from "@/lib/supabase";
import { clearSessionCookie, roleOf, ROLE_INFO } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { HQ_ROLES } from "@/lib/hq";
import { usageOf, employeeBlock } from "@/lib/plans";

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
    hq: !!session.hqRole && !session.hqFrom && !!c.is_hq,
    hqRole: session.hqRole ? { key: session.hqRole, label: HQ_ROLES[session.hqRole].label, perms: HQ_ROLES[session.hqRole].perms } : null,
    actingAsHq: !!session.hqFrom,
    hqSession: session.hqFrom ? { readOnly: !!session.hqRO, expiresAt: session.hqExp || null, reason: session.hqReason || null } : null,
    pending: c.status === "pending",
    // Why a new employee can't be added right now (plan limit), so the builder can say so before any work is done.
    employeeBlock: c.is_hq ? null : await employeeBlock(c).catch(() => null),
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
