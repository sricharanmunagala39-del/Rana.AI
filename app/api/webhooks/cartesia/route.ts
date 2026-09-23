/**
 * POST /api/webhooks/cartesia?key=<client cartesia_webhook_secret>
 * Receives post-call webhooks from Cartesia Managed Agents (call_completed / call_failed)
 * and stores them as rows in `calls`, same table Sarvam's webhook already feeds.
 *
 * Client resolution: ?key= only, matched against clients.cartesia_webhook_secret — the URL
 * we register with Cartesia already has this baked in (see /api/admin/cartesia-agent).
 *
 * Cartesia also echoes the shared secret in the X-Webhook-Secret header on every delivery.
 * That's checked here too, but only logged (not hard-enforced) until a real delivery
 * confirms the header format matches the docs.
 */
export const runtime = "nodejs";
import { getClientByCartesiaWebhookSecret, upsertCall, payloadToCallFromCartesia } from "@/lib/calls";

export async function POST(req: Request) {
  let payload: any;
  try { payload = await req.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const key = new URL(req.url).searchParams.get("key");
  const client = key ? await getClientByCartesiaWebhookSecret(key) : null;
  if (!client) return Response.json({ error: "Unknown client" }, { status: 404 });

  const headerSecret = req.headers.get("x-webhook-secret");
  if (headerSecret && client.cartesia_webhook_secret && headerSecret !== client.cartesia_webhook_secret) {
    console.warn("[cartesia webhook] X-Webhook-Secret header did not match the stored secret — verify against Cartesia's docs if this keeps happening");
  }

  // Only ingest terminal call events; ignore in-flight turn/log events if Cartesia ever
  // sends those to the same webhook.
  const type = payload?.type;
  if (type && type !== "call_completed" && type !== "call_failed") {
    return Response.json({ ok: true, skipped: type });
  }

  try {
    const row = payloadToCallFromCartesia(payload, client.id);
    if (!row.interaction_id) row.interaction_id = `cartesia-${client.id.slice(0, 8)}-${Date.now()}`;
    const saved = await upsertCall(row);
    return Response.json({ ok: true, id: saved.id, lead_status: saved.lead_status });
  } catch (err: any) {
    console.error("[cartesia webhook] failed", err?.message);
    return Response.json({ error: err?.message || "Failed to store call" }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({ ok: true, service: "rana-webhook-cartesia" });
}
