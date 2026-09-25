export const runtime = "nodejs";
import crypto from "crypto";
import { sb } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getInvoice, markPaid } from "@/lib/billing";
import { verifyWebhookSignature, razorpayWebhookConfigured, razorpayConfigured, razorpayMode, listPaymentLinks } from "@/lib/razorpay";

/** GET ?key=… — ops check: are the Razorpay keys accepted? Read-only (lists 1 payment link). Same key as /api/sarvam/diagnose. */
export async function GET(req: Request) {
  const secret = process.env.SESSION_SECRET || "";
  const want = crypto.createHmac("sha256", secret).update("sarvam-diagnose").digest("hex");
  const got = new URL(req.url).searchParams.get("key") || "";
  if (!secret || got.length !== want.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want))) return Response.json({ error: "Forbidden" }, { status: 403 });
  const out: any = { keys: razorpayConfigured(), mode: razorpayMode(), webhookSecret: razorpayWebhookConfigured() };
  try { const r = await listPaymentLinks(1); out.apiOk = true; out.linksSeen = r.count ?? r.payment_links?.length ?? 0; }
  catch (e: any) { out.apiOk = false; out.error = String(e?.message || e).slice(0, 200); }
  return Response.json(out);
}

/**
 * Razorpay → RANA. Set up in Razorpay Dashboard → Settings → Webhooks:
 *   URL  https://<app>/api/webhooks/razorpay   Secret = RAZORPAY_WEBHOOK_SECRET   Events: payment_link.paid
 * Every event is signed; each event id is handled once.
 */
export async function POST(req: Request) {
  if (!razorpayWebhookConfigured()) return Response.json({ error: "Webhook secret not set" }, { status: 503 });
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("x-razorpay-signature"))) return Response.json({ error: "Bad signature" }, { status: 401 });
  let body: any; try { body = JSON.parse(raw); } catch { return Response.json({ error: "Bad JSON" }, { status: 400 }); }
  const eventId = req.headers.get("x-razorpay-event-id") || `${body.event}:${body.payload?.payment?.entity?.id || body.created_at}`;
  try {
    await sb(`/razorpay_events`, { method: "POST", prefer: "return=minimal", body: JSON.stringify({ id: eventId, event: body.event, payload: body }) });
  } catch (e: any) {
    if (!/409|duplicate/i.test(String(e?.message))) throw e;
    // Seen before: done unless last time failed on our side (then try again — markPaid is safe to repeat).
    const prev = (await sb<any[]>(`/razorpay_events?id=eq.${encodeURIComponent(eventId)}&select=result`).catch(() => []))?.[0];
    if (!prev || !String(prev.result || "error").startsWith("error")) return Response.json({ ok: true, duplicate: true });
  }
  let result = "ignored";
  try {
    if (body.event === "payment_link.paid") {
      const link = body.payload?.payment_link?.entity || {};
      const pay = body.payload?.payment?.entity || {};
      const inv = await getInvoice(String(link.reference_id || link.notes?.invoice_id || ""));
      if (!inv) result = "no invoice";
      else if (inv.rzp_link_id && link.id && inv.rzp_link_id !== link.id) result = "link mismatch";
      else if (Math.round(Number(inv.total) * 100) > Number(link.amount_paid ?? pay.amount ?? 0)) result = "underpaid";
      else {
        const r = await markPaid(inv.id, { via: `razorpay${pay.method ? ` (${pay.method})` : ""}`, paymentId: pay.id || null });
        result = r.already ? "already paid" : "paid";
        if (!r.already) await audit({ clientId: inv.client_id, email: "razorpay" }, "invoice_paid", { req, targetType: "invoice", targetId: inv.id, detail: { number: inv.number, total: inv.total, via: "razorpay", payment: pay.id } });
      }
    }
  } catch (e: any) { result = "error: " + String(e?.message || e).slice(0, 300); }
  await sb(`/razorpay_events?id=eq.${encodeURIComponent(eventId)}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ result }) }).catch(() => {});
  // 5xx makes Razorpay retry — only for our own failures.
  return Response.json({ ok: !result.startsWith("error"), result }, { status: result.startsWith("error") ? 500 : 200 });
}
