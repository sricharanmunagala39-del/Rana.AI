export const runtime = "nodejs";
import { parseSession, createSessionCookie } from "@/lib/auth";
import { sb } from "@/lib/db";
import { forgetUser } from "@/lib/session";

/** Leave the client's workspace and go back to RANA HQ. Works even after the time-limited visit has expired. */
async function back(req: Request): Promise<{ cookie: string } | { error: string }> {
  const s = parseSession(req);
  if (!s?.hqFrom || !s.userId) return { error: "Not inside a client's workspace." };
  const rows = await sb<any[]>(`/users?id=eq.${s.userId}&select=role,name,client_id,is_active&limit=1`);
  const u = rows?.[0];
  if (!u?.is_active || u.client_id !== s.hqFrom) return { error: "Your HQ access has been removed." };
  forgetUser(s.userId);
  return { cookie: createSessionCookie(s.hqFrom, s.email, { userId: s.userId, role: u.role || "owner", name: u.name }) };
}

export async function POST(req: Request) {
  const r = await back(req);
  if ("error" in r) return Response.json({ error: r.error }, { status: 400 });
  const headers = new Headers({ "Content-Type": "application/json" });
  headers.set("Set-Cookie", r.cookie);
  return new Response(JSON.stringify({ ok: true, redirect: "/hq" }), { status: 200, headers });
}

/** GET — used when a timed visit runs out: back to HQ with a note. */
export async function GET(req: Request) {
  const r = await back(req);
  const headers = new Headers({ Location: "error" in r ? "/login" : "/hq?visit=expired" });
  if (!("error" in r)) headers.set("Set-Cookie", r.cookie);
  return new Response(null, { status: 302, headers });
}
