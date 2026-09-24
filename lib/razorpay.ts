// Razorpay (server only). Everything here switches on when RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET are set in Vercel.
// We use Payment Links: one link per invoice. The client pays by UPI, card, netbanking or wallet on Razorpay's page,
// Razorpay sends the receipt, and we mark the invoice paid from the webhook (or from the signed redirect back).
import crypto from "crypto";

const API = "https://api.razorpay.com/v1";

export function razorpayConfigured(): boolean {
  return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}
export function razorpayWebhookConfigured(): boolean {
  return !!process.env.RAZORPAY_WEBHOOK_SECRET;
}
/** Test keys start rzp_test_ — the UI says so, so nobody thinks a test payment was real money. */
export function razorpayMode(): "live" | "test" | null {
  const k = process.env.RAZORPAY_KEY_ID || "";
  return !k ? null : k.startsWith("rzp_live_") ? "live" : "test";
}

async function rzp<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  if (!razorpayConfigured()) throw new Error("Razorpay isn't connected yet.");
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const r = await fetch(API + path, {
    ...init,
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json", ...(init.headers || {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const text = await r.text();
  let j: any = null; try { j = text ? JSON.parse(text) : null; } catch {}
  if (!r.ok) throw new Error(`Razorpay ${r.status}: ${j?.error?.description || text.slice(0, 200)}`);
  return j as T;
}

export type PaymentLink = { id: string; short_url: string; status: string; amount: number; amount_paid?: number; reference_id?: string; payments?: any[] };

export async function createPaymentLink(o: {
  amountRupees: number; description: string; referenceId: string;
  customer: { name?: string | null; email?: string | null; contact?: string | null };
  notes?: Record<string, string>; callbackUrl?: string; expireInDays?: number; notify?: boolean;
}): Promise<PaymentLink> {
  const customer: any = {};
  if (o.customer.name) customer.name = String(o.customer.name).slice(0, 100);
  if (o.customer.email) customer.email = o.customer.email;
  if (o.customer.contact) customer.contact = String(o.customer.contact).replace(/[^\d+]/g, "");
  const body: any = {
    amount: Math.round(o.amountRupees * 100), currency: "INR", accept_partial: false,
    description: o.description.slice(0, 2000), reference_id: o.referenceId.slice(0, 40),
    customer, notify: { sms: !!(o.notify && customer.contact), email: !!(o.notify && customer.email) },
    reminder_enable: true, notes: o.notes || {},
  };
  if (o.expireInDays) body.expire_by = Math.floor(Date.now() / 1000) + o.expireInDays * 86400;
  if (o.callbackUrl) { body.callback_url = o.callbackUrl; body.callback_method = "get"; }
  return rzp<PaymentLink>("/payment_links", { method: "POST", body: JSON.stringify(body) });
}

export async function fetchPaymentLink(id: string): Promise<PaymentLink> {
  return rzp<PaymentLink>(`/payment_links/${encodeURIComponent(id)}`);
}

export async function cancelPaymentLink(id: string): Promise<void> {
  await rzp(`/payment_links/${encodeURIComponent(id)}/cancel`, { method: "POST", body: "{}" }).catch((e) => {
    // Already paid / cancelled / expired links can't be cancelled — that's fine.
    if (!/status|cancel|paid|expired/i.test(String(e?.message))) throw e;
  });
}

function safeEqualHex(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b)); } catch { return false; }
}

/** X-Razorpay-Signature = HMAC-SHA256(raw body, webhook secret). */
export function verifyWebhookSignature(rawBody: string, signature: string | null, secret = process.env.RAZORPAY_WEBHOOK_SECRET || ""): boolean {
  if (!secret || !signature) return false;
  return safeEqualHex(crypto.createHmac("sha256", secret).update(rawBody).digest("hex"), signature);
}

/** The redirect back from a paid link: signature = HMAC-SHA256(link_id|reference_id|status|payment_id, key secret). */
export function verifyLinkCallback(p: { linkId: string; referenceId: string; status: string; paymentId: string; signature: string }, secret = process.env.RAZORPAY_KEY_SECRET || ""): boolean {
  if (!secret) return false;
  const want = crypto.createHmac("sha256", secret).update(`${p.linkId}|${p.referenceId}|${p.status}|${p.paymentId}`).digest("hex");
  return safeEqualHex(want, p.signature);
}
