export const runtime = "nodejs";
import { getSession, forgetUser } from "@/lib/session";
import { requireHq, HQ_ROLES, isHqEmail } from "@/lib/hq";
import { sb } from "@/lib/db";
import { createUser, getUserByEmail, normaliseEmail, validEmail, tempPassword } from "@/lib/users";
import { audit } from "@/lib/audit";
import { sendEmail, emailHtml, APP_URL } from "@/lib/notify";
import type { HqRole } from "@/lib/auth";

const ROLES = Object.keys(HQ_ROLES) as HqRole[];

/** GET → RANA HQ staff: role, two-step login, last sign-in. */
export async function GET(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session, "view"); if (denied) return denied;
  const users = (await sb<any[]>(`/users?client_id=eq.${session!.clientId}&order=created_at.asc&select=id,email,name,hq_role,is_active,totp_enabled,last_login_at,created_at`)) || [];
  return Response.json({
    roles: HQ_ROLES,
    staff: users.map((u) => ({ ...u, hq_role: isHqEmail(u.email) ? "founder" : u.hq_role, founderByEnv: isHqEmail(u.email), me: u.id === session!.userId })),
  });
}

/** POST { email, name, role } → new HQ staff login with a one-time password. Founders only. */
export async function POST(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session, "team"); if (denied) return denied;
  const b = await req.json().catch(() => ({} as any));
  const email = normaliseEmail(b.email);
  const role: HqRole = ROLES.includes(b.role) && b.role !== "founder" ? b.role : "support";
  if (!validEmail(email)) return Response.json({ error: "Enter their email address." }, { status: 400 });
  if (await getUserByEmail(email)) return Response.json({ error: "That email already has a RANA login." }, { status: 409 });
  const password = tempPassword();
  const u = await createUser({ clientId: session!.clientId, email, name: String(b.name || "").trim() || email.split("@")[0], password, role: "admin", invitedBy: session!.email, mustChange: true });
  await sb(`/users?id=eq.${u.id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ hq_role: role }) });
  await audit(session!, "user_invited", { req, targetType: "user", targetId: u.id, detail: { email, hqRole: role } });
  const mail = await sendEmail({ to: email, kind: "hq_invite", subject: "You've been added to RANA HQ", html: emailHtml({ title: "Welcome to RANA HQ", lines: [`You've been added as <b>${HQ_ROLES[role].label}</b> (${HQ_ROLES[role].can.toLowerCase()}).`, `Sign in with <b>${email}</b> and this one-time password: <b style="font-family:monospace">${password}</b>`, "Then turn on two-step login under HQ → Team & security."], button: { label: "Sign in", url: `${APP_URL()}/login` } }) });
  return Response.json({ ok: true, user: { id: u.id, email, role }, password, emailed: mail.ok }, { status: 201 });
}

/** PATCH { userId, role?, active? } — change an HQ staff member's role or remove their access. Founders only. */
export async function PATCH(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session, "team"); if (denied) return denied;
  const b = await req.json().catch(() => ({} as any));
  const [u] = (await sb<any[]>(`/users?id=eq.${String(b.userId || "").replace(/[^0-9a-f-]/gi, "")}&client_id=eq.${session!.clientId}&select=id,email&limit=1`)) || [];
  if (!u) return Response.json({ error: "Not found" }, { status: 404 });
  if (isHqEmail(u.email)) return Response.json({ error: "Founders are set in Vercel (RANA_HQ_EMAILS) and can't be changed here." }, { status: 400 });
  const patch: any = {};
  if ("role" in b) { if (!ROLES.includes(b.role) || b.role === "founder") return Response.json({ error: "Pick Operations, Support or Finance." }, { status: 400 }); patch.hq_role = b.role; }
  if ("active" in b) patch.is_active = !!b.active;
  await sb(`/users?id=eq.${u.id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify(patch) });
  forgetUser(u.id);
  await audit(session!, patch.is_active === false ? "user_deactivated" : "user_role_changed", { req, targetType: "user", targetId: u.id, detail: { email: u.email, ...patch } });
  return Response.json({ ok: true });
}
