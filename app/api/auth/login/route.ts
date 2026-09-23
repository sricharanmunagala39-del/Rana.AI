// @ts-nocheck
export const runtime = "nodejs";
import { getClientByEmail } from "@/lib/supabase";
export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) return Response.json({ error: "Email and password required" }, { status: 400 });
    const client = await getClientByEmail(email.toLowerCase().trim());
    if (!client || client.login_password !== password) return Response.json({ error: "Invalid email or password" }, { status: 401 });
    if (!client.is_active) return Response.json({ error: "Account disabled" }, { status: 403 });
    const sessionPayload = Buffer.from(JSON.stringify({ clientId: client.id, email: client.login_email, exp: Date.now() + 7*24*60*60*1000 })).toString("base64");
    const headers = new Headers();
    headers.set("Set-Cookie", `rana_session=${sessionPayload}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7*24*3600}`);
    headers.set("Content-Type", "application/json");
    return new Response(JSON.stringify({ client: { id: client.id, name: client.name, industry: client.industry, sarvam_app_id: client.sarvam_app_id } }), { status: 200, headers });
  } catch (err: any) {
    return Response.json({ error: "Login failed" }, { status: 500 });
  }
}
