export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { audit } from "@/lib/audit";
import { getInvoice, markPaid } from "@/lib/billing";
import { verifyLinkCallback, fetchPaymentLink, razorpayConfigured } from "@/lib/razorpay";

/**
 * POST — the browser lands back on /billing after paying, with Razorpay's signed query string. We check the signature
 * (or ask Razorpay directly) and switch the plan on immediately, so it doesn't depend on the webhook arriving first.
 */
export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const b = await req.json().catch(() => ({} as any));
  const inv = await getInvoice(String(b.invoice || b.razorpay_payment_link_reference_id || ""));
  if (!inv || inv.client_id !== session.clientId) return Response.json({ error: "Invoice not found" }, { status: 404 });
  if (inv.status === "paid") return Response.json({ ok: true, paid: true, invoice: inv });
  const linkId = String(b.razorpay_payment_link_id || "");
  if (!inv.rzp_link_id || (linkId && linkId !== inv.rzp_link_id)) return Response.json({ ok: true, paid: false, invoice: inv });
  let paymentId = String(b.razorpay_payment_id || "");
  let paid = false;
  if (b.razorpay_signature && verifyLinkCallback({ linkId, referenceId: String(b.razorpay_payment_link_reference_id || ""), status: String(b.razorpay_payment_link_status || ""), paymentId, signature: String(b.razorpay_signature) }))
    paid = b.razorpay_payment_link_status === "paid" && b.razorpay_payment_link_reference_id === inv.id;
  else if (razorpayConfigured()) {
    const link = await fetchPaymentLink(inv.rzp_link_id).catch(() => null);
    paid = link?.status === "paid";
    paymentId = paymentId || link?.payments?.[0]?.payment_id || "";
  }
  if (!paid) return Response.json({ ok: true, paid: false, invoice: inv });
  const r = await markPaid(inv.id, { via: "razorpay", paymentId });
  if (!r.already) await audit({ clientId: inv.client_id, email: session.email, userId: session.userId }, "invoice_paid", { req, targetType: "invoice", targetId: inv.id, detail: { number: inv.number, total: inv.total, via: "razorpay" } });
  return Response.json({ ok: true, paid: true, invoice: await getInvoice(inv.id) });
}
