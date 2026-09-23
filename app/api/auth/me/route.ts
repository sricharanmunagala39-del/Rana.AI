// @ts-nocheck
export const runtime = "nodejs";
import { getClientById } from "@/lib/supabase";
export function parseSession(req: Request): { clientId: string } | null {
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(/rana_session=([^;]+)/);
  if (!match) return null;
  try {
    const payload = JSON.parse(Buffer.from(match[1], "base64").toString());
    if (payload.exp < Date.now()) return null;
    return { clientId: payload.clientId };
  } catch { return null; }
}
export async function GET(req: Request) {
  const session = parseSession(req);
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const client = await getClientById(session.clientId);
  if (!client) return Response.json({ error: "Client not found" }, { status: 404 });
  return Response.json({ id: client.id, name: client.name, industry: client.industry, sarvam_app_id: client.sarvam_app_id });
}
export async function POST() {
  const headers = new Headers();
  headers.set("Set-Cookie", "rana_session=; Path=/; HttpOnly; Max-Age=0");
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}
