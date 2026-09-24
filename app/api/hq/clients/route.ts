export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { requireHq } from "@/lib/hq";
import { sb } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { createUser, getUserByEmail, normaliseEmail, validEmail, tempPassword } from "@/lib/users";
import { PLANS, PLAN_KEYS, usageOf, type PlanKey } from "@/lib/plans";
import { audit } from "@/lib/audit";

const INDUSTRIES = ["edtech", "realestate", "hospitality", "saas", "other"];

/** GET → every client workspace with plan, usage, team size and activity. RANA HQ only. */
export async function GET(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session); if (denied) return denied;
  const clients = await sb<any[]>(`/clients?is_hq=eq.false&order=created_at.desc&select=*`);
  const [users, scripts, lastCalls] = await Promise.all([
    sb<any[]>(`/users?select=client_id,email,role,last_login_at,is_active`),
    sb<any[]>(`/scripts?select=client_id,published_at`),
    sb<any[]>(`/calls?select=client_id,created_at&order=created_at.desc&limit=2000`),
  ]);
  const out = await Promise.all((clients || []).map(async (c) => {
    const u = await usageOf(c).catch(() => null);
    const team = (users || []).filter((x) => x.client_id === c.id);
    const owner = team.find((x) => x.role === "owner") || null;
    return {
      id: c.id, name: c.name, industry: c.industry, plan: c.plan, status: c.status, createdAt: c.created_at,
      contactPhone: c.contact_phone, notes: c.hq_notes, number: c.sarvam_agent_number,
      overrides: { minutes: c.minutes_included, employees: c.max_employees, concurrency: c.max_concurrency, campaignSize: c.max_campaign_size, allowOverage: c.allow_overage },
      owner: owner ? { email: owner.email, lastLogin: owner.last_login_at } : { email: c.login_email, lastLogin: null },
      teamSize: team.filter((x) => x.is_active).length,
      lastLogin: team.map((x) => x.last_login_at).filter(Boolean).sort().pop() || null,
      employees: (scripts || []).filter((s) => s.client_id === c.id).length,
      published: (scripts || []).filter((s) => s.client_id === c.id && s.published_at).length,
      lastCall: (lastCalls || []).find((x) => x.client_id === c.id)?.created_at || null,
      usage: u,
    };
  }));
  return Response.json({ clients: out, plans: PLANS });
}

/** POST { name, industry, ownerEmail, ownerName?, plan?, contactPhone?, notes? } → new workspace + owner with a one-time password. */
export async function POST(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session); if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const name = String(b.name || "").trim().slice(0, 80);
  const email = normaliseEmail(b.ownerEmail);
  const plan: PlanKey = PLAN_KEYS.includes(b.plan) ? b.plan : "trial";
  const industry = INDUSTRIES.includes(b.industry) ? b.industry : "other";
  if (name.length < 2) return Response.json({ error: "Enter the company name." }, { status: 400 });
  if (!validEmail(email)) return Response.json({ error: "Enter the owner's email address." }, { status: 400 });
  if (await getUserByEmail(email)) return Response.json({ error: "That email already has a RANA login. Use a different email for this company's owner." }, { status: 409 });
  const dupe = await sb<any[]>(`/clients?login_email=eq.${encodeURIComponent(email)}&select=id&limit=1`);
  if (dupe?.length) return Response.json({ error: "That email already has a RANA workspace." }, { status: 409 });

  const now = new Date();
  const trialDays = Math.min(60, Math.max(1, Number(b.trialDays) || PLANS.trial.trialDays || 14));
  const [client] = await sb<any[]>(`/clients`, {
    method: "POST",
    body: JSON.stringify({
      name, industry, company_name: name, login_email: email,
      login_password: hashPassword(tempPassword() + tempPassword()), // legacy column; nobody signs in with it
      plan, status: "active",
      trial_started_at: plan === "trial" ? now.toISOString() : null,
      trial_ends_at: plan === "trial" ? new Date(now.getTime() + trialDays * 86400000).toISOString() : null,
      billing_cycle_start: plan === "trial" ? null : now.toISOString().slice(0, 10),
      contact_phone: String(b.contactPhone || "").trim().slice(0, 20) || null,
      hq_notes: String(b.notes || "").trim().slice(0, 2000) || null,
    }),
  });
  const password = tempPassword();
  await createUser({ clientId: client.id, email, name: String(b.ownerName || "").trim() || name, password, role: "owner", invitedBy: session!.email, mustChange: true });
  await audit(session!, "hq_client_created", { req, targetType: "client", targetId: client.id, detail: { name, plan, owner: email } });
  await audit({ clientId: client.id, email: session!.email }, "hq_client_created", { req, targetType: "client", targetId: client.id, detail: { by: "RANA HQ", plan } });
  return Response.json({ ok: true, client: { id: client.id, name }, owner: { email, password }, loginUrl: "https://rana-ai-roan.vercel.app/login" }, { status: 201 });
}
