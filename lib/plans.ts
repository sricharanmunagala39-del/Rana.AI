// Plans, trials and usage. One source of truth for what each workspace may do and how much it has used.
// Prices exclude GST. A client row can override any limit (minutes_included, max_employees, …) for custom deals.
import { sb, sbAll } from "./db";

// Plan prices and limits live in lib/pricing.ts (shared with the website and Billing page).
import { PLANS, PLAN_KEYS, engineMinuteRate, type Plan, type PlanKey } from "./pricing";
export { PLANS, PLAN_KEYS };
export type { Plan, PlanKey };

export function planOf(client: any): Plan { return PLANS[(client?.plan as PlanKey)] || PLANS.trial; }

/** The limits that actually apply to this workspace: plan defaults, then per-client overrides. */
export function limitsOf(client: any) {
  const p = planOf(client);
  const n = (v: any, d: number) => (v === null || v === undefined || v === "" ? d : Number(v));
  return {
    plan: p,
    minutes: n(client?.minutes_included, p.minutes),
    employees: n(client?.max_employees, p.employees),
    concurrency: n(client?.max_concurrency, p.concurrency),
    campaignSize: n(client?.max_campaign_size, p.campaignSize),
    allowOverage: p.key !== "trial" && !!client?.allow_overage,
  };
}

/** Start of the current billing period: trial start for trials, else the billing day this month (or last month). */
export function cycleStart(client: any, now = new Date()): Date {
  if ((client?.plan || "trial") === "trial") return new Date(client?.trial_started_at || client?.created_at || now);
  const day = client?.billing_cycle_start ? new Date(client.billing_cycle_start).getUTCDate() : 1;
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), Math.min(day, 28)));
  if (d > now) d.setUTCMonth(d.getUTCMonth() - 1);
  return d;
}

/** Connected minutes, billed per call rounded up to the next 30 seconds. Talk-page practice is metered separately (lib/practice). */
export function billedMinutes(durations: number[]): number {
  return durations.reduce((m, d) => (d > 0 ? m + Math.ceil(d / 30) / 2 : m), 0);
}

/** Plan minutes used by these calls: each call's 30-second pulses × its engine's minute rate (lib/pricing). */
export function planMinutes(rows: { duration_seconds: any; engine?: string | null }[]): number {
  return Math.round(rows.reduce((m, r) => {
    const d = Number(r.duration_seconds) || 0;
    return d > 0 ? m + (Math.ceil(d / 30) / 2) * engineMinuteRate(r.engine) : m;
  }, 0) * 100) / 100;
}

/** Billed minutes in [from, to) — used for overage invoices. */
export async function minutesBetween(clientId: string, from: Date, to: Date): Promise<number> {
  const rows = await sbAll<any>(`/calls?client_id=eq.${clientId}&created_at=gte.${encodeURIComponent(from.toISOString())}&created_at=lt.${encodeURIComponent(to.toISOString())}&duration_seconds=gt.0&select=duration_seconds,source,engine&order=created_at.asc,id.asc`);
  return planMinutes((rows || []).filter((r) => r.source !== "manual"));
}

export async function usageOf(client: any, now = new Date()) {
  const from = cycleStart(client, now);
  const rows = await sbAll<any>(`/calls?client_id=eq.${client.id}&created_at=gte.${encodeURIComponent(from.toISOString())}&duration_seconds=gt.0&select=duration_seconds,source,engine&order=created_at.asc,id.asc`).catch(() => []);
  // Talk-page practice doesn't use plan minutes; it has its own free allowance, metered from practice_sessions.
  const real = (rows || []).filter((r) => r.source !== "manual");
  const all = real.map((r) => Number(r.duration_seconds) || 0);
  const { practiceMinutes } = await import("./practice");
  const testMinutes = await practiceMinutes(client.id, from).catch(() => 0);
  const lim = limitsOf(client);
  const used = planMinutes(real);
  const trialEndsAt = lim.plan.key === "trial" ? (client?.trial_ends_at ? new Date(client.trial_ends_at) : null) : null;
  const daysLeft = trialEndsAt ? Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / 86400000)) : null;
  const overage = Math.max(0, used - lim.minutes);
  return {
    periodStart: from.toISOString(), minutesUsed: used, minutesIncluded: lim.minutes, testMinutes, practiceAllowance: FREE_PRACTICE_MIN,
    calls: all.length, overageMinutes: overage,
    overageCost: overage && lim.plan.overagePerMin ? Math.round(overage * lim.plan.overagePerMin) : 0,
    trialEndsAt: trialEndsAt?.toISOString() ?? null, trialDaysLeft: daysLeft,
    limits: { employees: lim.employees, concurrency: lim.concurrency, campaignSize: lim.campaignSize, allowOverage: lim.allowOverage },
    plan: { key: lim.plan.key, name: lim.plan.name, pricePerMonth: lim.plan.pricePerMonth, overagePerMin: lim.plan.overagePerMin },
    status: client?.status || "active", suspendedReason: client?.suspended_reason || null,
  };
}

