export const runtime = "nodejs";
import { getClientByEmail, updateClient } from "@/lib/supabase";
import { verifyPassword, hashPassword, isHashed, createSessionCookie } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) return Response.json({ error: "Email and password required" }, { status: 400 });

    const client = await getClientByEmail(String(email).toLowerCase().trim());
    if (!client || !verifyPassword(password, client.login_password)) {
      return Response.json({ error: "Invalid email or password" }, { status: 401 });
    }
    if (!client.is_active) return Response.json({ error: "Account disabled" }, { status: 403 });

    // Transparently upgrade legacy plaintext passwords to scrypt hashes on first successful login.
    if (!isHashed(client.login_password)) {
      try { await updateClient(client.id, { login_password: hashPassword(password) }); } catch { /* non-fatal */ }
    }

    const headers = new Headers();
    headers.set("Set-Cookie", createSessionCookie(client.id, client.login_email));
    headers.set("Content-Type", "application/json");
    return new Response(JSON.stringify({
      client: { id: client.id, name: client.name, industry: client.industry, sarvam_app_id: client.sarvam_app_id },
    }), { status: 200, headers });
  } catch {
    return Response.json({ error: "Login failed" }, { status: 500 });
  }
}
