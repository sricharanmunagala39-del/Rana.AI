// Billing: GST invoices, plan checkout, payment → plan activation, renewals, overage and non-payment pauses.
// Works with or without Razorpay: without keys, invoices are still issued and HQ marks them paid by bank transfer.
import { sb } from "./db";
import { PLANS, type PlanKey, limitsOf, cycleStart, minutesBetween } from "./plans";
import { razorpayConfigured, createPaymentLink, cancelPaymentLink } from "./razorpay";

export const GRACE_DAYS = 7;          // unpaid this many days past the due date → calling pauses
export const RENEW_AHEAD_DAYS = 5;    // renewal invoice goes out this many days before the plan runs out
export const SELF_SERVE: PlanKey[] = ["starter", "growth", "scale"];
export type Interval = "monthly" | "annual";

export const GST_STATES: Record<string, string> = {
  "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand",
  "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim",
  "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur", "15": "Mizoram", "16": "Tripura", "17": "Meghalaya",
  "18": "Assam", "19": "West Bengal", "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh",
  "24": "Gujarat", "26": "Dadra and Nagar Haveli and Daman and Diu", "27": "Maharashtra", "29": "Karnataka", "30": "Goa",
  "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry", "35": "Andaman and Nicobar Islands",
  "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh",
};
export const STATE_NAMES = Object.values(GST_STATES).sort();
const codeOfState = (name?: string | null) => {
  const n = String(name || "").trim().toLowerCase();
  return Object.entries(GST_STATES).find(([, v]) => v.toLowerCase() === n)?.[0] || null;
};
export const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export function stateOfGstin(g?: string | null): string | null {
  return g && GSTIN_RE.test(g) ? GST_STATES[g.slice(0, 2)] || null : null;
}

export const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** RANA's own details, printed on every invoice. GST is only charged once RANA_GSTIN is set. */
export function seller() {
  const gstin = (process.env.RANA_GSTIN || "").trim().toUpperCase() || null;
  return {
    name: process.env.RANA_LEGAL_NAME || "RANA AI",
    gstin: gstin && GSTIN_RE.test(gstin) ? gstin : null,
    address: process.env.RANA_ADDRESS || null,
    state: stateOfGstin(gstin) || process.env.RANA_STATE || null,
    email: process.env.RANA_BILLING_EMAIL || "support@ranaai.in",
    sac: process.env.RANA_SAC || "998314",
    pan: process.env.RANA_PAN || null,
  };
}
export type Seller = ReturnType<typeof seller>;

/** Bank / UPI details for clients who pay without Razorpay. */
export function offlinePayment() {
  return { upi: process.env.RANA_UPI_ID || null, bank: process.env.RANA_BANK_DETAILS || null };
}

/** Place of supply = the buyer's state (from their GSTIN, else the state they gave). Same state → CGST+SGST, else IGST. */
export function taxFor(subtotal: number, s: { gstin: string | null; state: string | null }, buyerState: string | null) {
  const sub = r2(subtotal);
  if (!s.gstin || sub <= 0) return { cgst: 0, sgst: 0, igst: 0, total: sub, rate: 0, intra: true };
  const intra = !buyerState || !s.state || codeOfState(buyerState) === codeOfState(s.state);
  if (intra) { const half = r2(sub * 0.09); return { cgst: half, sgst: half, igst: 0, total: r2(sub + 2 * half), rate: 18, intra }; }
  const igst = r2(sub * 0.18);
  return { cgst: 0, sgst: 0, igst, total: r2(sub + igst), rate: 18, intra };
}

