export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { sb } from "@/lib/db";
import { newSecret, otpauthUrl, verifyTotp } from "@/lib/totp";
import { audit } from "@/lib/audit";

async function me(req: Request) {
  const s = await getSession(req);
  if (!s?.userId || s.hqFrom) return { s: null, u: null };
  const [u] = (await sb<any[]>(`/users?id=eq.${s.userId}&select=id,email,totp_secret,totp_enabled&limit=1`)) || [];
  return { s, u };
}

/** GET → is two-step login on for me? */
export async function GET(req: Request) {
  const { s, u } = await me(req);
  if (!s || !u) return Response.json({ error: "Sign in with your personal login." }, { status: 401 });
  return Response.json({ enabled: !!u.totp_enabled });
}

/** POST { action: "start" } → new secret to add to the app; { action: "enable", code }; { action: "disable", code }. */
export async function POST(req: Request) {
  const { s, u } = await me(req);
  if (!s || !u) return Response.json({ error: "Sign in with your personal login." }, { status: 401 });
  const b = await req.json().catch(() => ({} as any));
  if (b.action === "start") {
    if (u.totp_enabled) return Response.json({ error: "Two-step login is already on." }, { status: 400 });
    const secret = newSecret();
    await sb(`/users?id=eq.${u.id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ totp_secret: secret, totp_enabled: false }) });
    return Response.json({ secret: secret.replace(/(.{4})/g, "$1 ").trim(), url: otpauthUrl(secret, u.email) });
  }
  if (b.action === "enable") {
    if (!u.totp_secret || !verifyTotp(u.totp_secret, String(b.code || ""))) return Response.json({ error: "That code isn't right. Enter the 6 digits your app shows now." }, { status: 400 });
    await sb(`/users?id=eq.${u.id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ totp_enabled: true }) });
    await audit(s, "password_changed", { req, targetType: "user", targetId: u.id, detail: { twoStep: "on" } });
    return Response.json({ ok: true, enabled: true });
  }
  if (b.action === "disable") {
    if (!u.totp_enabled || !verifyTotp(u.totp_secret, String(b.code || ""))) return Response.json({ error: "Enter a current code from your app to turn two-step login off." }, { status: 400 });
    await sb(`/users?id=eq.${u.id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ totp_enabled: false, totp_secret: null }) });
    await audit(s, "password_changed", { req, targetType: "user", targetId: u.id, detail: { twoStep: "off" } });
    return Response.json({ ok: true, enabled: false });
  }
  return Response.json({ error: "Unknown action" }, { status: 400 });
}
