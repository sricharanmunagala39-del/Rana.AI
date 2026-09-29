// RANA's price list — the ONE place plan prices, limits and engine pricing live. The website, sign-up, Billing page,
// agent builder and HQ all read from here, so a price change is made once and shows the same everywhere.
// Pure data (no server imports): safe in the browser. Prices exclude GST.

export type PlanKey = "trial" | "starter" | "growth" | "scale" | "enterprise";
export type Plan = {
  key: PlanKey; name: string; pricePerMonth: number | null; minutes: number; overagePerMin: number | null;
  employees: number; concurrency: number; campaignSize: number; ownNumber: boolean; onboardingFee: number | null; trialDays?: number;
  /** Own Indian number on plans that don't include one (₹/month); null = not offered. */
  numberAddon?: number | null;
};

export const PLANS: Record<PlanKey, Plan> = {
  trial:      { key: "trial",      name: "Trial",      pricePerMonth: 0,     minutes: 100,   overagePerMin: null, employees: 1,   concurrency: 1,  campaignSize: 50,     ownNumber: false, onboardingFee: 0, trialDays: 14, numberAddon: null },
  starter:    { key: "starter",    name: "Starter",    pricePerMonth: 9999,  minutes: 1000,  overagePerMin: 9,    employees: 1,   concurrency: 2,  campaignSize: 2000,   ownNumber: false, onboardingFee: 14999, numberAddon: 500 },
  growth:     { key: "growth",     name: "Growth",     pricePerMonth: 29999, minutes: 3500,  overagePerMin: 8,    employees: 3,   concurrency: 5,  campaignSize: 10000,  ownNumber: true,  onboardingFee: 24999 },
  scale:      { key: "scale",      name: "Scale",      pricePerMonth: 89999, minutes: 12000, overagePerMin: 7,    employees: 10,  concurrency: 20, campaignSize: 50000,  ownNumber: true,  onboardingFee: 49999 },
  enterprise: { key: "enterprise", name: "Enterprise", pricePerMonth: null,  minutes: 35000, overagePerMin: null, employees: 999, concurrency: 50, campaignSize: 200000, ownNumber: true,  onboardingFee: null },
};
export const PLAN_KEYS = Object.keys(PLANS) as PlanKey[];
export const PAID_PLAN_KEYS: PlanKey[] = ["starter", "growth", "scale"];
export const TRIAL_MINUTES = PLANS.trial.minutes;
export const TRIAL_DAYS = PLANS.trial.trialDays || 14;
export const ENTERPRISE_FROM = 250000; // "From ₹2.5 lakh"

/**
 * Voice engines, as customers see them (never the provider names).
 * minuteRate = plan minutes used per connected minute on that engine. R2 costs us more per minute
 * (see the RANA Unit Economics page), so it can be priced as a premium by raising its rate here —
 * billing, the Billing page, the builder and the website all follow this number.
 */
export const ENGINE_PRICING = {
  sarvam:   { label: "R1", minuteRate: 1, summary: "Built for Indian languages, switches language mid-call" },
  cartesia: { label: "R2", minuteRate: 1, summary: "900+ voices and your own cloned voice" },
} as const;
export type EngineKey = keyof typeof ENGINE_PRICING;
export const engineMinuteRate = (engine?: string | null) => (ENGINE_PRICING as any)[engine || "sarvam"]?.minuteRate ?? 1;

/** "1 plan minute per call minute" / "1.5 plan minutes per call minute" — one wording everywhere. */
export function engineRateText(engine: EngineKey): string {
  const r = ENGINE_PRICING[engine].minuteRate;
  return r === 1 ? "1 plan minute per call minute" : `${r} plan minutes per call minute`;
}
/** One line for pricing pages. */
export function enginesPricingLine(): string {
  const r1 = ENGINE_PRICING.sarvam.minuteRate, r2 = ENGINE_PRICING.cartesia.minuteRate;
  return r1 === r2
    ? "Every plan includes both voice engines, R1 and R2, at the same per-minute price."
    : `Every plan includes both voice engines. R1 uses ${engineRateText("sarvam")}; R2 (premium voices and voice cloning) uses ${engineRateText("cartesia")}.`;
}

export const inr0 = (n: number) => n.toLocaleString("en-IN");

/** What each plan includes, worded once for the website and the Billing page. */
export function planHighlights(p: Plan): string[] {
  const out = [
    `${p.employees >= 999 ? "Unlimited" : p.employees} AI employee${p.employees === 1 ? "" : "s"}`,
    `${p.concurrency} call${p.concurrency === 1 ? "" : "s"} at the same time`,
    `Campaigns up to ${inr0(p.campaignSize)} numbers`,
    p.ownNumber ? "Your own Indian number" : p.numberAddon ? `Shared Indian number (own number +₹${inr0(p.numberAddon)}/month)` : "Shared Indian number",
    "Both voice engines: R1 and R2",
  ];
  return out;
}
export function numberCell(p: Plan): string {
  return p.ownNumber ? "Included" : p.numberAddon ? `+₹${inr0(p.numberAddon)}/month` : "Shared";
}
