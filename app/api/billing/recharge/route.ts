export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { hasRole } from "@/lib/auth";
import { getClientById } from "@/lib/supabase";
import { audit } from "@/lib/audit";
import { offlinePayment } from "@/lib/billing";
import { rechargeInvoice } from "@/lib/autoRecharge";
import { MIN_RECHARGE } from "@/lib/wallet";

/** POST { amount } → GST invoice for prepaid calling credit + Razorpay link. Owners and admins on a paid plan. */
export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  if (!hasRole(session, "admin")) return Response.json({ error: "Only owners and admins can recharge." }, { status: 403 });
  const c: any = await getClientById(session.clientId);
  if (!c) return Response.json({ error: "Workspace not found" }, { status: 404 });
  if (c.plan === "trial") return Response.json({ error: "Pick a plan first — recharges add minutes on top of a plan." }, { status: 400 });
  if (!c.billing_name) return Response.json({ error: "Add your billing details first — they're printed on the invoice.", code: "billing_details" }, { status: 400 });
  const amount = Math.round(Number((await req.json().catch(() => ({} as any))).amount));
  if (!(amount >= MIN_RECHARGE) || amount > 1_000_000) return Response.json({ error: `Recharge between ₹${MIN_RECHARGE.toLocaleString("en-IN")} and ₹10,00,000.` }, { status: 400 });
  try {
    const { invoice, linkError } = await rechargeInvoice(c, amount, { origin: new URL(req.url).origin, createdBy: session.email });
    await audit(session, "invoice_created", { req, targetType: "invoice", targetId: invoice.id, detail: { number: invoice.number, kind: "recharge", total: invoice.total } });
    return Response.json({ invoice, payUrl: invoice.rzp_link_url || null, offline: offlinePayment(), linkError: linkError ? "Online payment is unavailable right now — pay by bank transfer or UPI below." : null }, { status: 201 });
  } catch (e: any) { return Response.json({ error: String(e?.message || e) }, { status: 500 }); }
}
