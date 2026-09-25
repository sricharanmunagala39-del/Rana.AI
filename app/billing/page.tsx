"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { inr } from "@/lib/money";
import WalletCard from "@/components/WalletCard";

const SELF = ["starter", "growth", "scale"];
const STATUS: Record<string, string> = { issued: "Due", paid: "Paid", void: "Cancelled" };
const field = "mt-1 w-full border border-line rounded-lg px-3 py-2 text-[13px] font-normal";
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");

export default function BillingPage() {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  const [b, setB] = useState<any>(null);
  const [interval, setInterval_] = useState<"monthly" | "annual">("monthly");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [details, setDetails] = useState<any>(null); // open billing-details form (values)
  const [afterSave, setAfterSave] = useState<string | null>(null); // plan to check out once details are saved
  const [pending, setPending] = useState<any>(null); // invoice waiting for offline payment

  const loadUsage = () => fetch("/api/account/usage").then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Couldn't load usage"); setD(j); }).catch((e) => setErr(e.message));
  const loadBilling = () => fetch("/api/billing").then(async (r) => { const j = await r.json(); if (r.ok && Array.isArray(j.invoices) && j.quotes) setB(j); }).catch(() => {});
  useEffect(() => {
    loadUsage(); loadBilling();
    // Back from Razorpay: confirm the payment straight away (the webhook also does this).
    const q = new URLSearchParams(window.location.search);
    if (q.get("invoice")) {
      const body: any = {}; q.forEach((v, k) => { body[k] = v; });
      setNotice({ ok: true, text: "Checking your payment…" });
      fetch("/api/billing/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        .then((r) => r.json())
        .then((j) => {
          setNotice(j.paid ? { ok: true, text: `Payment received for ${j.invoice?.number}. Thank you — your plan is on.` } : { ok: false, text: "We haven't received this payment yet. If money left your account, it will show here within a few minutes." });
          loadUsage(); loadBilling();
        })
        .catch(() => setNotice({ ok: false, text: "Couldn't check the payment. Refresh in a minute." }));
      window.history.replaceState(null, "", "/billing");
    }
  }, []);

  async function checkout(plan: string) {
    setMsg("");
    if (!b?.profile?.name) { setDetails({ ...(b?.profile || {}) }); setAfterSave(plan); return; }
    setBusy(plan);
    try {
      const r = await fetch("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan, interval }) });
      const j = await r.json();
      if (!r.ok) { if (j.code === "billing_details") { setDetails({ ...(b?.profile || {}) }); setAfterSave(plan); } else setMsg(j.error || "Couldn't start the payment."); return; }
      if (j.payUrl) { window.location.href = j.payUrl; return; }
      setPending(j); loadBilling();
    } finally { setBusy(""); }
  }

  async function saveDetails() {
    setBusy("details"); setMsg("");
    try {
      const r = await fetch("/api/billing", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(details) });
      const j = await r.json();
      if (!r.ok) { setMsg(j.error || "Couldn't save."); return; }
      setB((x: any) => ({ ...x, profile: j.profile }));
      setDetails(null);
      const next = afterSave; setAfterSave(null);
      await loadBilling();
      if (next) setTimeout(() => document.querySelector<HTMLButtonElement>(`[data-testid=buy-${next}]`)?.click(), 50);
    } finally { setBusy(""); }
  }
  const u = d?.usage;
  const pct = u ? Math.min(100, (u.minutesUsed / Math.max(1, u.minutesIncluded)) * 100) : 0;
  const plans = d ? Object.values(d.plans) as any[] : [];
  const trialOver = u?.plan.key === "trial" && u.trialEndsAt && Date.parse(u.trialEndsAt) < Date.now();
  const outOfMinutes = u && u.minutesUsed >= u.minutesIncluded && !u.limits.allowOverage && !(b?.wallet?.enabled && b.wallet.balance > 0);

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
              {notice && <div className={`rounded-xl border px-5 py-4 text-[13px] ${notice.ok ? "border-signal/30 bg-signal-tint text-ink" : "border-hot/40 bg-hot/10"}`} data-testid="pay-notice">{notice.text}</div>}
              {b?.state?.overdue && !b.state.suspendedForBilling && (
                <div className="rounded-xl border border-hot/40 bg-hot/10 px-5 py-4 text-[13px]" data-testid="overdue">
                  <b>An invoice is overdue.</b> Pay {inr(b.state.openTotal, true)} by {fmt(b.state.pauseOn)} to keep calling. See Invoices below.
                </div>
              )}
              {(u.status === "suspended" || trialOver || outOfMinutes) && (
                <div className="rounded-xl border border-miss/30 bg-miss-tint px-5 py-4 text-[13px] text-miss" data-testid="billing-block">
                  <b>Calling is paused.</b>{" "}
                  {u.status === "suspended" ? (u.suspendedReason === "billing" ? "An invoice is overdue. Pay it below and calling turns back on straight away." : "RANA has paused this workspace.") : trialOver ? `Your free trial ended on ${fmt(u.trialEndsAt)}.` : `You've used all ${u.minutesIncluded} minutes in this period.`}{" "}
                  Your employees, scripts and results are safe. {u.suspendedReason === "billing" ? "" : "Pick a plan below, or write to support@getrana.in."}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 border border-line rounded-xl bg-raised p-5 flex flex-col gap-3" data-testid="usage-card">
                  <div className="flex items-baseline justify-between gap-3 flex-wrap">
                    <div className="text-[15px] font-semibold">{u.plan.name} plan</div>
                    <div className="text-[12px] text-ink-soft">{u.plan.key === "trial" ? `Trial ends ${fmt(u.trialEndsAt)}${u.trialDaysLeft !== null ? ` · ${u.trialDaysLeft} days left` : ""}` : `This period started ${fmt(u.periodStart)}${b?.state?.paidUntil ? ` · paid until ${fmt(b.state.paidUntil)}` : ""}`}</div>
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
                <div className="border border-line rounded-xl bg-raised p-5 flex flex-col gap-2 text-[13px]" data-testid="limits-card">
                  <div className="text-[15px] font-semibold">What's included</div>
                  <div className="flex justify-between"><span className="text-ink-soft">Employees</span><b>{u.limits.employees >= 999 ? "Unlimited" : u.limits.employees}</b></div>
                  <div className="flex justify-between"><span className="text-ink-soft">Calls at once</span><b>{u.limits.concurrency}</b></div>
                  <div className="flex justify-between"><span className="text-ink-soft">Numbers per campaign</span><b>{u.limits.campaignSize.toLocaleString("en-IN")}</b></div>
                  <div className="flex justify-between"><span className="text-ink-soft">Calling number</span><b>{d.number || "Shared RANA number"}</b></div>
                  <div className="flex justify-between"><span className="text-ink-soft">Extra minutes</span><b>{b?.wallet?.enabled ? `From balance · ${inr(u.plan.overagePerMin)}/min` : u.limits.allowOverage ? `${inr(u.plan.overagePerMin)}/min` : "Pause at limit"}</b></div>
                </div>
              </div>

              {b?.wallet && (
                <WalletCard w={b.wallet} canPay={b.canPay} onOffline={(j) => setPending(j)} onNeedDetails={() => { setMsg(""); setDetails({ ...(b.profile || {}) }); }} onChanged={() => { loadBilling(); loadUsage(); }} />
              )}

              <div className="border border-line rounded-xl bg-raised overflow-x-auto" data-testid="plans-table">
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
              <div className="text-[12px] text-ink-soft">Prices exclude 18% GST. Minutes are counted per call, rounded up to the next 30 seconds. Unused minutes don't roll over. Annual prepay: 12 months for the price of 10, onboarding free. Enterprise and custom deals: <span className="font-semibold">support@getrana.in</span>.</div>

              {b && (
                <div className="border border-line rounded-xl bg-raised p-5 flex flex-col gap-4" data-testid="choose-plan">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <div className="text-[15px] font-semibold">{u.plan.key === "trial" ? "Choose your plan" : "Change or renew your plan"}</div>
                      <div className="text-[12px] text-ink-soft">{b.razorpay.enabled ? "Pay by UPI, card or netbanking. Your plan switches on the moment the payment goes through." : "You'll get a GST invoice with bank and UPI details. Your plan switches on as soon as RANA sees the payment."}{b.razorpay.mode === "test" ? " (Test mode — no real money moves.)" : ""}</div>
                    </div>
                    <div className="flex rounded-lg border border-line overflow-hidden text-[12.5px] font-semibold" data-testid="interval">
                      {(["monthly", "annual"] as const).map((k) => (
                        <button key={k} onClick={() => setInterval_(k)} className={`px-3 py-1.5 ${interval === k ? "bg-ink text-paper" : "bg-raised"}`}>{k === "monthly" ? "Monthly" : "Annual · 2 months free"}</button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {SELF.map((k) => {
                      const p = plans.find((x) => x.key === k); const q = b.quotes[`${k}:${interval}`];
                      if (!p || !q) return null;
                      const current = u.plan.key === k;
                      return (
                        <div key={k} className={`rounded-xl border p-4 flex flex-col gap-2 ${current ? "border-signal bg-signal-tint/40" : "border-line"}`} data-testid={`plan-${k}`}>
                          <div className="flex items-baseline justify-between"><div className="text-[14px] font-semibold">{p.name}</div>{k === "growth" && <span className="text-[10.5px] font-semibold text-signal">Most popular</span>}</div>
                          <div><span className="text-[22px] font-display font-semibold tabular-nums">{inr(interval === "annual" ? p.pricePerMonth * 10 : p.pricePerMonth)}</span><span className="text-[12px] text-ink-soft">/{interval === "annual" ? "year" : "month"}</span></div>
                          <div className="text-[12px] text-ink-soft">{p.minutes.toLocaleString("en-IN")} min/month · {p.employees} employee{p.employees === 1 ? "" : "s"} · {p.concurrency} calls at once</div>
                          {q.error ? <div className="text-[12px] text-ink-soft">{q.error}</div> : (
                            <>
                              <div className="text-[11.5px] text-ink-soft border-t border-line pt-2 flex flex-col gap-0.5">
                                {q.items.map((i: any, n: number) => <div key={n} className="flex justify-between gap-2"><span className="truncate">{i.onboarding ? "Onboarding (one-time)" : i.amount < 0 ? "Credit for unused days" : "Plan"}</span><span className="tabular-nums">{inr(i.amount, true)}</span></div>)}
                                {q.igst ? <div className="flex justify-between"><span>IGST 18%</span><span className="tabular-nums">{inr(q.igst, true)}</span></div> : null}
                                {q.cgst ? <div className="flex justify-between"><span>CGST 9% + SGST 9%</span><span className="tabular-nums">{inr(q.cgst + q.sgst, true)}</span></div> : null}
                                <div className="flex justify-between font-semibold text-ink"><span>You pay</span><span className="tabular-nums">{inr(q.total, true)}</span></div>
                              </div>
                              <button onClick={() => checkout(k)} disabled={!b.canPay || !!busy} data-testid={`buy-${k}`}
                                className={`mt-1 rounded-lg px-3 py-2 text-[12.5px] font-semibold disabled:opacity-40 ${current ? "border border-signal text-signal" : "bg-signal text-on-accent"}`}>
                                {busy === k ? "Opening payment…" : current ? (b.state.paidUntil ? "Renew early" : "Pay for this plan") : `Pay ${inr(q.total)}`}
                              </button>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {!b.canPay && <div className="text-[12px] text-ink-soft">Only the workspace owner or an admin can pay.</div>}
                  {msg && !details && <div className="text-[12.5px] text-miss" data-testid="billing-msg">{msg}</div>}
                </div>
              )}

              {b && (
                <div className="border border-line rounded-xl bg-raised overflow-x-auto" data-testid="invoices">
                  <div className="px-5 pt-4 pb-2 flex items-center justify-between">
                    <div className="text-[15px] font-semibold">Invoices</div>
                  </div>
                  {b.invoices.length === 0 ? <div className="px-5 pb-5 text-[13px] text-ink-soft">No invoices yet.</div> : (
                    <table className="w-full text-[13px] min-w-[620px]">
                      <thead><tr className="text-left text-[11px] uppercase tracking-wide text-ink-soft border-b border-line"><th className="px-5 py-2">Invoice</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">For</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2">Status</th><th className="px-5 py-2"></th></tr></thead>
                      <tbody>
                        {b.invoices.map((i: any) => (
                          <tr key={i.id} className="border-b border-line last:border-0">
                            <td className="px-5 py-2.5 font-semibold tabular-nums">{i.number}</td>
                            <td className="px-3 py-2.5">{fmt(i.created_at)}</td>
                            <td className="px-3 py-2.5 text-ink-soft">{i.kind === "overage" ? "Extra minutes" : i.plan ? `${i.plan[0].toUpperCase()}${i.plan.slice(1)} plan${i.interval === "annual" ? " · annual" : ""}` : (i.items?.[0]?.description || "").slice(0, 40)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{inr(i.total, true)}</td>
                            <td className="px-3 py-2.5"><span className={`text-[11.5px] font-semibold ${i.status === "paid" ? "text-signal" : i.status === "void" ? "text-ink-soft" : "text-hot"}`}>{STATUS[i.status] || i.status}{i.status === "issued" && i.due_date ? ` ${fmt(i.due_date)}` : ""}</span></td>
                            <td className="px-5 py-2.5 text-right whitespace-nowrap">
                              {i.status === "issued" && i.rzp_link_url && <a href={i.rzp_link_url} className="bg-signal text-on-accent rounded-lg px-3 py-1 text-[12px] font-semibold mr-2" data-testid="pay-invoice">Pay</a>}
                              <a href={`/billing/invoices/${i.id}`} target="_blank" className="border border-line rounded-lg px-3 py-1 text-[12px] font-semibold">View</a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {b && (
                <div className="border border-line rounded-xl bg-raised p-5 flex flex-col gap-2 text-[13px]" data-testid="billing-details">
                  <div className="flex items-center justify-between">
                    <div className="text-[15px] font-semibold">Billing details</div>
                    {b.canPay && <button onClick={() => { setMsg(""); setDetails({ ...b.profile }); }} className="border border-line rounded-lg px-3 py-1.5 text-[12px] font-semibold" data-testid="edit-details">{b.profile.name ? "Edit" : "Add"}</button>}
                  </div>
                  {b.profile.name ? (
                    <div className="text-ink-soft leading-relaxed">
                      <div className="text-ink font-semibold">{b.profile.name}</div>
                      {b.profile.gstin && <div>GSTIN {b.profile.gstin}</div>}
                      {b.profile.address && <div className="whitespace-pre-line">{b.profile.address}</div>}
                      <div>{[b.profile.state, b.profile.email, b.profile.phone].filter(Boolean).join(" · ")}</div>
                    </div>
                  ) : <div className="text-ink-soft">Add the business name, GSTIN (if you have one) and address to print on your invoices. With a GSTIN you can claim the GST back as input credit.</div>}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {details && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={() => setDetails(null)}>
          <div className="w-full max-w-[520px] bg-raised rounded-2xl border border-line p-6 flex flex-col gap-3" onClick={(e) => e.stopPropagation()} data-testid="details-form">
            <div className="text-[18px] font-display font-semibold">Billing details</div>
            <div className="text-[12.5px] text-ink-soft">Printed on your GST invoice. With a GSTIN, the state is taken from it.</div>
            <label className="text-[12px] font-semibold">Business name<input id="bd-name" value={details.name || ""} onChange={(e) => setDetails({ ...details, name: e.target.value })} className={field} placeholder="Sri Chaitanya Educational Society" /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-[12px] font-semibold">GSTIN (optional)<input id="bd-gstin" value={details.gstin || ""} onChange={(e) => setDetails({ ...details, gstin: e.target.value.toUpperCase() })} className={field} placeholder="36ABCDE1234F1Z5" maxLength={15} /></label>
              <label className="text-[12px] font-semibold">State<select id="bd-state" value={details.state || ""} onChange={(e) => setDetails({ ...details, state: e.target.value })} className={field}><option value="">Select</option>{b.states.map((s: string) => <option key={s} value={s}>{s}</option>)}</select></label>
            </div>
            <label className="text-[12px] font-semibold">Address<textarea id="bd-address" value={details.address || ""} onChange={(e) => setDetails({ ...details, address: e.target.value })} className={field} rows={2} /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-[12px] font-semibold">Invoice email<input id="bd-email" value={details.email || ""} onChange={(e) => setDetails({ ...details, email: e.target.value })} className={field} placeholder="accounts@company.com" /></label>
              <label className="text-[12px] font-semibold">Mobile<input id="bd-phone" value={details.phone || ""} onChange={(e) => setDetails({ ...details, phone: e.target.value })} className={field} placeholder="98765 43210" /></label>
            </div>
            {msg && <div className="text-[12.5px] text-miss" data-testid="details-error">{msg}</div>}
            <div className="flex justify-end gap-2 mt-1">
              <button onClick={() => { setDetails(null); setAfterSave(null); }} className="border border-line rounded-lg px-4 py-2 text-[13px] font-semibold">Cancel</button>
              <button onClick={saveDetails} disabled={busy === "details"} className="bg-signal text-on-accent rounded-lg px-4 py-2 text-[13px] font-semibold disabled:opacity-50" data-testid="save-details">{busy === "details" ? "Saving…" : afterSave ? "Save and continue to payment" : "Save"}</button>
            </div>
          </div>
        </div>
      )}

      {pending && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-[500px] bg-raised rounded-2xl border border-line p-6 flex flex-col gap-3" data-testid="offline-pay">
            <div className="text-[18px] font-display font-semibold">Invoice {pending.invoice.number}</div>
            <div className="text-[13px]">Amount due: <b>{inr(pending.invoice.total, true)}</b> by {fmt(pending.invoice.due_date)}.</div>
            {pending.linkError && <div className="text-[12.5px] text-hot">{pending.linkError}</div>}
            {(pending.offline?.upi || pending.offline?.bank) ? (
              <div className="bg-paper border border-line rounded-lg p-3 text-[12.5px] whitespace-pre-line">
                {pending.offline.upi && <div>UPI: <b className="select-all">{pending.offline.upi}</b></div>}
                {pending.offline.bank && <div className="mt-1">{pending.offline.bank}</div>}
                <div className="mt-2 text-ink-soft">Put <b>{pending.invoice.number}</b> in the payment note.</div>
              </div>
            ) : <div className="text-[12.5px] text-ink-soft">RANA will send you payment details for this invoice shortly. Questions: support@getrana.in.</div>}
            <div className="text-[12px] text-ink-soft">Your plan switches on as soon as RANA confirms the payment.</div>
            <div className="flex justify-end gap-2">
              <a href={`/billing/invoices/${pending.invoice.id}`} target="_blank" className="border border-line rounded-lg px-4 py-2 text-[13px] font-semibold">View invoice</a>
              <button onClick={() => setPending(null)} className="bg-signal text-on-accent rounded-lg px-4 py-2 text-[13px] font-semibold">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
