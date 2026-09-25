import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/signup", "/api/auth/login", "/api/auth/signup", "/api/auth/2fa", "/api/webhooks", "/api/cron", "/landing", "/legal", "/blog", "/robots.txt", "/sitemap.xml", "/opengraph-image", "/api/sarvam/diagnose"];
// While RANA HQ looks inside a client's workspace read-only, these are the only writes allowed.
const RO_ALLOWED = ["/api/hq/return", "/api/auth/me"];

// Edge runtime: verify the HMAC-signed session cookie with Web Crypto (same scheme as lib/auth.ts).
async function sessionPayload(req: NextRequest): Promise<any | null> {
  const raw = req.cookies.get("rana_session")?.value;
  const secret = process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_KEY;
  if (!raw || !secret) return null;
  try {
    const [data, sig] = raw.split(".");
    if (!data || !sig) return null;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
    const expected = Array.from(mac).map((b) => b.toString(16).padStart(2, "0")).join("");
    if (expected.length !== sig.length) return null;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
    if (diff !== 0) return null;
    const json = atob(data.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json);
    return payload?.clientId && payload.exp > Date.now() ? payload : null;
  } catch { return null; }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  const s = await sessionPayload(req);
  if (s) {
    if (s.hqFrom) {
      // Timed HQ visit ran out → straight back to HQ.
      if (s.hqExp && s.hqExp < Date.now() && pathname !== "/api/hq/return") {
        if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Your support visit has ended. Go back to HQ." }, { status: 401 });
        const url = req.nextUrl.clone(); url.pathname = "/api/hq/return"; url.search = ""; return NextResponse.redirect(url);
      }
      if (s.hqRO && req.method !== "GET" && req.method !== "HEAD" && pathname.startsWith("/api/") && !RO_ALLOWED.includes(pathname))
        return NextResponse.json({ error: "Read-only support visit: nothing can be changed. Go back to HQ and open the workspace with editing on." }, { status: 403 });
    }
    return NextResponse.next();
  }
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
