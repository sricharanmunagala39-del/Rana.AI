export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { requireHq } from "@/lib/hq";
import { sb } from "@/lib/db";
import { audit } from "@/lib/audit";
import { PLANS, type PlanKey } from "@/lib/plans";
import { listInvoices, billingState, createInvoice, checkoutQuote, planPrice, addMonths, addDays, todayIST, r2, SELF_SERVE, seller, type Item, type Interval } from "@/lib/billing";
import { razorpayConfigured, razorpayMode } from "@/lib/razorpay";

async function load(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return (await sb<any[]>(`/clients?id=eq.${id}&is_hq=eq.false&limit=1`))?.[0] ?? null;
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  const denied = requireHq(session); if (denied) return denied;
  const c = await load(params.id);
  if (!c) return Response.json({ error: "Client not found" }, { status: 404 });
  const invoices = await listInvoices(c.id);
  return Response.json({ invoices, state: billingState(c, invoices), razorpay: { enabled: razorpayConfigured(), mode: razorpayMode() }, gstRegistered: !!seller().gstin, hasBillingDetails: !!c.billing_name });
}

/**
 * POST — HQ issues an invoice.
 *  { mode: "plan", plan, interval, waiveOnboarding? }  → plan invoice; paying it switches the plan on and starts auto-renewal
 *  { mode: "custom", items: [{description, qty, rate}], dueDays?, notes? } → one-off (set-up, number rental, pilot fee…)
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  const denied = requireHq(session, "billing"); if (denied) return denied;
  const c = await load(params.id);
  if (!c) return Response.json({ error: "Client not found" }, { status: 404 });
  const b = await req.json().catch(() => ({} as any));
  const notify = b.notify !== false;
  const origin = new URL(req.url).origin;
  try {
    let r;
    if (b.mode === "plan") {
      const plan = b.plan as PlanKey; const interval: Interval = b.interval === "annual" ? "annual" : "monthly";
      if (!SELF_SERVE.includes(plan)) return Response.json({ error: "Plan invoices are for Starter, Growth or Scale. Use a custom invoice for Enterprise." }, { status: 400 });
      const q = checkoutQuote(b.waiveOnboarding ? { ...c, onboarding_paid: true } : c, plan, interval);
      if (q.error) return Response.json({ error: q.error }, { status: 400 });
      r = await createInvoice(c, { kind: "plan", plan, interval, items: q.items, createdBy: `HQ ${session!.email}`, notify, origin, notes: b.notes || null });
    } else {
      const items: Item[] = (Array.isArray(b.items) ? b.items : []).slice(0, 20).map((i: any) => {
        const qty = Math.max(0.01, Number(i.qty) || 1), rate = r2(Number(i.rate) || 0);
        return { description: String(i.description || "").trim().slice(0, 300), qty, rate, amount: r2(qty * rate) };
      }).filter((i: Item) => i.description && i.amount !== 0);
      if (!items.length) return Response.json({ error: "Add at least one line with a description and amount." }, { status: 400 });
      const dueDays = Math.max(0, Math.min(60, Number(b.dueDays ?? 7)));
      r = await createInvoice(c, { kind: "custom", items, dueDate: addDays(todayIST(), dueDays), createdBy: `HQ ${session!.email}`, notify, origin, notes: String(b.notes || "").slice(0, 500) || null });
    }
    await audit(session!, "invoice_created", { req, targetType: "invoice", targetId: r.invoice.id, detail: { client: c.name, number: r.invoice.number, total: r.invoice.total } });
    await audit({ clientId: c.id, email: session!.email }, "invoice_created", { req, targetType: "invoice", targetId: r.invoice.id, detail: { by: "RANA HQ", number: r.invoice.number, total: r.invoice.total } });
    return Response.json({ ok: true, invoice: r.invoice, linkError: r.linkError }, { status: 201 });
  } catch (e: any) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
