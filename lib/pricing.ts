// RANA's price list — the ONE place plan prices, limits and engine pricing live. The website, sign-up, Billing page,
// agent builder and HQ all read from here, so a price change is made once and shows the same everywhere.
// Pure data (no server imports): safe in the browser. Prices exclude GST.

export type PlanKey = "trial" | "launch" | "starter" | "growth" | "scale" | "enterprise";
export type Plan = {
  key: PlanKey; name: string; pricePerMonth: number | null; minutes: number; overagePerMin: number | null;
  employees: number; concurrency: number; campaignSize: number; ownNumber: boolean; onboardingFee: number | null; trialDays?: number;
  /** Own Indian number on plans that don't include one: starting monthly rent in ₹ (matches RANA_NUMBER_MONTHLY in lib/numbers — fancy numbers cost more); null = not offered. */
  numberAddon?: number | null;
};

export const PLANS: Record<PlanKey, Plan> = {
  trial:      { key: "trial",      name: "Trial",      pricePerMonth: 0,     minutes: 100,   overagePerMin: null, employees: 1,   concurrency: 1,  campaignSize: 50,     ownNumber: false, onboardingFee: 0, trialDays: 14, numberAddon: null },
  launch:     { key: "launch",     name: "Launch",     pricePerMonth: 4999,  minutes: 400,   overagePerMin: 10,   employees: 1,   concurrency: 1,  campaignSize: 500,    ownNumber: false, onboardingFee: 4999, numberAddon: null },
  starter:    { key: "starter",    name: "Starter",    pricePerMonth: 9999,  minutes: 1000,  overagePerMin: 9,    employees: 1,   concurrency: 2,  campaignSize: 2000,   ownNumber: false, onboardingFee: 14999, numberAddon: 999 },
  growth:     { key: "growth",     name: "Growth",     pricePerMonth: 29999, minutes: 3500,  overagePerMin: 8,    employees: 3,   concurrency: 5,  campaignSize: 10000,  ownNumber: true,  onboardingFee: 24999 },
  scale:      { key: "scale",      name: "Scale",      pricePerMonth: 89999, minutes: 12000, overagePerMin: 7,    employees: 10,  concurrency: 20, campaignSize: 50000,  ownNumber: true,  onboardingFee: 49999 },
  enterprise: { key: "enterprise", name: "Enterprise", pricePerMonth: null,  minutes: 35000, overagePerMin: null, employees: 999, concurrency: 50, campaignSize: 200000, ownNumber: true,  onboardingFee: null },
};
export const PLAN_KEYS = Object.keys(PLANS) as PlanKey[];
export const PAID_PLAN_KEYS: PlanKey[] = ["launch", "starter", "growth", "scale"];
/** The cheapest paid plan — "from ₹X a month" everywhere. */
export const ENTRY_PLAN = PLANS[PAID_PLAN_KEYS[0]];
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
  cartesia: { label: "R2", minuteRate: 1.5, summary: "900+ voices and your own cloned voice" },
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
  const r1: number = ENGINE_PRICING.sarvam.minuteRate, r2: number = ENGINE_PRICING.cartesia.minuteRate;
  return r1 === r2
    ? "Every plan includes both voice engines, R1 and R2, at the same per-minute price."
    : `Every plan includes both voice engines. Premium voices and voice cloning (R2) use ${r2 / r1} minutes of your plan per call minute.`;
}

