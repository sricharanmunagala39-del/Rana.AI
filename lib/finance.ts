// RANA HQ money view: what came in (Razorpay/bank), what went out (Razorpay fees, Sarvam), GST, and the Sarvam credit balance.
// Sarvam has no balance API we can read, so HQ keeps a small ledger: top-ups it paid, and balance readings from the Sarvam
// dashboard. Between readings, spend is estimated from the minutes RANA records × cost per minute.
import { sb, sbAll } from "./db";
import { PLANS, type PlanKey } from "./plans";
import { practiceRows, practiceSeconds, pulseMinutes } from "./practice";
import { razorpayConfigured, fetchPaymentFee } from "./razorpay";
import { r2, todayIST, addDays } from "./billing";

export const costPerMin = () => Number(process.env.RANA_COST_PER_MIN || 4.5) || 4.5;
const RZP_FEE_PCT = () => Number(process.env.RAZORPAY_FEE_PCT || 2) || 2;

/** "2026-09" → IST month window as UTC ISO strings. */
export function monthWindow(ym?: string | null, now = new Date()) {
  const m = ym && /^\d{4}-\d{2}$/.test(ym) ? ym : todayIST(now).slice(0, 7);
  const [y, mo] = m.split("-").map(Number);
  const start = new Date(Date.UTC(y, mo - 1, 1) - 5.5 * 3600e3);
  const end = new Date(Date.UTC(y, mo, 1) - 5.5 * 3600e3);
  return { month: m, start, end };
}

