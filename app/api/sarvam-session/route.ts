/** Base proxy route (no sub-path). Requires a logged-in session. Key stays server-side. */
export const runtime = "nodejs";
import { parseSession, unauthorized } from "@/lib/auth";

async function proxy(req: Request, method: string) {
  if (!parseSession(req)) return unauthorized();
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) return Response.json({ error: "Voice engine key not set" }, { status: 500 });

  const incomingUrl = new URL(req.url);
  const path = incomingUrl.pathname.replace(/^\/api\/sarvam-session/, "") || "/";
  const target = `https://apps.sarvam.ai${path}${incomingUrl.search}`;
  const body = method !== "GET" ? await req.text().catch(() => undefined) : undefined;

  const forwarded = await fetch(target, {
    method,
    headers: { "Content-Type": req.headers.get("Content-Type") || "application/json", "X-API-Key": apiKey },
    ...(body ? { body } : {}),
  });
  const text = await forwarded.text();
  return new Response(text, { status: forwarded.status, headers: { "Content-Type": forwarded.headers.get("Content-Type") || "application/json" } });
}

export const GET  = (req: Request) => proxy(req, "GET");
export const POST = (req: Request) => proxy(req, "POST");
