export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { hasRole } from "@/lib/auth";
import { getClientById } from "@/lib/supabase";
import { sb } from "@/lib/db";
import { audit } from "@/lib/audit";
import { razorpayConfigured, razorpayMode } from "@/lib/razorpay";
import { listInvoices, billingState, offlinePayment, seller, checkoutQuote, taxFor, buyerOf, r2, SELF_SERVE, STATE_NAMES, GSTIN_RE, stateOfGstin } from "@/lib/billing";

const profileOf = (c: any) => ({
  name: c.billing_name || "", gstin: c.billing_gstin || "", address: c.billing_address || "",
  state: c.billing_state || "", email: c.billing_email || "", phone: c.billing_phone || "",
});

/** GET → billing details, invoices, billing health, and what each plan would cost this workspace today (GST included). */
export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const c: any = await getClientById(session.clientId);
  if (!c) return Response.json({ error: "Workspace not found" }, { status: 404 });
  const invoices = await listInvoices(c.id);
  const s = seller();
  const buyer = buyerOf(c);
  const quotes: Record<string, any> = {};
  for (const plan of SELF_SERVE) for (const interval of ["monthly", "annual"] as const) {
    const q = checkoutQuote(c, plan, interval);
    const sub = r2(q.items.reduce((a, i) => a + i.amount, 0));
    quotes[`${plan}:${interval}`] = q.error ? { error: q.error } : { items: q.items, subtotal: sub, ...taxFor(sub, s, buyer.state) };
  }
  return Response.json({
    profile: profileOf(c), invoices, state: billingState(c, invoices), quotes,
    canPay: hasRole(session, "admin"), plan: c.plan,
    razorpay: { enabled: razorpayConfigured(), mode: razorpayMode() },
    offline: offlinePayment(), gstRegistered: !!s.gstin, states: STATE_NAMES,
  });
}

/** PUT → billing details printed on invoices. Admins and owners. */
export async function PUT(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  if (!hasRole(session, "admin")) return Response.json({ error: "Only owners and admins can change billing details." }, { status: 403 });
  const b = await req.json().catch(() => ({} as any));
  const clean = (v: any, n: number) => String(v ?? "").trim().slice(0, n);
  const gstin = clean(b.gstin, 15).toUpperCase().replace(/\s/g, "");
  if (gstin && !GSTIN_RE.test(gstin)) return Response.json({ error: "That GSTIN doesn't look right — it's 15 characters, like 36ABCDE1234F1Z5." }, { status: 400 });
  const email = clean(b.email, 120).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: "Enter a valid billing email." }, { status: 400 });
  const phone = clean(b.phone, 20).replace(/[^\d+]/g, "");
  if (phone && !/^\+?\d{10,13}$/.test(phone)) return Response.json({ error: "Enter a 10-digit mobile number." }, { status: 400 });
  const state = stateOfGstin(gstin) || (STATE_NAMES.includes(clean(b.state, 60)) ? clean(b.state, 60) : "");
  const name = clean(b.name, 150);
  if (!name) return Response.json({ error: "Enter the business name to print on invoices." }, { status: 400 });
  const patch = { billing_name: name, billing_gstin: gstin || null, billing_address: clean(b.address, 400) || null, billing_state: state || null, billing_email: email || null, billing_phone: phone || null };
  const [c] = await sb<any[]>(`/clients?id=eq.${session.clientId}`, { method: "PATCH", body: JSON.stringify(patch) });
  await audit(session, "billing_details_changed", { req, targetType: "client", targetId: session.clientId, detail: { gstin: !!gstin, state } });
  return Response.json({ ok: true, profile: profileOf(c) });
}
