/**
 * POST /api/webhooks/sarvam?key=<client webhook_secret>
 * Receives post-call webhooks from the voice engine (deployment / campaign / instant outbound)
 * and stores them as rows in `calls` for the right client.
 *
 * Client resolution: ?key= (preferred, per-client secret) -> app_id match on clients.sarvam_app_id.
 */
export const runtime = "nodejs";
import { getClientByWebhookSecret, getClientByAppId, upsertCall, payloadToCall } from "@/lib/calls";

export async function POST(req: Request) {
  let payload: any;
  try { payload = await req.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const key = new URL(req.url).searchParams.get("key");
  let client = key ? await getClientByWebhookSecret(key) : null;
  if (!client && payload?.app_id) client = await getClientByAppId(payload.app_id);
  if (!client) return Response.json({ error: "Unknown client" }, { status: 404 });

  try {
    const row = payloadToCall(payload, client.id);
    if (!row.interaction_id) row.interaction_id = `manual-${client.id.slice(0, 8)}-${Date.now()}`;
    const saved = await upsertCall(row);
    return Response.json({ ok: true, id: saved.id, lead_status: saved.lead_status });
  } catch (err: any) {
    console.error("[webhook] failed", err?.message);
    return Response.json({ error: err?.message || "Failed to store call" }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({ ok: true, service: "rana-webhook" });
}
