import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/webhooks"];

function hasValidSession(req: NextRequest): boolean {
  const raw = req.cookies.get("rana_session")?.value;
  if (!raw) return false;
  try {
    const payload = JSON.parse(atob(raw));
    return Boolean(payload?.clientId) && payload.exp > Date.now();
  } catch { return false; }
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  if (hasValidSession(req)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico)).*)"],
};
