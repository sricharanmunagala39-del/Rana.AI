/**
 * Proxy — keeps SARVAM_API_KEY server-side.
 * sarvam-conv-ai-sdk points baseUrl here; we forward to Sarvam and inject the key.
 */
export const runtime = "nodejs";

async function proxy(req: Request, method: string) {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) return Response.json({ error: "SARVAM_API_KEY not set" }, { status: 500 });

  const incomingUrl = new URL(req.url);
  const path = incomingUrl.pathname.replace(/^\/api\/sarvam-session/, "");
  const sarvamUrl = `https://apps.sarvam.ai${path}${incomingUrl.search}`;

  const body = method !== "GET" ? await req.text().catch(() => undefined) : undefined;

  const forwarded = await fetch(sarvamUrl, {
    method,
    headers: {
      ...(req.headers.get("Content-Type") ? { "Content-Type": req.headers.get("Content-Type")! } : {}),
      "X-API-Key": apiKey,
    },
    body,
  });

  const text = await forwarded.text();
  return new Response(text, {
    status: forwarded.status,
    headers: { "Content-Type": forwarded.headers.get("Content-Type") || "application/json" },
  });
}

export const GET  = (req: Request) => proxy(req, "GET");
export const POST = (req: Request) => proxy(req, "POST");
