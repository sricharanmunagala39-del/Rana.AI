"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";

const inr = (n: number | null | undefined) => (n === null || n === undefined ? "Custom" : `₹${Math.round(n).toLocaleString("en-IN")}`);
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");

export default function BillingPage() {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    fetch("/api/account/usage").then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Couldn't load usage"); setD(j); }).catch((e) => setErr(e.message));
  }, []);
  const u = d?.usage;
  const pct = u ? Math.min(100, (u.minutesUsed / Math.max(1, u.minutesIncluded)) * 100) : 0;
  const plans = d ? Object.values(d.plans) as any[] : [];
  const trialOver = u?.plan.key === "trial" && u.trialEndsAt && Date.parse(u.trialEndsAt) < Date.now();
  const outOfMinutes = u && u.minutesUsed >= u.minutesIncluded && !u.limits.allowOverage;

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar active="billing" />
      <div className="flex-1 p-10">
        <div className="max-w-[900px] flex flex-col gap-6">
          <div>
            <div className="text-[20px] font-display font-semibold">Plan & usage</div>
            <div className="text-[13px] text-ink-soft mt-0.5">Your plan, the minutes you've used this period, and what each plan includes. You're billed for connected minutes only — unanswered calls are free.</div>
          </div>
          {err && <div className="text-[13px] text-miss">{err}</div>}
          {!u && !err && <div className="text-[13px] text-ink-soft">Loading…</div>}

          {u && (
            <>
              {(u.status === "suspended" || trialOver || outOfMinutes) && (
                <div className="rounded-xl border border-miss/30 bg-miss-tint px-5 py-4 text-[13px] text-miss" data-testid="billing-block">
                  <b>Calling is paused.</b>{" "}
                  {u.status === "suspended" ? "RANA has paused this workspace." : trialOver ? `Your free trial ended on ${fmt(u.trialEndsAt)}.` : `You've used all ${u.minutesIncluded} minutes in this period.`}{" "}
                  Your employees, scripts and results are safe. Write to <span className="font-semibold">support@getrana.in</span> to pick a plan and turn calling back on.
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 border border-line rounded-xl bg-white p-5 flex flex-col gap-3" data-testid="usage-card">
                  <div className="flex items-baseline justify-between gap-3 flex-wrap">
                    <div className="text-[15px] font-semibold">{u.plan.name} plan</div>
                    <div className="text-[12px] text-ink-soft">{u.plan.key === "trial" ? `Trial ends ${fmt(u.trialEndsAt)}${u.trialDaysLeft !== null ? ` · ${u.trialDaysLeft} days left` : ""}` : `This period started ${fmt(u.periodStart)}`}</div>
                  </div>
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-[30px] font-display font-semibold tabular-nums">{u.minutesUsed.toLocaleString("en-IN")}</span>
                      <span className="text-[13px] text-ink-soft">of {u.minutesIncluded.toLocaleString("en-IN")} connected minutes</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-paper mt-2 overflow-hidden"><div className={`h-full ${pct >= 100 ? "bg-miss" : pct >= 80 ? "bg-hot" : "bg-signal"}`} style={{ width: `${pct}%` }} /></div>
                    <div className="text-[12px] text-ink-soft mt-2">
                      {u.calls} connected call{u.calls === 1 ? "" : "s"} · {u.testMinutes} min of Talk-page tests included
                      {u.overageMinutes > 0 ? ` · ${u.overageMinutes} min over plan${u.overageCost ? ` (${inr(u.overageCost)} + GST)` : ""}` : ""}
                    </div>
                  </div>
                </div>
                <div className="border border-line rounded-xl bg-white p-5 flex flex-col gap-2 text-[13px]" data-testid="limits-card">
                  <div className="text-[15px] font-semibold">What's included</div>
                  <div className="flex justify-between"><span className="text-ink-soft">Employees</span><b>{u.limits.employees >= 999 ? "Unlimited" : u.limits.employees}</b></div>
                  <div className="flex justify-between"><span className="text-ink-soft">Calls at once</span><b>{u.limits.concurrency}</b></div>
                  <div className="flex justify-between"><span className="text-ink-soft">Numbers per campaign</span><b>{u.limits.campaignSize.toLocaleString("en-IN")}</b></div>
                  <div className="flex justify-between"><span className="text-ink-soft">Calling number</span><b>{d.number || "Shared RANA number"}</b></div>
                  <div className="flex justify-between"><span className="text-ink-soft">Extra minutes</span><b>{u.limits.allowOverage ? `${inr(u.plan.overagePerMin)}/min` : "Pause at limit"}</b></div>
                </div>
              </div>

              <div className="border border-line rounded-xl bg-white overflow-x-auto" data-testid="plans-table">
                <table className="w-full text-[13px] min-w-[680px]">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-ink-soft border-b border-line">
                      <th className="px-4 py-3">Plan</th><th className="px-4 py-3">Per month</th><th className="px-4 py-3">Minutes</th><th className="px-4 py-3">Extra minute</th><th className="px-4 py-3">Employees</th><th className="px-4 py-3">Calls at once</th><th className="px-4 py-3">Own number</th><th className="px-4 py-3">Onboarding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plans.map((p) => (
                      <tr key={p.key} className={`border-b border-line last:border-0 ${p.key === u.plan.key ? "bg-signal-tint/60" : ""}`}>
                        <td className="px-4 py-3 font-semibold">{p.name}{p.key === u.plan.key ? <span className="ml-2 text-[10.5px] text-signal">Current</span> : null}</td>
                        <td className="px-4 py-3 tabular-nums">{p.key === "trial" ? "Free · 14 days" : p.pricePerMonth ? inr(p.pricePerMonth) : "From ₹2.5 lakh"}</td>
                        <td className="px-4 py-3 tabular-nums">{p.key === "enterprise" ? "35,000+" : p.minutes.toLocaleString("en-IN")}</td>
                        <td className="px-4 py-3 tabular-nums">{p.overagePerMin ? `${inr(p.overagePerMin)}` : "—"}</td>
                        <td className="px-4 py-3">{p.employees >= 999 ? "Unlimited" : p.employees}</td>
                        <td className="px-4 py-3">{p.concurrency}</td>
                        <td className="px-4 py-3">{p.ownNumber ? "Included" : p.key === "starter" ? "₹500/month" : "Shared"}</td>
                        <td className="px-4 py-3 tabular-nums">{p.onboardingFee === 0 ? "Free" : p.onboardingFee ? inr(p.onboardingFee) : "Custom"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="text-[12px] text-ink-soft">Prices exclude 18% GST. Minutes are counted per call, rounded up to the next 30 seconds. Unused minutes don't roll over. Annual prepay: 12 months for the price of 10, onboarding free. To change plan, write to <span className="font-semibold">support@getrana.in</span>.</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
