export const runtime = "nodejs";
import { sb } from "@/lib/db";
import { createSessionCookie } from "@/lib/auth";
import { matchTotpStep, readTicket } from "@/lib/totp";
import { audit } from "@/lib/audit";

const fails = new Map<string, { n: number; first: number }>();

/** POST { ticket, code } — second step of sign-in for people with two-step login turned on. */
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({} as any));
  const uid = readTicket(String(b.ticket || ""));
  if (!uid) return Response.json({ error: "That sign-in took too long. Enter your password again." }, { status: 401 });
  const f = fails.get(uid);
  if (f && Date.now() - f.first < 15 * 60_000 && f.n >= 6) return Response.json({ error: "Too many wrong codes. Wait 15 minutes." }, { status: 429 });
  const [u] = (await sb<any[]>(`/users?id=eq.${uid}&select=id,client_id,email,name,role,is_active,totp_secret,totp_enabled,must_change_password&limit=1`)) || [];
  if (!u?.is_active || !u.totp_enabled || !u.totp_secret) return Response.json({ error: "Sign-in failed." }, { status: 401 });
  const step = matchTotpStep(u.totp_secret, String(b.code || ""));
  // Each code works once: claim its time step atomically, so a copied code can't open a second session.
  const claimed = step === null ? [] : ((await sb<any[]>(`/users?id=eq.${u.id}&or=(totp_last_step.is.null,totp_last_step.lt.${step})`, { method: "PATCH", body: JSON.stringify({ totp_last_step: step }) }).catch(() => null)) ?? [{ id: u.id }]);
  if (step === null || !claimed.length) {
    fails.set(uid, !f || Date.now() - f.first > 15 * 60_000 ? { n: 1, first: Date.now() } : { n: f.n + 1, first: f.first });
    await audit({ clientId: u.client_id, email: u.email, userId: u.id }, "login_failed", { req, detail: { step: "2fa" } });
    return Response.json({ error: "That code isn't right. Use the 6-digit code shown in your authenticator app now." }, { status: 401 });
  }
  fails.delete(uid);
  const [c] = (await sb<any[]>(`/clients?id=eq.${u.client_id}&select=id,name,industry,is_hq,is_active&limit=1`)) || [];
  if (!c?.is_active) return Response.json({ error: "Account disabled" }, { status: 403 });
  await sb(`/users?id=eq.${u.id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ last_login_at: new Date().toISOString() }) }).catch(() => {});
  await audit({ clientId: c.id, email: u.email, userId: u.id }, "login", { req, detail: { twoStep: true } });
  const headers = new Headers({ "Content-Type": "application/json" });
  headers.set("Set-Cookie", createSessionCookie(c.id, u.email, { userId: u.id, role: u.role, name: u.name }));
  return new Response(JSON.stringify({ ok: true, mustChangePassword: !!u.must_change_password, home: c.is_hq ? "/hq" : "/" }), { status: 200, headers });
}