export const inr0 = (n: number) => n.toLocaleString("en-IN");
/** ₹ in Indian short form: ₹4,999 · ₹2.5 L · ₹1.2 Cr. */
export function inrShort(n: number): string {
  const a = Math.abs(n);
  const trim = (x: number) => (x >= 100 ? Math.round(x).toLocaleString("en-IN") : String(Math.round(x * 10) / 10));
  if (a >= 1e7) return `₹${trim(n / 1e7)} Cr`;
  if (a >= 1e5) return `₹${trim(n / 1e5)} L`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

/** What each plan includes, worded once for the website and the Billing page. */
export function planHighlights(p: Plan): string[] {
  const out = [
    `${p.employees >= 999 ? "Unlimited" : p.employees} AI employee${p.employees === 1 ? "" : "s"}`,
    `${p.concurrency} call${p.concurrency === 1 ? "" : "s"} at the same time`,
    `Campaigns up to ${inr0(p.campaignSize)} numbers`,
    p.ownNumber ? "Your own Indian number" : p.numberAddon ? `Shared Indian number (own number from +₹${inr0(p.numberAddon)}/month)` : "Shared Indian number",
    "Both voice engines: R1 and R2",
  ];
  return out;
}
export function numberCell(p: Plan): string {
  return p.ownNumber ? "Included" : p.numberAddon ? `From +₹${inr0(p.numberAddon)}/month` : "Shared";
}

// ---------- Currencies ----------
// Plans have the same minutes everywhere; only the price changes by currency. INR comes from PLANS above.
// Other currencies are set as clean local price points (not live FX conversions) and exclude local taxes.
export type Currency = "INR" | "USD" | "EUR" | "JPY";
export const CURRENCIES: Currency[] = ["INR", "USD", "EUR", "JPY"];
export type PaidKey = "launch" | "starter" | "growth" | "scale";
type LocalPrice = { price: number; overage: number; setup: number };

export const PRICE_BOOK: Record<Currency, { plans: Record<PaidKey, LocalPrice>; enterpriseFrom: number }> = {
  INR: {
    plans: {
      launch:  { price: PLANS.launch.pricePerMonth || 0,  overage: PLANS.launch.overagePerMin || 0,  setup: PLANS.launch.onboardingFee || 0 },
      starter: { price: PLANS.starter.pricePerMonth || 0, overage: PLANS.starter.overagePerMin || 0, setup: PLANS.starter.onboardingFee || 0 },
      growth:  { price: PLANS.growth.pricePerMonth || 0,  overage: PLANS.growth.overagePerMin || 0,  setup: PLANS.growth.onboardingFee || 0 },
      scale:   { price: PLANS.scale.pricePerMonth || 0,   overage: PLANS.scale.overagePerMin || 0,   setup: PLANS.scale.onboardingFee || 0 },
    },
    enterpriseFrom: ENTERPRISE_FROM,
  },
  USD: {
    plans: { launch: { price: 69, overage: 0.19, setup: 69 }, starter: { price: 149, overage: 0.17, setup: 199 }, growth: { price: 449, overage: 0.15, setup: 349 }, scale: { price: 1290, overage: 0.12, setup: 699 } },
    enterpriseFrom: 3000,
  },
  EUR: {
    plans: { launch: { price: 65, overage: 0.18, setup: 65 }, starter: { price: 139, overage: 0.16, setup: 189 }, growth: { price: 419, overage: 0.14, setup: 329 }, scale: { price: 1190, overage: 0.11, setup: 649 } },
    enterpriseFrom: 2800,
  },
  JPY: {
    plans: { launch: { price: 9900, overage: 28, setup: 9900 }, starter: { price: 21900, overage: 25, setup: 29000 }, growth: { price: 65000, overage: 22, setup: 49000 }, scale: { price: 189000, overage: 18, setup: 99000 } },
    enterpriseFrom: 450000,
  },
};

const LOCALE: Record<Currency, string> = { INR: "en-IN", USD: "en-US", EUR: "en-IE", JPY: "en-US" };
export const CURRENCY_SYMBOL: Record<Currency, string> = { INR: "₹", USD: "$", EUR: "€", JPY: "¥" };

/** ₹9,999 · $149 · €0.16 · ¥21,900 — decimals only when the amount has them. */
export function money(cur: Currency, n: number): string {
  const frac = cur === "JPY" || Number.isInteger(n) ? 0 : 2;
  return new Intl.NumberFormat(LOCALE[cur], { style: "currency", currency: cur, minimumFractionDigits: frac, maximumFractionDigits: frac }).format(n);
}
/** Just the number part, for big price displays next to a separate symbol. */
export function amount(cur: Currency, n: number): string {
  return new Intl.NumberFormat(LOCALE[cur], { maximumFractionDigits: cur === "JPY" ? 0 : 2 }).format(n);
}
/** Short form for big numbers: ₹2.5 L / ₹1.2 Cr for rupees, $1.2M / €450K / ¥3.5M for others. */
export function moneyShort(cur: Currency, n: number): string {
  if (cur === "INR") return inrShort(n);
  if (Math.abs(n) < 10000) return money(cur, Math.round(n));
  // Hand-rolled (not Intl "compact"): Node and browsers format compact numbers differently, which breaks hydration.
  const a = Math.abs(n);
  const [d, u] = a >= 1e9 ? [1e9, "B"] : a >= 1e6 ? [1e6, "M"] : [1e3, "K"];
  const x = n / d;
  const t = x >= 100 ? String(Math.round(x)) : String(Math.round(x * 10) / 10);
  return `${CURRENCY_SYMBOL[cur]}${t}${u}`;
}

export function entryPrice(cur: Currency): number { return PRICE_BOOK[cur].plans.launch.price; }
