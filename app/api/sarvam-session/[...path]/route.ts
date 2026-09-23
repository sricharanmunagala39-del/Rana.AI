/**
 * Catch-all proxy: /api/sarvam-session/* -> https://apps.sarvam.ai/api/app-runtime/*
 * Requires a logged-in session. The engine API key is injected here and never sent to the browser.
 */
export const runtime = "nodejs";
import { parseSession, unauthorized } from "@/lib/auth";

async function proxy(req: Request, method: string) {
  if (!parseSession(req)) return unauthorized();
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) return Response.json({ error: "Voice engine key not set" }, { status: 500 });

  const incomingUrl = new URL(req.url);
  const subPath = incomingUrl.pathname.replace(/^\/api\/sarvam-session\/?/, "");
  const target = `https://apps.sarvam.ai/api/app-runtime/${subPath}${incomingUrl.search}`;
  const body = method !== "GET" ? await req.text().catch(() => undefined) : undefined;

  const forwarded = await fetch(target, {
    method,
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
    ...(body ? { body } : {}),
  });
  const text = await forwarded.text();
  return new Response(text, { status: forwarded.status, headers: { "Content-Type": forwarded.headers.get("Content-Type") || "application/json" } });
}

export const GET  = (req: Request) => proxy(req, "GET");
export const POST = (req: Request) => proxy(req, "POST");
