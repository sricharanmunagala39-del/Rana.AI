export const runtime = "nodejs";
import { getClientById } from "@/lib/supabase";
import { parseSession, clearSessionCookie } from "@/lib/auth";

// Re-exported for existing imports (scripts routes import parseSession from here).
export { parseSession };

export async function GET(req: Request) {
  const session = parseSession(req);
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const client = await getClientById(session.clientId);
  if (!client) return Response.json({ error: "Client not found" }, { status: 404 });
  return Response.json({ id: client.id, name: client.name, industry: client.industry, sarvam_app_id: client.sarvam_app_id });
}

export async function POST() {
  const headers = new Headers();
  headers.set("Set-Cookie", clearSessionCookie());
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}
