export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { hasRole } from "@/lib/auth";
import { getClientById } from "@/lib/supabase";
import { audit } from "@/lib/audit";
import { checkoutQuote, createInvoice, listInvoices, offlinePayment, SELF_SERVE, type Interval } from "@/lib/billing";
import { razorpayConfigured } from "@/lib/razorpay";
import type { PlanKey } from "@/lib/plans";

/** POST { plan, interval } → a GST invoice for the plan and a Razorpay link to pay it (or bank details when Razorpay is off). */
export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  if (!hasRole(session, "admin")) return Response.json({ error: "Only owners and admins can buy a plan." }, { status: 403 });
  const b = await req.json().catch(() => ({} as any));
  const plan = b.plan as PlanKey;
  const interval: Interval = b.interval === "annual" ? "annual" : "monthly";
  if (!SELF_SERVE.includes(plan)) return Response.json({ error: "Pick Starter, Growth or Scale. Enterprise is set up with RANA directly." }, { status: 400 });
  const c: any = await getClientById(session.clientId);
  if (!c) return Response.json({ error: "Workspace not found" }, { status: 404 });
  if (!c.billing_name) return Response.json({ error: "Add your billing details first — they're printed on the invoice.", code: "billing_details" }, { status: 400 });
  // Same plan asked for again within a week → reuse that unpaid invoice instead of issuing a new number.
  const open = (await listInvoices(c.id)).find((i) => i.status === "issued" && i.kind === "plan" && i.plan === plan && i.interval === interval && Date.now() - Date.parse(i.created_at) < 7 * 86400e3);
  if (open && (open.rzp_link_url || !razorpayConfigured())) return Response.json({ invoice: open, payUrl: open.rzp_link_url, offline: offlinePayment(), reused: true });
  const q = checkoutQuote(c, plan, interval);
  if (q.error) return Response.json({ error: q.error }, { status: 400 });
  try {
    const { invoice, linkError } = await createInvoice(c, { kind: "plan", plan, interval, items: q.items, createdBy: session.email, origin: new URL(req.url).origin });
    await audit(session, "invoice_created", { req, targetType: "invoice", targetId: invoice.id, detail: { number: invoice.number, plan, interval, total: invoice.total } });
    return Response.json({ invoice, payUrl: invoice.rzp_link_url || null, offline: offlinePayment(), linkError: linkError ? "Online payment is unavailable right now — pay by bank transfer or UPI below." : null }, { status: 201 });
  } catch (e: any) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