/** Free practice minutes per billing period on the Talk page. Sarvam bills these (₹4.50/started minute), so keep it modest. Override with RANA_FREE_PRACTICE_MIN. */
export const FREE_PRACTICE_MIN = Number(process.env.RANA_FREE_PRACTICE_MIN) || 30;

/** Why this workspace can't place calls right now, or null. `extraMinutes` = minutes a new campaign may use. */
export async function callingBlock(client: any, opts: { contacts?: number; practice?: boolean } = {}): Promise<string | null> {
  if (!client) return "Workspace not found.";
  if (client.status === "suspended")
    return client.suspended_reason === "billing"
      ? "Calling is paused because an invoice is overdue. Pay it on the Billing page and calling turns back on straight away."
      : "Calling is paused on this workspace. Contact RANA to turn it back on.";
  const u = await usageOf(client);
  if (u.plan.key === "trial" && u.trialEndsAt && Date.parse(u.trialEndsAt) < Date.now())
    return `Your free trial ended on ${new Date(u.trialEndsAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}. Pick a plan on the Billing page to keep calling.`;
  if (client.status === "pending") return "Your workspace is waiting for RANA to approve it. We'll email you as soon as it's switched on.";
  // Practice in the browser doesn't need plan minutes — it has its own free allowance.
  if (opts.practice) {
    return u.testMinutes >= FREE_PRACTICE_MIN
      ? `You've used this period's ${FREE_PRACTICE_MIN} free voice-practice minutes. Keep testing for free with "Practice conversation" (typed) on the employee's Review step, use "Call me" (counts as a call), or ask RANA for more practice time.`
      : null;
  }
  if (u.minutesUsed >= u.minutesIncluded && !u.limits.allowOverage) {
    if (u.plan.key === "trial") return `You've used all ${u.minutesIncluded} trial minutes. Pick a plan on the Billing page to keep calling.`;
    if (client.wallet_enabled) {
      const { walletOf } = await import("./wallet");
      const w = await walletOf(client, u);
      import("./autoRecharge").then((m) => m.maybeAutoRecharge(client, w)).catch(() => {});
      if (w.balance > 0) return null;
      return `You've used this period's ${u.minutesIncluded} plan minutes and your prepaid balance. Recharge on the Billing page to keep calling.`;
    }
    return `You've used all ${u.minutesIncluded} minutes in this billing period. Ask RANA to add minutes or turn on overage.`;
  }
  if (opts.contacts && opts.contacts > u.limits.campaignSize)
    return `Your plan allows up to ${u.limits.campaignSize.toLocaleString("en-IN")} numbers per campaign (this list has ${opts.contacts.toLocaleString("en-IN")}). Split the list or upgrade.`;
  return null;
}

export async function employeeBlock(client: any): Promise<string | null> {
  const lim = limitsOf(client);
  const rows = await sb<any[]>(`/scripts?client_id=eq.${client.id}&select=id`).catch(() => []);
  if ((rows?.length || 0) >= lim.employees)
    return `Your ${lim.plan.name} plan includes ${lim.employees} employee${lim.employees === 1 ? "" : "s"}. Edit an existing one, or upgrade to add more.`;
  return null;
}
