export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { createSessionCookie } from "@/lib/auth";
import { sb } from "@/lib/db";

/** POST → leave the client's workspace and go back to RANA HQ. */
export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session?.hqFrom || !session.userId) return Response.json({ error: "Not inside a client's workspace." }, { status: 400 });
  const rows = await sb<any[]>(`/users?id=eq.${session.userId}&select=role,name&limit=1`);
  const u = rows?.[0];
  const headers = new Headers({ "Content-Type": "application/json" });
  headers.set("Set-Cookie", createSessionCookie(session.hqFrom, session.email, { userId: session.userId, role: u?.role || "owner", name: u?.name }));
  return new Response(JSON.stringify({ ok: true, redirect: "/hq" }), { status: 200, headers });
}
