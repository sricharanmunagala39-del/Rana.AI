/**
 * Catch-all proxy — keeps SARVAM_API_KEY server-side.
 * Handles /api/sarvam-session/* → forwards to https://apps.sarvam.ai/api/app-runtime/*
 */
export const runtime = "nodejs";

async function proxy(req: Request, method: string) {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "SARVAM_API_KEY not set" }, { status: 500 });
  }

  const incomingUrl = new URL(req.url);
  // Strip /api/sarvam-session prefix → append to Sarvam base
  const subPath = incomingUrl.pathname.replace(/^\/api\/sarvam-session\/?/, "");
  const sarvamUrl = `https://apps.sarvam.ai/api/app-runtime/${subPath}${incomingUrl.search}`;

  console.log(`[sarvam-proxy] ${method} ${sarvamUrl}`);

  const body = method !== "GET" ? await req.text().catch(() => undefined) : undefined;

  const forwarded = await fetch(sarvamUrl, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    ...(body ? { body } : {}),
  });

  const text = await forwarded.text();
  return new Response(text, {
    status: forwarded.status,
    headers: {
      "Content-Type": forwarded.headers.get("Content-Type") || "application/json",
    },
  });
}

export const GET  = (req: Request) => proxy(req, "GET");
export const POST = (req: Request) => proxy(req, "POST");
