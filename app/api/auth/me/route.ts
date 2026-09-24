export const runtime = "nodejs";
import { getClientById } from "@/lib/supabase";
import { clearSessionCookie, roleOf, ROLE_INFO } from "@/lib/auth";
import { getSession } from "@/lib/session";

export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const client = await getClientById(session.clientId);
  if (!client) return Response.json({ error: "Client not found" }, { status: 404 });
  const role = roleOf(session);
  return Response.json({
    id: client.id, name: client.name, industry: client.industry, sarvam_app_id: client.sarvam_app_id,
    user: { id: session.userId ?? null, email: session.email, name: session.name ?? null, role, roleLabel: ROLE_INFO[role].label, personal: !!session.userId },
  });
}

export async function POST() {
  const headers = new Headers();
  headers.set("Set-Cookie", clearSessionCookie());
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}
