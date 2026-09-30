"use client";
// /pricing: every plan in the visitor's choice of currency (₹ $ € ¥). Local price points from lib/pricing, not live FX.
import { useState } from "react";
import Link from "next/link";
import { PLANS, PAID_PLAN_KEYS, PRICE_BOOK, CURRENCIES, CURRENCY_SYMBOL, money, moneyShort, type Currency } from "@/lib/pricing";

const NOTE: Record<Currency, string> = {
  INR: "Prices in Indian rupees, excluding 18% GST. Pay by UPI or card; GST invoice provided.",
  USD: "Prices in US dollars, excluding local taxes. Pay by card.",
  EUR: "Prices in euros, excluding VAT. Pay by card.",
  JPY: "Prices in Japanese yen, excluding consumption tax. Pay by card.",
};

export default function PriceSwitcher() {
  const [cur, setCur] = useState<Currency>("INR");
  const book = PRICE_BOOK[cur];
  const num = (n: number) => n.toLocaleString(cur === "INR" ? "en-IN" : "en-US");
  return (
    <section className="mt-10" data-testid="price-switcher">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-[24px] sm:text-[28px] font-semibold tracking-tight">Plans and prices</h2>
        <div className="inline-flex rounded-full border border-white/10 bg-white/[.03] p-1" role="group" aria-label="Show prices in">
          {CURRENCIES.map((c) => (
            <button key={c} type="button" onClick={() => setCur(c)} aria-pressed={cur === c} data-testid={"price-cur-" + c}
              className={"rounded-full px-3.5 py-1.5 font-mono text-[12px] transition-colors " + (cur === c ? "bg-signal text-on-accent font-semibold" : "text-ink-soft hover:text-ink")}>
              {CURRENCY_SYMBOL[c]} {c}
            </button>
          ))}
        </div>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
        {PAID_PLAN_KEYS.map((k) => {
          const p = PLANS[k], l = book.plans[k as keyof typeof book.plans];
          return (
            <div key={k} className={"rounded-2xl border p-5 flex flex-col " + (k === "growth" ? "border-signal/50 bg-signal/[.06]" : "border-white/10 bg-white/[.02]")} data-testid={"price-plan-" + k}>
              <div className="font-display text-[18px] font-semibold">{p.name}</div>
              <div className="mt-3 font-display text-[30px] font-semibold tracking-tight" data-testid={"price-" + k}>{money(cur, l.price)}<span className="text-[13px] text-ink-soft font-normal">/month</span></div>
              <ul className="mt-3 grid gap-1.5 text-[13.5px] text-ink-soft flex-1">
                <li><b className="text-ink">{num(p.minutes)} minutes</b> included</li>
                <li>Extra minutes {money(cur, l.overage)} each</li>
                <li>{p.employees} AI employee{p.employees > 1 ? "s" : ""} · {p.concurrency} call{p.concurrency > 1 ? "s" : ""} at once</li>
                <li>One-time setup {money(cur, l.setup)} (waived on annual)</li>
              </ul>
              <Link href="/signup" className={"mt-4 rounded-full py-2.5 text-center text-[14px] font-semibold " + (k === "growth" ? "btn-glow" : "btn-ghost")}>Start free trial</Link>
            </div>
          );
        })}
      </div>
      <div className="mt-3 rounded-2xl border border-white/10 bg-white/[.02] p-5 text-[14px]">
        <b>Enterprise</b> <span className="text-ink-soft">· from {moneyShort(cur, book.enterpriseFrom)}/month · {num(PLANS.enterprise.minutes)}+ minutes, unlimited AI employees, {PLANS.enterprise.concurrency} calls at once, custom rates.</span>
      </div>
      <p className="text-[12.5px] text-ink-soft mt-3">{NOTE[cur]} Every plan starts with a 14-day free trial with 100 minutes — no card needed.</p>
    </section>
  );
}