/** Indian financial year for a date (IST): Apr 2026–Mar 2027 → "26-27". */
export function fyOf(d = new Date()): string {
  const ist = new Date(d.getTime() + 5.5 * 3600e3);
  const y = ist.getUTCMonth() >= 3 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1;
  return `${String(y % 100).padStart(2, "0")}-${String((y + 1) % 100).padStart(2, "0")}`;
}
/** Today's date in India, YYYY-MM-DD. */
export function todayIST(now = new Date()): string {
  return new Date(now.getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);
}
export function addMonths(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return t.toISOString().slice(0, 10);
}
export function addDays(ymd: string, n: number): string {
  return new Date(Date.parse(ymd + "T00:00:00Z") + n * 86400e3).toISOString().slice(0, 10);
}
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400e3);

/** GST invoice numbers must be ≤16 characters and consecutive per financial year: RANA/26-27/0001. */
export async function nextInvoiceNumber(now = new Date()): Promise<string> {
  const fy = fyOf(now);
  const seq = await sb<number>(`/rpc/next_invoice_seq`, { method: "POST", body: JSON.stringify({ p_fy: fy }) });
  const prefix = (process.env.RANA_INVOICE_PREFIX || "RANA").replace(/[^A-Z0-9-]/gi, "").slice(0, 6) || "RANA";
  return `${prefix}/${fy}/${String(seq).padStart(4, "0")}`;
}

export type Item = { description: string; sac?: string; qty: number; rate: number; amount: number; onboarding?: boolean };

export function buyerOf(c: any) {
  const gstin = c?.billing_gstin || null;
  return {
    name: c?.billing_name || c?.company_name || c?.name || "Customer",
    gstin, address: c?.billing_address || null,
    state: stateOfGstin(gstin) || c?.billing_state || null,
    email: c?.billing_email || c?.login_email || null,
    phone: c?.billing_phone || c?.contact_phone || null,
  };
}

export function planPrice(plan: PlanKey, interval: Interval): number {
  const p = PLANS[plan].pricePerMonth || 0;
  return interval === "annual" ? p * 10 : p;
}
const monthsOf = (i: Interval | null | undefined) => (i === "annual" ? 12 : 1);

/** What a client pays to move to `plan` now: plan fee, first-time onboarding (waived on annual), credit for unused days on an upgrade. */
export function checkoutQuote(c: any, plan: PlanKey, interval: Interval, today = todayIST()): { items: Item[]; error?: string } {
  if (!SELF_SERVE.includes(plan)) return { items: [], error: "Enterprise is set up with RANA directly — write to support@ranaai.in." };
  const s = seller();
  const P = PLANS[plan];
  const items: Item[] = [];
  const price = planPrice(plan, interval);
  items.push({ description: `${P.name} plan — ${interval === "annual" ? "12 months (annual, 2 months free)" : "1 month"} · ${P.minutes.toLocaleString("en-IN")} connected minutes/month`, sac: s.sac, qty: 1, rate: price, amount: price });
  if (!c?.onboarding_paid && interval === "monthly" && P.onboardingFee)
    items.push({ description: "One-time onboarding: script, voice and number set-up with a RANA specialist", sac: s.sac, qty: 1, rate: P.onboardingFee, amount: P.onboardingFee, onboarding: true });
  const paidUntil: string | null = c?.plan_paid_until || null;
  const cur = PLANS[c?.plan as PlanKey];
  if (paidUntil && paidUntil > today && cur && cur.key !== plan && SELF_SERVE.includes(cur.key)) {
    const curMonthly = cur.pricePerMonth || 0;
    if ((P.pricePerMonth || 0) < curMonthly) return { items: [], error: `You're on ${cur.name} until ${paidUntil}. To move to a smaller plan, write to support@ranaai.in and we'll switch you at renewal.` };
    if (c.billing_interval === "annual" && interval === "monthly") return { items: [], error: `You're on an annual ${cur.name} plan until ${paidUntil}. Upgrade to an annual plan, or write to support@ranaai.in.` };
    const left = daysBetween(today, paidUntil);
    const paidFor = c.billing_interval === "annual" ? curMonthly * 10 : curMonthly;
    const span = c.billing_interval === "annual" ? 365 : 30;
    const credit = r2(Math.min(paidFor, (paidFor * left) / span));
    if (credit > 0) items.push({ description: `Credit for ${left} unused day${left === 1 ? "" : "s"} on the ${cur.name} plan`, sac: s.sac, qty: 1, rate: -credit, amount: -credit });
  }
  return { items };
}

