"use client";
// Telecaller vs AI calling cost calculator (/tools/ai-calling-cost-calculator).
// Uses the real plan list from lib/pricing, so it never drifts from the pricing page.
import { useMemo, useState } from "react";
import Link from "next/link";
import { PLANS, PAID_PLAN_KEYS, ENTERPRISE_FROM, inrShort } from "@/lib/pricing";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

function Field({ label, hint, value, set, min, max, step = 1, suffix }: { label: string; hint?: string; value: number; set: (n: number) => void; min: number; max: number; step?: number; suffix?: string }) {
  return (
    <label className="block">
      <div className="flex justify-between gap-3 text-[14px]"><span className="font-medium">{label}</span><span className="font-mono text-signal">{value.toLocaleString("en-IN")}{suffix}</span></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(Number(e.target.value))} className="w-full mt-2 accent-[var(--signal,#35e0c4)]" aria-label={label} />
      {hint && <div className="text-[12px] text-ink-soft mt-1">{hint}</div>}
    </label>
  );
}

export default function CostCalculator() {
  const [people, setPeople] = useState(3);
  const [salary, setSalary] = useState(20000);
  const [calls, setCalls] = useState(100);
  const [connect, setConnect] = useState(40);
  const [mins, setMins] = useState(2);
  const [keep, setKeep] = useState(0);

  const r = useMemo(() => {
    const workDays = 26;
    const humanCost = people * salary * 1.2; // +20% for incentives, PF, seat, SIM, attrition
    const connected = people * calls * workDays * (connect / 100);
    const aiMinutes = Math.ceil(connected * mins * 1.1); // +10% for short unanswered attempts
    const options = PAID_PLAN_KEYS.map((k) => {
      const p = PLANS[k];
      const over = Math.max(0, aiMinutes - p.minutes);
      return { p, cost: p.pricePerMonth! + over * (p.overagePerMin || 0), over };
    }).sort((a, b) => a.cost - b.cost);
    const best = options[0];
    const enterprise = aiMinutes > PLANS.scale.minutes * 2;
    const keptCost = Math.min(keep, people) * salary * 1.2;
    const aiTotal = (enterprise ? Math.max(best.cost, ENTERPRISE_FROM) : best.cost) + keptCost;
    return { humanCost, connected, aiMinutes, best, enterprise, keptCost, aiTotal, saving: humanCost - aiTotal };
  }, [people, salary, calls, connect, mins, keep]);

  return (
    <section className="mt-10 rounded-2xl border border-signal/30 bg-signal/[.05] p-5 sm:p-7" data-testid="cost-calculator">
      <h2 className="font-display text-[22px] sm:text-[26px] font-semibold tracking-tight">Your numbers</h2>
      <div className="grid md:grid-cols-2 gap-x-8 gap-y-5 mt-5">
        <Field label="Telecallers today" value={people} set={setPeople} min={1} max={50} />
        <Field label="Monthly salary per telecaller" value={salary} set={setSalary} min={10000} max={50000} step={1000} hint="We add 20% for incentives, PF, seat, SIM and attrition." suffix=" ₹" />
        <Field label="Dials per telecaller per day" value={calls} set={setCalls} min={20} max={300} step={10} />
        <Field label="Calls that connect" value={connect} set={setConnect} min={10} max={90} step={5} suffix="%" />
        <Field label="Average connected call length" value={mins} set={setMins} min={1} max={10} step={0.5} suffix=" min" />
        <Field label="Telecallers you keep for closing" value={keep} set={setKeep} min={0} max={Math.max(0, people)} hint="AI makes the first call; your best people call back hot leads." />
      </div>

      <div className="grid sm:grid-cols-3 gap-3 mt-7">
        <div className="rounded-xl border border-white/10 bg-white/[.03] p-4">
          <div className="font-mono text-[11px] uppercase tracking-wider text-ink-soft">Telecalling today</div>
          <div className="font-display text-[26px] font-semibold mt-1" data-testid="calc-human">{inr(r.humanCost)}<span className="text-[13px] text-ink-soft font-normal">/mo</span></div>
          <div className="text-[12.5px] text-ink-soft mt-1">{Math.round(r.connected).toLocaleString("en-IN")} connected calls a month</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[.03] p-4">
          <div className="font-mono text-[11px] uppercase tracking-wider text-ink-soft">With RANA AI</div>
          <div className="font-display text-[26px] font-semibold mt-1" data-testid="calc-ai">{inr(r.aiTotal)}<span className="text-[13px] text-ink-soft font-normal">/mo</span></div>
          <div className="text-[12.5px] text-ink-soft mt-1">{r.enterprise ? "Enterprise (from " + inrShort(ENTERPRISE_FROM) + ")" : r.best.p.name + " plan · " + r.aiMinutes.toLocaleString("en-IN") + " min" + (r.best.over ? " (" + r.best.over.toLocaleString("en-IN") + " over)" : "")}{r.keptCost ? " + " + keep + (keep > 1 ? " closers" : " closer") : ""}</div>
        </div>
        <div className={"rounded-xl border p-4 " + (r.saving > 0 ? "border-signal/40 bg-signal/[.08]" : "border-white/10 bg-white/[.03]")}>
          <div className="font-mono text-[11px] uppercase tracking-wider text-ink-soft">{r.saving > 0 ? "Estimated saving" : "AI costs more by"}</div>
          <div className={"font-display text-[26px] font-semibold mt-1" + (r.saving > 0 ? " text-signal" : "")} data-testid="calc-saving">{inr(Math.abs(r.saving))}<span className="text-[13px] text-ink-soft font-normal">/mo</span></div>
          <div className="text-[12.5px] text-ink-soft mt-1">{r.saving > 0 ? inr(r.saving * 12) + " a year" : "At this volume a small team may be cheaper — AI still adds 24×7 cover."}</div>
        </div>
      </div>
      <p className="text-[12px] text-ink-soft mt-4">An estimate, not a quote: prices exclude GST and one-time onboarding; your connect rates and call lengths will differ. <Link href="/pricing" className="underline hover:text-signal">See every plan</Link>.</p>
    </section>
  );
}
