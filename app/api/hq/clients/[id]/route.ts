export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { requireHq } from "@/lib/hq";
import { sb } from "@/lib/db";
import { createSessionCookie } from "@/lib/auth";
import { listUsers, updateUser, tempPassword } from "@/lib/users";
import { hashPassword } from "@/lib/auth";
import { forgetUser } from "@/lib/session";
import { PLANS, PLAN_KEYS, usageOf } from "@/lib/plans";
import { audit } from "@/lib/audit";

async function load(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const r = await sb<any[]>(`/clients?id=eq.${id}&is_hq=eq.false&limit=1`);
  return r?.[0] ?? null;
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  const denied = requireHq(session); if (denied) return denied;
  const c = await load(params.id);
  if (!c) return Response.json({ error: "Client not found" }, { status: 404 });
  return Response.json({ client: c, users: await listUsers(c.id), usage: await usageOf(c) });
}

const intOrNull = (v: any, max: number) => (v === null || v === "" || v === undefined ? null : Math.max(0, Math.min(max, Math.round(Number(v)) || 0)));

/** PATCH plan, status, trial end, limits, number, notes. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  const denied = requireHq(session); if (denied) return denied;
  const c = await load(params.id);
  if (!c) return Response.json({ error: "Client not found" }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const patch: Record<string, any> = {};
  if ("plan" in b) {
    if (!PLAN_KEYS.includes(b.plan)) return Response.json({ error: "Unknown plan" }, { status: 400 });
    patch.plan = b.plan;
    if (b.plan !== "trial" && c.plan === "trial") patch.billing_cycle_start = new Date().toISOString().slice(0, 10);
    if (b.plan === "trial" && !c.trial_ends_at) { patch.trial_started_at = new Date().toISOString(); patch.trial_ends_at = new Date(Date.now() + 14 * 86400000).toISOString(); }
  }
  if ("status" in b) { if (!["active", "suspended"].includes(b.status)) return Response.json({ error: "Unknown status" }, { status: 400 }); patch.status = b.status; }
  if ("extendTrialDays" in b) {
    const days = Math.max(1, Math.min(60, Number(b.extendTrialDays) || 7));
    const base = c.trial_ends_at && Date.parse(c.trial_ends_at) > Date.now() ? Date.parse(c.trial_ends_at) : Date.now();
    patch.trial_ends_at = new Date(base + days * 86400000).toISOString();
  }
  if ("minutes" in b) patch.minutes_included = intOrNull(b.minutes, 10_000_000);
  if ("employees" in b) patch.max_employees = intOrNull(b.employees, 1000);
  if ("concurrency" in b) patch.max_concurrency = intOrNull(b.concurrency, 200);
  if ("campaignSize" in b) patch.max_campaign_size = intOrNull(b.campaignSize, 1_000_000);
  if ("allowOverage" in b) patch.allow_overage = !!b.allowOverage;
  if ("number" in b) {
    const n = String(b.number || "").replace(/[^\d+]/g, "");
    if (n && !/^\+?\d{10,13}$/.test(n)) return Response.json({ error: "Enter the number with country code, e.g. +914012345678." }, { status: 400 });
    patch.sarvam_agent_number = n ? (n.startsWith("+") ? n : `+91${n.slice(-10)}`) : null;
  }
  if ("notes" in b) patch.hq_notes = String(b.notes || "").slice(0, 2000) || null;
  if ("contactPhone" in b) patch.contact_phone = String(b.contactPhone || "").slice(0, 20) || null;
  if (!Object.keys(patch).length) return Response.json({ error: "Nothing to change" }, { status: 400 });
  const [updated] = await sb<any[]>(`/clients?id=eq.${c.id}`, { method: "PATCH", body: JSON.stringify(patch) });
  await audit(session!, "hq_client_updated", { req, targetType: "client", targetId: c.id, detail: { name: c.name, ...patch } });
  await audit({ clientId: c.id, email: session!.email }, "hq_client_updated", { req, targetType: "client", targetId: c.id, detail: { by: "RANA HQ", changed: Object.keys(patch) } });
  return Response.json({ ok: true, client: updated, usage: await usageOf(updated) });
}

/** POST { action: "reset_owner" | "open" } */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  const denied = requireHq(session); if (denied) return denied;
  const c = await load(params.id);
  if (!c) return Response.json({ error: "Client not found" }, { status: 404 });
  const { action } = await req.json().catch(() => ({}));
  if (action === "reset_owner") {
    const owner = (await listUsers(c.id)).find((u) => u.role === "owner" && u.is_active);
    if (!owner) return Response.json({ error: "This workspace has no active owner." }, { status: 400 });
    const password = tempPassword();
    await updateUser(owner.id, { password_hash: hashPassword(password), must_change_password: true } as any);
    forgetUser(owner.id);
    await audit({ clientId: c.id, email: session!.email }, "hq_owner_password_reset", { req, targetType: "user", targetId: owner.id, detail: { by: "RANA HQ" } });
    return Response.json({ ok: true, owner: { email: owner.email, password } });
  }
  if (action === "open") {
    if (!session!.userId) return Response.json({ error: "Sign in with your personal HQ login first." }, { status: 400 });
    await audit({ clientId: c.id, email: session!.email, userId: session!.userId }, "hq_workspace_opened", { req, targetType: "client", targetId: c.id, detail: { by: "RANA HQ" } });
    const headers = new Headers({ "Content-Type": "application/json" });
    headers.set("Set-Cookie", createSessionCookie(c.id, session!.email, { userId: session!.userId, role: "owner", name: session!.name ?? "RANA HQ", hqFrom: session!.clientId }));
    return new Response(JSON.stringify({ ok: true, redirect: "/" }), { status: 200, headers });
  }
  return Response.json({ error: "Unknown action" }, { status: 400 });
}
