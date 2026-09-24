export const runtime = "nodejs";
import { getClientByEmail, getClientById } from "@/lib/supabase";
import { verifyPassword, createSessionCookie } from "@/lib/auth";
import { getUserByEmail, createUser, updateUser, normaliseEmail, type UserRow } from "@/lib/users";
import { audit } from "@/lib/audit";

// Slows down password guessing: 8 failures per email+IP in 15 minutes locks that pair for the rest of the window.
const failures = new Map<string, { n: number; first: number }>();
const WINDOW_MS = 15 * 60_000;
const MAX_FAILS = 8;

function ip(req: Request) { return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "?"; }
function locked(key: string) {
  const f = failures.get(key);
  if (!f) return false;
  if (Date.now() - f.first > WINDOW_MS) { failures.delete(key); return false; }
  return f.n >= MAX_FAILS;
}
function fail(key: string) {
  const f = failures.get(key);
  if (!f || Date.now() - f.first > WINDOW_MS) failures.set(key, { n: 1, first: Date.now() });
  else f.n++;
}

export async function POST(req: Request) {
  try {
    const { email: rawEmail, password } = await req.json();
    const email = normaliseEmail(rawEmail);
    if (!email || !password) return Response.json({ error: "Email and password required" }, { status: 400 });
    const key = `${email}|${ip(req)}`;
    if (locked(key)) return Response.json({ error: "Too many attempts. Wait 15 minutes and try again." }, { status: 429 });

    let user: UserRow | null = await getUserByEmail(email);

    if (user) {
      if (!verifyPassword(password, user.password_hash)) {
        fail(key);
        await audit({ clientId: user.client_id, email, userId: user.id }, "login_failed", { req });
        return Response.json({ error: "Invalid email or password" }, { status: 401 });
      }
      if (!user.is_active) return Response.json({ error: "Your access has been removed. Ask your team's owner or admin." }, { status: 403 });
    } else {
      // The company's original shared login. On first use it becomes that person's own Owner account.
      const client = await getClientByEmail(email);
      if (!client || !verifyPassword(password, client.login_password)) {
        fail(key);
        if (client) await audit({ clientId: client.id, email }, "login_failed", { req });
        return Response.json({ error: "Invalid email or password" }, { status: 401 });
      }
      if (!client.is_active) return Response.json({ error: "Account disabled" }, { status: 403 });
      user = await createUser({ clientId: client.id, email, name: client.name, password, role: "owner", mustChange: false });
    }

    const client = await getClientById(user.client_id);
    if (!client || !client.is_active) return Response.json({ error: "Account disabled" }, { status: 403 });

    failures.delete(key);
    await updateUser(user.id, { last_login_at: new Date().toISOString() } as any).catch(() => null);
    await audit({ clientId: client.id, email, userId: user.id }, "login", { req });

    const headers = new Headers();
    headers.set("Set-Cookie", createSessionCookie(client.id, user.email, { userId: user.id, role: user.role, name: user.name }));
    headers.set("Content-Type", "application/json");
    return new Response(JSON.stringify({
      client: { id: client.id, name: client.name, industry: client.industry },
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      mustChangePassword: !!user.must_change_password,
      home: (client as any).is_hq ? "/hq" : "/",
    }), { status: 200, headers });
  } catch (e: any) {
    console.error("[login]", e?.message);
    return Response.json({ error: "Login failed" }, { status: 500 });
  }
}