type NewInvoice = {
  kind: "plan" | "renewal" | "overage" | "custom" | "recharge"; items: Item[]; plan?: PlanKey | null; interval?: Interval | null;
  periodStart?: string | null; periodEnd?: string | null; dueDate?: string | null; notes?: string | null;
  createdBy?: string; notify?: boolean; origin?: string; now?: Date;
};

function appUrl(origin?: string) {
  return (origin || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://ranaai.in").replace(/\/$/, "");
}

/** Issues a numbered GST invoice and, when Razorpay is connected, a payment link for it. */
export async function createInvoice(c: any, n: NewInvoice) {
  const s = seller();
  const buyer = buyerOf(c);
  const items = n.items.map((i) => ({ ...i, qty: Number(i.qty) || 1, rate: r2(i.rate), amount: r2(i.amount), sac: i.sac || s.sac }));
  const subtotal = r2(items.reduce((a, i) => a + i.amount, 0));
  if (subtotal <= 0) throw new Error("The invoice total must be more than ₹0.");
  const tax = taxFor(subtotal, s, buyer.state);
  const number = await nextInvoiceNumber(n.now);
  const [inv] = await sb<any[]>(`/invoices`, {
    method: "POST",
    body: JSON.stringify({
      client_id: c.id, number, kind: n.kind, status: "issued", plan: n.plan || null, interval: n.interval || null,
      period_start: n.periodStart || null, period_end: n.periodEnd || null, items, subtotal, cgst: tax.cgst, sgst: tax.sgst, igst: tax.igst, total: tax.total,
      buyer, seller: s, due_date: n.dueDate || addDays(todayIST(n.now), 7), notes: n.notes || null, created_by: n.createdBy || "system",
    }),
  });
  let linkError: string | null = null;
  let out = inv;
  if (razorpayConfigured()) {
    try {
      const link = await createPaymentLink({
        amountRupees: inv.total, referenceId: inv.id,
        description: `${number} · ${items.map((i) => i.description.split(" — ")[0]).filter((d) => !d.startsWith("Credit")).join(" + ")}`,
        customer: { name: buyer.name, email: buyer.email, contact: buyer.phone },
        notes: { invoice_id: inv.id, invoice_number: number, client_id: c.id },
        callbackUrl: `${appUrl(n.origin)}/billing?invoice=${inv.id}`, expireInDays: 30, notify: !!n.notify,
      });
      [out] = await sb<any[]>(`/invoices?id=eq.${inv.id}`, { method: "PATCH", body: JSON.stringify({ rzp_link_id: link.id, rzp_link_url: link.short_url }) });
    } catch (e: any) { linkError = String(e?.message || e); }
  }
  return { invoice: out, linkError };
}

export async function getInvoice(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return (await sb<any[]>(`/invoices?id=eq.${id}&limit=1`))?.[0] ?? null;
}
export async function listInvoices(clientId: string, limit = 50) {
  return (await sb<any[]>(`/invoices?client_id=eq.${clientId}&order=created_at.desc&limit=${limit}`)) || [];
}

/**
 * Money received → invoice paid → plan switched on. Safe to call twice (webhook + redirect both fire):
 * only the call that flips issued→paid applies the effects.
 */
export async function markPaid(invoiceId: string, p: { via: string; paymentId?: string | null; ref?: string | null; now?: Date }) {
  const now = p.now || new Date();
  const flipped = await sb<any[]>(`/invoices?id=eq.${invoiceId}&status=neq.paid`, {
    method: "PATCH",
    body: JSON.stringify({ status: "paid", paid_at: now.toISOString(), paid_via: p.via, rzp_payment_id: p.paymentId || null, paid_ref: p.ref || null }),
  });
  const inv = flipped?.[0];
  if (!inv) return { already: true, invoice: await getInvoice(invoiceId) };
  const c = (await sb<any[]>(`/clients?id=eq.${inv.client_id}&limit=1`))?.[0];
  const patch: Record<string, any> = {};
  if ((inv.kind === "plan" || inv.kind === "renewal") && inv.plan && c) {
    const today = todayIST(now);
    const samePlan = c.plan === inv.plan;
    // Renewals continue from where the last period ended (even if paid a few days late); anything else starts today,
    // or extends an early re-purchase of the same plan.
    const base = inv.kind === "renewal" && samePlan && inv.period_start && daysBetween(inv.period_start, today) <= 31 ? String(inv.period_start).slice(0, 10)
      : samePlan && c.plan_paid_until && c.plan_paid_until >= today ? c.plan_paid_until : today;
    const end = addMonths(base, monthsOf(inv.interval));
    Object.assign(patch, { plan: inv.plan, billing_interval: inv.interval || "monthly", plan_paid_until: end });
    if (!samePlan || !c.billing_cycle_start || c.plan === "trial") patch.billing_cycle_start = base;
    if (!samePlan || c.plan === "trial") {
      // New paid plan: plan defaults apply (clear trial-era overrides); minutes beyond the plan come from the prepaid wallet.
      Object.assign(patch, { minutes_included: null, max_employees: null, max_concurrency: null, max_campaign_size: null, allow_overage: false, wallet_enabled: true });
    }
    if ((inv.items || []).some((i: any) => i.onboarding)) patch.onboarding_paid = true;
    await sb(`/invoices?id=eq.${inv.id}`, { method: "PATCH", body: JSON.stringify({ period_start: base, period_end: end }) });
    // Any other unpaid plan/renewal invoice is now out of date (e.g. an old renewal after an upgrade) — void it so it
    // can't pause a paying client or switch them back to the old plan if paid by mistake.
    const stale = (await sb<any[]>(`/invoices?client_id=eq.${c.id}&status=eq.issued&kind=in.(plan,renewal)&id=neq.${inv.id}&select=id,status,rzp_link_id`).catch(() => [])) || [];
    for (const s of stale) await voidInvoice(s).catch(() => {});
  }
  if (inv.kind === "recharge" && c) {
    // Prepaid calling credit: the amount before GST goes into the wallet (once per invoice — unique index).
    await sb(`/wallet_ledger`, { method: "POST", prefer: "return=minimal", body: JSON.stringify({ client_id: c.id, kind: "credit", amount: Number(inv.subtotal), invoice_id: inv.id, note: `Recharge ${inv.number}`, created_by: p.via }) })
      .catch(async (e: any) => {
        if (/409|duplicate|23505/i.test(String(e?.message))) return; // already credited
        // Couldn't credit the wallet: put the invoice back to unpaid so Razorpay's retry credits it properly.
        await sb(`/invoices?id=eq.${inv.id}`, { method: "PATCH", body: JSON.stringify({ status: "issued", paid_at: null, paid_via: null }) }).catch(() => {});
        throw e;
      });
    if (!c.wallet_enabled) patch.wallet_enabled = true;
    // A fresh recharge re-arms the low-balance email.
    const notified = { ...(c.notified || {}) }; for (const k of Object.keys(notified)) if (k.startsWith("wallet_")) delete notified[k];
    patch.notified = notified;
  }
  if (c && c.status === "suspended" && c.suspended_reason === "billing") {
    const stillOverdue = (await sb<any[]>(`/invoices?client_id=eq.${c.id}&status=eq.issued&due_date=lt.${addDays(todayIST(now), -GRACE_DAYS)}&select=id`)) || [];
    if (!stillOverdue.length) Object.assign(patch, { status: "active", suspended_reason: null });
  }
  if (c && Object.keys(patch).length) await sb(`/clients?id=eq.${c.id}`, { method: "PATCH", body: JSON.stringify(patch) });
  if (c) {
    // Receipt email (quietly skipped until email is set up).
    import("./notify").then(async (n) => {
      const what = inv.kind === "recharge" ? "prepaid calling credit" : inv.plan ? `the ${inv.plan} plan` : "your invoice";
      const m = n.tpl.paymentReceived(c.name, inv.number, Number(inv.total), what);
      await n.sendEmail({ to: await n.ownerEmails(c.id, c.billing_email || c.login_email), subject: m.subject, html: m.html, clientId: c.id, kind: "payment_received" });
    }).catch(() => {});
  }
  return { already: false, invoice: inv, client: c ? { ...c, ...patch } : null };
}

export async function voidInvoice(inv: any) {
  if (inv.status === "paid") throw new Error("A paid invoice can't be voided. Issue a credit note with your CA instead.");
  if (inv.rzp_link_id && razorpayConfigured()) await cancelPaymentLink(inv.rzp_link_id).catch(() => {});
  const [v] = await sb<any[]>(`/invoices?id=eq.${inv.id}`, { method: "PATCH", body: JSON.stringify({ status: "void" }) });
  return v;
}

/** First billing period start, capped to the 28th the same way cycleStart() is (plans started on the 29th–31st). */
function firstCycleYmd(c: any): string {
  return cycleStart({ ...c, plan: c.plan === "trial" ? "starter" : c.plan }, new Date(String(c.billing_cycle_start).slice(0, 10) + "T12:00:00Z")).toISOString().slice(0, 10);
}

/** Billing health for the Billing page banner and the HQ table. */
export function billingState(c: any, invoices: any[], now = new Date()) {
  const today = todayIST(now);
  const open = invoices.filter((i) => i.status === "issued");
  const overdue = open.filter((i) => i.kind !== "recharge" && i.due_date && i.due_date < today);
  const paidUntil: string | null = c?.plan_paid_until || null;
  return {
    paidUntil, interval: c?.billing_interval || null, autoBilled: !!paidUntil,
    openCount: open.length, openTotal: r2(open.reduce((a, i) => a + Number(i.total), 0)),
    overdue: overdue.length > 0, pauseOn: overdue.length ? addDays(overdue.map((i) => i.due_date).sort()[0], GRACE_DAYS + 1) : null,
    daysLeft: paidUntil ? daysBetween(today, paidUntil) : null,
    suspendedForBilling: c?.status === "suspended" && c?.suspended_reason === "billing",
  };
}

/**
 * Daily run (cron). Only for clients billed through RANA (plan_paid_until set) — pilots and custom deals HQ manages
 * by hand are never touched. 1) renewal invoice 5 days ahead, 2) overage invoice for the month just finished,
 * 3) pause calling when an invoice is more than 7 days overdue.
 */
export async function runBilling(now = new Date()) {
  const today = todayIST(now);
  const clients = (await sb<any[]>(`/clients?is_hq=eq.false&plan_paid_until=not.is.null&select=*`)) || [];
  const log: any[] = [];
  for (const c of clients) {
    try {
      const inv = await listInvoices(c.id, 100);
      // 1) Renewal
      const plan = c.plan as PlanKey;
      if (SELF_SERVE.includes(plan) && daysBetween(today, c.plan_paid_until) <= RENEW_AHEAD_DAYS) {
        const has = inv.some((i) => (i.kind === "renewal" || i.kind === "plan") && i.status !== "void" && (i.period_start === c.plan_paid_until || (i.status === "issued" && i.plan === plan)));
        if (!has) {
          const interval: Interval = c.billing_interval === "annual" ? "annual" : "monthly";
          const price = planPrice(plan, interval);
          const r = await createInvoice(c, {
            kind: "renewal", plan, interval, periodStart: c.plan_paid_until, periodEnd: addMonths(c.plan_paid_until, monthsOf(interval)),
            dueDate: c.plan_paid_until, notify: true, createdBy: "auto-renewal", now,
            items: [{ description: `${PLANS[plan].name} plan renewal — ${interval === "annual" ? "12 months" : "1 month"} from ${c.plan_paid_until}`, qty: 1, rate: price, amount: price }],
          });
          log.push({ client: c.name, did: "renewal", number: r.invoice.number, linkError: r.linkError });
        }
      }
      // 2) Overage for the last full month: prepaid clients → wallet debit; postpaid (overage allowed) → invoice
      const lim = limitsOf(c);
      if (c.wallet_enabled && lim.plan.overagePerMin && c.billing_cycle_start) {
        const cur = cycleStart(c, now);
        const prev = cycleStart(c, new Date(cur.getTime() - 1000));
        const prevYmd = prev.toISOString().slice(0, 10);
        if (prevYmd >= firstCycleYmd(c) && prev < cur) {
          const used = await minutesBetween(c.id, prev, cur);
          const over = Math.max(0, used - lim.minutes);
          if (over > 0) {
            const ok = await sb(`/wallet_ledger`, { method: "POST", prefer: "return=minimal", body: JSON.stringify({ client_id: c.id, kind: "debit", amount: r2(over * lim.plan.overagePerMin), minutes: over, period_start: prevYmd, note: `Minutes beyond plan, ${prevYmd} to ${cur.toISOString().slice(0, 10)}`, created_by: "auto" }) }).then(() => true).catch(() => false);
            if (ok) log.push({ client: c.name, did: "wallet-debit", minutes: over });
          }
        }
      } else if (lim.allowOverage && lim.plan.overagePerMin && c.billing_cycle_start) {
        const cur = cycleStart(c, now);
        const prev = cycleStart(c, new Date(cur.getTime() - 1000));
        const prevYmd = prev.toISOString().slice(0, 10);
        if (prevYmd >= firstCycleYmd(c) && prev < cur && !inv.some((i) => i.kind === "overage" && i.period_start === prevYmd && i.status !== "void")) {
          const used = await minutesBetween(c.id, prev, cur);
          const over = Math.max(0, used - lim.minutes);
          if (over > 0) {
            const r = await createInvoice(c, {
              kind: "overage", periodStart: prevYmd, periodEnd: cur.toISOString().slice(0, 10), notify: true, createdBy: "auto-overage", now,
              items: [{ description: `Extra connected minutes, ${prevYmd} to ${cur.toISOString().slice(0, 10)} (${used} used, ${lim.minutes} included)`, qty: over, rate: lim.plan.overagePerMin, amount: r2(over * lim.plan.overagePerMin) }],
            });
            log.push({ client: c.name, did: "overage", minutes: over, number: r.invoice.number, linkError: r.linkError });
          }
        }
      }
      // 3) Pause for non-payment
      const fresh = await listInvoices(c.id, 100);
      // Unpaid recharge requests never pause an account (an empty wallet already stops calls); cancel them after 10 days.
      for (const i of fresh.filter((i) => i.kind === "recharge" && i.status === "issued" && daysBetween(String(i.created_at).slice(0, 10), today) > 10)) {
        await voidInvoice(i).catch(() => {}); log.push({ client: c.name, did: "void-stale-recharge", number: i.number });
      }
      const late = fresh.filter((i) => i.kind !== "recharge" && i.status === "issued" && i.due_date && daysBetween(i.due_date, today) > GRACE_DAYS);
      const lapsed = SELF_SERVE.includes(plan) && daysBetween(c.plan_paid_until, today) > GRACE_DAYS;
      if ((late.length || lapsed) && c.status !== "suspended") {
        await sb(`/clients?id=eq.${c.id}`, { method: "PATCH", body: JSON.stringify({ status: "suspended", suspended_reason: "billing" }) });
        log.push({ client: c.name, did: "paused", invoices: late.map((i) => i.number) });
      }
    } catch (e: any) { log.push({ client: c.name, error: String(e?.message || e).slice(0, 300) }); }
  }
  return { today, checked: clients.length, log };
}
