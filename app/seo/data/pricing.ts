// /pricing — a standalone, indexable price page ("how much does an AI calling agent cost in India?").
import type { SeoPageData } from "../types";
import { PLANS, PAID_PLAN_KEYS, TRIAL_DAYS, TRIAL_MINUTES, ENTERPRISE_FROM } from "@/lib/pricing";
import { inr } from "./shared";

const rows = PAID_PLAN_KEYS.map((k) => {
  const p = PLANS[k];
  return [p.name, `${inr(p.pricePerMonth!)}/month`, `${p.minutes.toLocaleString("en-IN")} min`, `≈ ₹${(p.pricePerMonth! / p.minutes).toFixed(1)}`, p.overagePerMin ? `₹${p.overagePerMin}/min` : "—", String(p.employees), String(p.concurrency), p.onboardingFee ? inr(p.onboardingFee) : "Free"];
});

export const PRICING: SeoPageData = {
  path: "/pricing", kind: "pricing", label: "Pricing",
  title: "AI Calling Agent Pricing India — From ₹4,999/month",
  description: `How much does an AI calling agent cost in India? RANA AI plans start at ${inr(PLANS.launch.pricePerMonth!)}/month for ${PLANS.launch.minutes} minutes, billed in 30-second pulses. ${TRIAL_DAYS}-day free trial. Prices exclude GST.`,
  h1: "AI calling agent pricing — simple monthly plans in rupees",
  eyebrow: "Pricing · India",
  intro: `Pay a fixed monthly plan that includes your minutes, both voice engines, the dashboard, recordings and lead alerts. Calls are billed in 30-second pulses, so a 40-second call uses 1 minute, not 2. Start with a ${TRIAL_DAYS}-day free trial with ${TRIAL_MINUTES} minutes — no card needed.`,
  keywords: ["ai calling agent pricing", "ai voice agent price india", "ai telecaller cost", "ai calling cost per minute india", "ai receptionist price", "how much does ai calling cost"],
  facts: ["Prices in ₹, excl. GST", "30-second billing pulses", "Both voice engines included", `${TRIAL_DAYS}-day free trial`],
  sections: [
    { h2: "Full plan details (₹)", table: { head: ["Plan", "Price", "Minutes included", "Per minute", "Extra minutes", "AI employees", "Calls at once", "One-time setup"], rows: [...rows, ["Enterprise", `From ${inr(ENTERPRISE_FROM)}/month`, "35,000+ min", "Custom", "Custom", "Unlimited", "50+", "Custom"]], note: "All prices exclude 18% GST. Premium voices and voice cloning (R2) use 1.5 plan minutes per call minute. Growth and higher include your own Indian number; Starter can add one from ₹999/month." } },
    { h2: "What's included in every plan", bullets: ["Inbound answering and outbound campaigns", "11 Indian languages + Spanish, French, Japanese", "Recordings, transcripts and hot / warm / cold lead scores for every call", "Lead alerts on WhatsApp, Slack, email or webhook", "Mission control live view and reports export", "Do-not-call list and calling-hour controls", "Setup help from our team"] },
    { h2: "What does a call actually cost?", body: "A typical qualification call lasts 1–2 minutes; a clinic booking about 1 minute; a renewal reminder under a minute. On the Starter plan (₹9,999 for 1,000 minutes), that is roughly ₹10 per connected minute — so a qualified lead costs a few rupees of calling time.\n\nCalls that don't connect (no answer, busy, switched off) don't use your talk minutes. Billing is in 30-second pulses, so short calls stay cheap." },
    { h2: "Compare with a telecaller", table: { head: ["", "One telecaller", "RANA Starter"], rows: [["Monthly cost", "₹15,000–25,000 + incentives", inr(PLANS.starter.pricePerMonth!)], ["Hours", "~8 hours, 6 days a week", "24×7"], ["Calls at once", "1", String(PLANS.starter.concurrency)], ["Languages", "1–2", "14"]], note: "Telecaller salaries are typical ranges in Indian metros." } },
  ],
  faqs: [
    { q: "How much does an AI calling agent cost in India?", a: `With RANA AI, from ${inr(PLANS.launch.pricePerMonth!)}/month (Launch, ${PLANS.launch.minutes} minutes) to ${inr(PLANS.scale.pricePerMonth!)}/month (Scale, ${PLANS.scale.minutes.toLocaleString("en-IN")} minutes). That works out to roughly ₹7.5–12.5 per connected minute, plus GST.` },
    { q: "Is there a setup fee?", a: `Yes, a one-time setup fee from ${inr(PLANS.launch.onboardingFee!)} covers building and testing your AI employee with your script, FAQs and languages. The free trial has no setup fee.` },
    { q: "What happens if I use more minutes than my plan?", a: "Paid plans continue at the plan's extra-minute rate (₹7–10 per minute), so calls never stop mid-campaign. You can also move up a plan any time." },
    { q: "Do unanswered calls use minutes?", a: "No — only connected talk time counts, billed in 30-second pulses." },
    { q: "Can I pay monthly and cancel any time?", a: "Yes. Plans are monthly. See our refund policy for details." },
    { q: "Do you have international pricing?", a: "Yes — switch the currency at the top of this page to see every plan in US dollars, euros or yen." },
  ],
  related: ["/compare/ai-vs-human-telecaller", "/blog/telecaller-vs-ai-calling-cost-india", "/vapi-alternative-india", "/ai-calling-agent", "/ai-receptionist"],
};
