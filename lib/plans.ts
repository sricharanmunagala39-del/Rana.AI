// Plans, trials and usage. One source of truth for what each workspace may do and how much it has used.
// Prices exclude GST. A client row can override any limit (minutes_included, max_employees, …) for custom deals.
import { sb } from "./db";

export type PlanKey = "trial" | "starter" | "growth" | "scale" | "enterprise";
export type Plan = {
  key: PlanKey; name: string; pricePerMonth: number | null; minutes: number; overagePerMin: number | null;
  employees: number; concurrency: number; campaignSize: number; ownNumber: boolean; onboardingFee: number | null; trialDays?: number;
};

export const PLANS: Record<PlanKey, Plan> = {
  trial:      { key: "trial",      name: "Trial",      pricePerMonth: 0,     minutes: 100,   overagePerMin: null, employees: 1,   concurrency: 1,  campaignSize: 50,     ownNumber: false, onboardingFee: 0, trialDays: 14 },
  starter:    { key: "starter",    name: "Starter",    pricePerMonth: 9999,  minutes: 1000,  overagePerMin: 9,    employees: 1,   concurrency: 2,  campaignSize: 2000,   ownNumber: false, onboardingFee: 14999 },
  growth:     { key: "growth",     name: "Growth",     pricePerMonth: 29999, minutes: 3500,  overagePerMin: 8,    employees: 3,   concurrency: 5,  campaignSize: 10000,  ownNumber: true,  onboardingFee: 24999 },
  scale:      { key: "scale",      name: "Scale",      pricePerMonth: 89999, minutes: 12000, overagePerMin: 7,    employees: 10,  concurrency: 20, campaignSize: 50000,  ownNumber: true,  onboardingFee: 49999 },
  enterprise: { key: "enterprise", name: "Enterprise", pricePerMonth: null,  minutes: 35000, overagePerMin: null, employees: 999, concurrency: 50, campaignSize: 200000, ownNumber: true,  onboardingFee: null },
};
export const PLAN_KEYS = Object.keys(PLANS) as PlanKey[];

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

/** Connected minutes, billed per call rounded up to the next 30 seconds. Test calls count: they cost the same. */
export function billedMinutes(durations: number[]): number {
  return durations.reduce((m, d) => (d > 0 ? m + Math.ceil(d / 30) / 2 : m), 0);
}

/** Billed minutes in [from, to) — used for overage invoices. */
export async function minutesBetween(clientId: string, from: Date, to: Date): Promise<number> {
  const rows = await sb<any[]>(`/calls?client_id=eq.${clientId}&created_at=gte.${encodeURIComponent(from.toISOString())}&created_at=lt.${encodeURIComponent(to.toISOString())}&duration_seconds=gt.0&select=duration_seconds&limit=100000`);
  return billedMinutes((rows || []).map((r) => Number(r.duration_seconds) || 0));
}

export async function usageOf(client: any, now = new Date()) {
  const from = cycleStart(client, now);
  const rows = await sb<any[]>(`/calls?client_id=eq.${client.id}&created_at=gte.${encodeURIComponent(from.toISOString())}&duration_seconds=gt.0&select=duration_seconds,source&limit=50000`).catch(() => []);
  const all = (rows || []).map((r) => Number(r.duration_seconds) || 0);
  const tests = (rows || []).filter((r) => r.source === "manual").map((r) => Number(r.duration_seconds) || 0);
  const lim = limitsOf(client);
  const used = billedMinutes(all);
  const trialEndsAt = lim.plan.key === "trial" ? (client?.trial_ends_at ? new Date(client.trial_ends_at) : null) : null;
  const daysLeft = trialEndsAt ? Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / 86400000)) : null;
  const overage = Math.max(0, used - lim.minutes);
  return {
    periodStart: from.toISOString(), minutesUsed: used, minutesIncluded: lim.minutes, testMinutes: billedMinutes(tests),
    calls: all.length, overageMinutes: overage,
    overageCost: overage && lim.plan.overagePerMin ? Math.round(overage * lim.plan.overagePerMin) : 0,
    trialEndsAt: trialEndsAt?.toISOString() ?? null, trialDaysLeft: daysLeft,
    limits: { employees: lim.employees, concurrency: lim.concurrency, campaignSize: lim.campaignSize, allowOverage: lim.allowOverage },
    plan: { key: lim.plan.key, name: lim.plan.name, pricePerMonth: lim.plan.pricePerMonth, overagePerMin: lim.plan.overagePerMin },
    status: client?.status || "active", suspendedReason: client?.suspended_reason || null,
  };
}

/** Why this workspace can't place calls right now, or null. `extraMinutes` = minutes a new campaign may use. */
export async function callingBlock(client: any, opts: { contacts?: number } = {}): Promise<string | null> {
  if (!client) return "Workspace not found.";
  if (client.status === "suspended")
    return client.suspended_reason === "billing"
      ? "Calling is paused because an invoice is overdue. Pay it on the Billing page and calling turns back on straight away."
      : "Calling is paused on this workspace. Contact RANA to turn it back on.";
  const u = await usageOf(client);
  if (u.plan.key === "trial" && u.trialEndsAt && Date.parse(u.trialEndsAt) < Date.now())
    return `Your free trial ended on ${new Date(u.trialEndsAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}. Pick a plan on the Billing page to keep calling.`;
  if (u.minutesUsed >= u.minutesIncluded && !u.limits.allowOverage)
    return u.plan.key === "trial"
      ? `You've used all ${u.minutesIncluded} trial minutes. Pick a plan on the Billing page to keep calling.`
      : `You've used all ${u.minutesIncluded} minutes in this billing period. Ask RANA to add minutes or turn on overage.`;
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
