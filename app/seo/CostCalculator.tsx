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

//@@SPLIT@@