/** Razorpay fee for a paid invoice: exact from Razorpay (saved once), else an estimate. Bank/UPI payments cost nothing. */
async function feeOf(inv: any): Promise<{ fee: number; tax: number; estimated: boolean }> {
  if (!String(inv.paid_via || "").startsWith("razorpay")) return { fee: 0, tax: 0, estimated: false };
  if (inv.rzp_fee !== null && inv.rzp_fee !== undefined) return { fee: Number(inv.rzp_fee), tax: Number(inv.rzp_tax || 0), estimated: false };
  if (inv.rzp_payment_id && razorpayConfigured()) {
    try {
      const f = await fetchPaymentFee(inv.rzp_payment_id);
      if (f) {
        await sb(`/invoices?id=eq.${inv.id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ rzp_fee: f.fee, rzp_tax: f.tax }) }).catch(() => {});
        return { ...f, estimated: false };
      }
    } catch {}
  }
  const fee = r2((Number(inv.total) * RZP_FEE_PCT()) / 100 * 1.18);
  return { fee, tax: r2(fee - fee / 1.18), estimated: true };
}

async function callsBetween(from: Date, to: Date) {
  // Sarvam bills every conversation minute — phone calls AND browser practice. Practice is metered in
  // practice_sessions (the webhook doesn't always report browser sessions), so "manual" call rows are skipped here.
  const rows = (await sbAll<any>(`/calls?created_at=gte.${encodeURIComponent(from.toISOString())}&created_at=lt.${encodeURIComponent(to.toISOString())}&duration_seconds=gt.0&select=client_id,duration_seconds,created_at,source&order=created_at.asc,id.asc`).catch(() => [])) || [];
  const practice = (await practiceRows(from, to)).map((r: any) => ({ client_id: r.client_id, duration_seconds: practiceSeconds(r), created_at: r.started_at, source: "practice" }));
  return [...rows.filter((r) => r.source !== "manual"), ...practice];
}

/** Estimated Sarvam credit balance from the ledger + recorded minutes. */
export async function sarvamBalance(now = new Date()) {
  const ledger: any[] = (await sb<any[]>(`/sarvam_ledger?order=entry_date.asc,created_at.asc&limit=1000`).catch(() => [] as any[])) || [];
  const cpm = costPerMin();
  const lastReading = [...ledger].reverse().find((e) => e.kind === "balance");
  let base = 0; let from: string | null = null; let after: any[] = ledger;
  if (lastReading) {
    base = Number(lastReading.amount); from = lastReading.entry_date;
    const idx = ledger.indexOf(lastReading); after = ledger.slice(idx + 1);
  } else if (ledger.length) from = ledger[0].entry_date;
  const topups = after.filter((e) => e.kind === "topup");
  // Top-ups are paid incl. 18% GST; Sarvam credits = amount before GST.
  const credited = topups.reduce((a, e) => a + (e.gst_included ? Number(e.amount) / 1.18 : Number(e.amount)), 0);
  const since = from ? new Date(Date.parse(from + "T00:00:00+05:30")) : null;
  const spent = since ? pulseMinutes((await callsBetween(since, now)).map((c) => Number(c.duration_seconds) || 0)) * cpm : 0;
  const week = pulseMinutes((await callsBetween(new Date(now.getTime() - 7 * 86400e3), now)).map((c) => Number(c.duration_seconds) || 0));
  const perDay = (week * cpm) / 7;
  const balance = r2(base + credited - spent);
  const daysLeft = perDay > 0 ? Math.floor(balance / perDay) : null;
  const tracked = ledger.length > 0;
  return {
    tracked, balance: tracked ? balance : null, lastReading: lastReading ? { amount: Number(lastReading.amount), date: lastReading.entry_date } : null,
    spentSinceReading: r2(spent), perDay: r2(perDay), daysLeft: tracked ? daysLeft : null,
    lowWarning: tracked && (balance <= 0 || (daysLeft !== null && daysLeft < 14)),
    suggestTopUp: perDay > 0 ? Math.max(0, Math.ceil((perDay * 30 - Math.max(0, balance)) / 1000) * 1000) : 0,
    ledger: [...ledger].reverse().slice(0, 20),
  };
}

export async function financeReport(ym?: string | null, now = new Date()) {
  const { month, start, end } = monthWindow(ym, now);
  const clients = (await sb<any[]>(`/clients?is_hq=eq.false&select=id,name,plan,status,plan_paid_until,billing_interval`)) || [];
  const paid = (await sb<any[]>(`/invoices?status=eq.paid&paid_at=gte.${encodeURIComponent(start.toISOString())}&paid_at=lt.${encodeURIComponent(end.toISOString())}&order=paid_at.asc&limit=5000`)) || [];
  const open = (await sb<any[]>(`/invoices?status=eq.issued&select=client_id,total,due_date&limit=5000`)) || [];
  const calls = await callsBetween(start, end);
  const cpm = costPerMin();
  const topups = (await sb<any[]>(`/sarvam_ledger?kind=eq.topup&entry_date=gte.${month}-01&entry_date=lt.${addDays(end.toISOString().slice(0, 10), 1)}`).catch(() => [])) || [];

  const fees = await Promise.all(paid.map(feeOf));
  const per: Record<string, any> = {};
  for (const c of clients) {
    const p = PLANS[c.plan as PlanKey];
    per[c.id] = { id: c.id, name: c.name, plan: c.plan, status: c.status, planPrice: p?.pricePerMonth ?? null, received: 0, revenue: 0, gst: 0, fees: 0, minutes: 0, sarvamCost: 0, profit: 0, outstanding: 0, invoices: 0 };
  }
  paid.forEach((inv, i) => {
    const row = per[inv.client_id]; if (!row) return;
    row.received += Number(inv.total); row.revenue += Number(inv.subtotal);
    row.gst += Number(inv.cgst) + Number(inv.sgst) + Number(inv.igst); row.fees += fees[i].fee; row.invoices++;
  });
  const byClient: Record<string, number[]> = {};
  calls.forEach((c) => { (byClient[c.client_id] ||= []).push(Number(c.duration_seconds) || 0); });
  for (const [id, d] of Object.entries(byClient)) if (per[id]) per[id].minutes = pulseMinutes(d);
  open.forEach((o) => { if (per[o.client_id]) per[o.client_id].outstanding += Number(o.total); });
  const rows = Object.values(per).map((r: any) => {
    r.sarvamCost = r2(r.minutes * cpm);
    r.profit = r2(r.revenue - r.fees - r.sarvamCost);
    // What the month looks like at the plan's list price (useful for clients billed outside RANA, like pilots).
    r.marginAtPlan = r.planPrice ? r2(r.planPrice - r.sarvamCost) : null;
    for (const k of ["received", "revenue", "gst", "fees", "outstanding"]) r[k] = r2(r[k]);
    return r;
  }).sort((a: any, b: any) => b.revenue - a.revenue || b.minutes - a.minutes);

  const sum = (k: string) => r2(rows.reduce((a: number, r: any) => a + (Number(r[k]) || 0), 0));
  const gstOut = sum("gst");
  const itcRazorpay = r2(fees.reduce((a, f) => a + f.tax, 0));
  const itcSarvam = r2(topups.reduce((a, t) => a + (t.gst_included ? Number(t.amount) - Number(t.amount) / 1.18 : 0), 0));
  return {
    month, costPerMin: cpm,
    totals: {
      received: sum("received"), revenue: sum("revenue"), gst: gstOut, fees: sum("fees"), minutes: sum("minutes"),
      sarvamCost: sum("sarvamCost"), profit: r2(sum("revenue") - sum("fees") - sum("sarvamCost")), outstanding: sum("outstanding"),
      paidInvoices: paid.length, feesEstimated: fees.some((f) => f.estimated),
      sarvamPaid: r2(topups.reduce((a, t) => a + Number(t.amount), 0)),
    },
    gst: { registered: !!process.env.RANA_GSTIN, collected: gstOut, itcRazorpay, itcSarvam, netPayable: r2(Math.max(0, gstOut - itcRazorpay - itcSarvam)), carryForward: r2(Math.max(0, itcRazorpay + itcSarvam - gstOut)) },
    clients: rows,
    payments: paid.map((inv, i) => ({ id: inv.id, number: inv.number, client: per[inv.client_id]?.name || "—", paidAt: inv.paid_at, via: inv.paid_via, total: Number(inv.total), fee: fees[i].fee, feeEstimated: fees[i].estimated, net: r2(Number(inv.total) - fees[i].fee) })),
    sarvam: await sarvamBalance(now),
  };
}
