import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/webhooks", "/api/cron", "/landing"];

// Edge runtime: verify the HMAC-signed session cookie with Web Crypto (same scheme as lib/auth.ts).
async function hasValidSession(req: NextRequest): Promise<boolean> {
  const raw = req.cookies.get("rana_session")?.value;
  const secret = process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_KEY;
  if (!raw || !secret) return false;
  try {
    const [data, sig] = raw.split(".");
    if (!data || !sig) return false;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
    const expected = Array.from(mac).map((b) => b.toString(16).padStart(2, "0")).join("");
    if (expected.length !== sig.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
    if (diff !== 0) return false;
    const json = atob(data.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json);
    return Boolean(payload?.clientId) && payload.exp > Date.now();
  } catch { return false; }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  if (await hasValidSession(req)) return NextResponse.next();
  // Logged-out visitors to the root see the public ranaai.in page instead of being bounced to /login.
  if (pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = "/landing";
    return NextResponse.rewrite(url);
  }
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico)).*)"],
};
