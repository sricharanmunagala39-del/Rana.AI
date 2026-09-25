"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import { inr } from "@/lib/money";

const field = "mt-1 w-full border border-line rounded-lg px-3 py-2 text-[13px] font-normal";
const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—");
const monthLabel = (m: string) => new Date(m + "-01T00:00:00").toLocaleDateString("en-IN", { month: "long", year: "numeric" });
const shift = (m: string, n: number) => { const [y, mo] = m.split("-").map(Number); const d = new Date(Date.UTC(y, mo - 1 + n, 1)); return d.toISOString().slice(0, 7); };

/** RANA HQ → Money: what came in, what went out, GST, profit per client, and whether Sarvam needs a top-up. */
export default function MoneyPage() {
  const [month, setMonth] = useState<string>("");
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  const [form, setForm] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const load = (m?: string) => {
    setErr("");
    fetch(`/api/hq/money${m ? `?month=${m}` : ""}`).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Couldn't load"); setD(j); setMonth(j.month); }).catch((e) => setErr(e.message));
  };
  useEffect(() => { load(); }, []);

  async function save() {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/hq/money", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const j = await r.json();
      if (!r.ok) { setErr(j.error || "Couldn't save"); return; }
      setForm(null); load(month);
    } finally { setBusy(false); }
  }
  async function remove(id: string) {
    if (!confirm("Remove this entry?")) return;
    await fetch("/api/hq/money", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deleteId: id }) });
    load(month);
  }

  const t = d?.totals, s = d?.sarvam, g = d?.gst;
  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar active="hq" />
      <div className="flex-1 p-10">
        <div className="max-w-[1120px] flex flex-col gap-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-signal"><Link href="/hq">RANA HQ</Link> · Money</div>
              <div className="text-[22px] font-display font-semibold">Money in, money out</div>
              <div className="text-[13px] text-ink-soft mt-0.5">What clients paid, what Razorpay and Sarvam cost, the GST you owe, and whether it's time to top up Sarvam.</div>
            </div>
            {month && (
              <div className="flex items-center gap-2 text-[13px] font-semibold" data-testid="month-picker">
                <button onClick={() => load(shift(month, -1))} className="border border-line rounded-lg px-3 py-1.5 bg-white">←</button>
                <span className="min-w-[130px] text-center">{monthLabel(month)}</span>
                <button onClick={() => load(shift(month, 1))} className="border border-line rounded-lg px-3 py-1.5 bg-white">→</button>
              </div>
            )}
          </div>
          {err && <div className="text-[13px] text-miss">{err}</div>}
          {!d && !err && <div className="text-[13px] text-ink-soft">Loading…</div>}

          {d && (
            <>
              {s?.lowWarning && (
                <div className="rounded-xl border border-hot/40 bg-hot/10 px-5 py-4 text-[13px]" data-testid="topup-warning">
                  <b>Top up Sarvam soon.</b> Estimated balance {inr(s.balance)}{s.daysLeft !== null ? ` — about ${s.daysLeft} day${s.daysLeft === 1 ? "" : "s"} of calling left` : ""}. Suggested top-up: <b>{inr(s.suggestTopUp)}</b> (+ GST) to cover the next 30 days.
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="money-tiles">
                {[
                  ["Clients paid you", inr(t.received, true), `${t.paidInvoices} payment${t.paidInvoices === 1 ? "" : "s"} incl. GST`],
                  ["Razorpay fees", inr(t.fees, true), t.feesEstimated ? "some estimated at 2% + GST" : "exact, from Razorpay"],
                  ["Sarvam cost (estimated)", inr(t.sarvamCost), `${Math.round(t.minutes).toLocaleString("en-IN")} min × ₹${d.costPerMin}`],
                  ["Your profit", inr(t.profit), "revenue excl. GST − fees − Sarvam"],
                ].map(([k, v, sub]) => (
                  <div key={k} className="border border-line rounded-xl bg-white px-4 py-3">
                    <div className="text-[11.5px] text-ink-soft">{k}</div>
                    <div className={`text-[21px] font-display font-semibold tabular-nums ${k === "Your profit" && t.profit < 0 ? "text-miss" : ""}`}>{v}</div>
                    <div className="text-[11px] text-ink-soft">{sub}</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-line rounded-xl bg-white p-5 flex flex-col gap-2 text-[13px]" data-testid="sarvam-card">
                  <div className="flex items-center justify-between">
                    <div className="text-[15px] font-semibold">Sarvam credits</div>
                    <div className="flex gap-2">
                      <button onClick={() => setForm({ kind: "topup", amount: "", gstIncluded: true, date: "", note: "" })} className="bg-signal text-white rounded-lg px-3 py-1.5 text-[12px] font-semibold" data-testid="add-topup">+ Top-up paid</button>
                      <button onClick={() => setForm({ kind: "balance", amount: "", date: "", note: "" })} className="border border-line rounded-lg px-3 py-1.5 text-[12px] font-semibold" data-testid="add-balance">Update balance</button>
                    </div>
                  </div>
                  {!s.tracked ? (
                    <div className="text-ink-soft">Open the Sarvam dashboard, read your credit balance, and press <b>Update balance</b>. From then on RANA estimates the balance from the minutes your clients use, and warns you before it runs out.</div>
                  ) : (
                    <>
                      <div className="flex items-baseline gap-2"><span className={`text-[26px] font-display font-semibold tabular-nums ${s.lowWarning ? "text-hot" : ""}`}>{inr(s.balance)}</span><span className="text-ink-soft">estimated balance</span></div>
                      <div className="text-ink-soft">
                        {s.lastReading ? `Last reading ${inr(s.lastReading.amount)} on ${fmt(s.lastReading.date)}; about ${inr(s.spentSinceReading)} used since. ` : ""}
                        Spending about {inr(s.perDay)}/day{s.daysLeft !== null ? ` · lasts ~${s.daysLeft} days` : ""}.
                      </div>
                      {s.ledger.length > 0 && (
                        <div className="border-t border-line pt-2 mt-1 flex flex-col gap-1 text-[12px]">
                          {s.ledger.slice(0, 6).map((e: any) => (
                            <div key={e.id} className="flex items-center gap-2">
                              <span className="w-16 text-ink-soft">{fmt(e.entry_date)}</span>
                              <span className="flex-1">{e.kind === "topup" ? `Top-up ${e.gst_included ? "(incl. GST)" : ""}` : "Balance reading"}{e.note ? ` · ${e.note}` : ""}</span>
                              <span className="tabular-nums font-semibold">{inr(e.amount)}</span>
                              <button onClick={() => remove(e.id)} className="text-ink-soft hover:text-miss">×</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  <div className="text-[11.5px] text-ink-soft">Estimate uses ₹{d.costPerMin} per connected minute (Sarvam + carrier). Change it with <code>RANA_COST_PER_MIN</code> once you see Sarvam's real bill.</div>
                </div>

                <div className="border border-line rounded-xl bg-white p-5 flex flex-col gap-1.5 text-[13px]" data-testid="gst-card">
                  <div className="text-[15px] font-semibold">GST for {monthLabel(month)}</div>
                  {!g.registered && <div className="text-[12px] text-hot">Not charging GST yet — add <code>RANA_GSTIN</code> in Vercel once your registration comes through.</div>}
                  <div className="flex justify-between"><span className="text-ink-soft">GST collected from clients</span><b className="tabular-nums">{inr(g.collected, true)}</b></div>
                  <div className="flex justify-between"><span className="text-ink-soft">− GST on Razorpay fees (input credit)</span><span className="tabular-nums">{inr(g.itcRazorpay, true)}</span></div>
                  <div className="flex justify-between"><span className="text-ink-soft">− GST on Sarvam top-ups (input credit)</span><span className="tabular-nums">{inr(g.itcSarvam, true)}</span></div>
                  <div className="flex justify-between border-t border-line pt-1.5 font-semibold"><span>GST to pay (by the 20th of next month)</span><span className="tabular-nums">{inr(g.netPayable, true)}</span></div>
                  {g.carryForward > 0 && <div className="text-[12px] text-ink-soft">{inr(g.carryForward, true)} input credit carries forward.</div>}
                  <div className="text-[11.5px] text-ink-soft mt-1">Estimate to hand to your CA with the invoice list; they file GSTR-1 and GSTR-3B. Input credit counts only when the supplier's invoice shows RANA's GSTIN.</div>
                </div>
              </div>

              <div className="border border-line rounded-xl bg-white overflow-x-auto" data-testid="client-money">
                <div className="px-5 pt-4 pb-2 text-[15px] font-semibold">Per client</div>
                <table className="w-full text-[13px] min-w-[900px]">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-ink-soft border-b border-line">
                      <th className="px-5 py-2">Client</th><th className="px-3 py-2">Plan</th><th className="px-3 py-2 text-right">Paid (excl. GST)</th><th className="px-3 py-2 text-right">Minutes</th><th className="px-3 py-2 text-right">Sarvam cost</th><th className="px-3 py-2 text-right">Fees</th><th className="px-3 py-2 text-right">Profit</th><th className="px-3 py-2 text-right">Margin at plan price</th><th className="px-5 py-2 text-right">Unpaid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.clients.map((c: any) => (
                      <tr key={c.id} className="border-b border-line last:border-0">
                        <td className="px-5 py-2.5 font-semibold">{c.name}{c.status === "suspended" && <span className="ml-2 text-[10.5px] text-miss">paused</span>}</td>
                        <td className="px-3 py-2.5 capitalize">{c.plan}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{c.revenue ? inr(c.revenue) : "—"}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{Math.round(c.minutes).toLocaleString("en-IN")}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{inr(c.sarvamCost)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{c.fees ? inr(c.fees) : "—"}</td>
                        <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${c.profit < 0 ? "text-miss" : "text-signal"}`}>{inr(c.profit)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-ink-soft">{c.marginAtPlan === null ? "—" : `${inr(c.marginAtPlan)} (${c.planPrice ? Math.round((c.marginAtPlan / c.planPrice) * 100) : 0}%)`}</td>
                        <td className="px-5 py-2.5 text-right tabular-nums">{c.outstanding ? inr(c.outstanding) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-5 py-3 text-[11.5px] text-ink-soft border-t border-line">"Margin at plan price" shows what a client would earn you at list price, for deals billed outside RANA (like pilots). Mark those payments as paid in HQ → Manage → Billing to count them here.</div>
              </div>

              <div className="border border-line rounded-xl bg-white overflow-x-auto" data-testid="payments">
                <div className="px-5 pt-4 pb-2 text-[15px] font-semibold">Payments received</div>
                {d.payments.length === 0 ? <div className="px-5 pb-5 text-[13px] text-ink-soft">No payments in {monthLabel(month)}.</div> : (
                  <table className="w-full text-[13px] min-w-[700px]">
                    <thead><tr className="text-left text-[11px] uppercase tracking-wide text-ink-soft border-b border-line"><th className="px-5 py-2">Date</th><th className="px-3 py-2">Invoice</th><th className="px-3 py-2">Client</th><th className="px-3 py-2">Via</th><th className="px-3 py-2 text-right">Paid</th><th className="px-3 py-2 text-right">Razorpay fee</th><th className="px-5 py-2 text-right">Reaches your bank</th></tr></thead>
                    <tbody>
                      {d.payments.map((p: any) => (
                        <tr key={p.id} className="border-b border-line last:border-0">
                          <td className="px-5 py-2.5">{fmt(p.paidAt)}</td>
                          <td className="px-3 py-2.5"><a href={`/billing/invoices/${p.id}`} target="_blank" className="font-semibold underline decoration-line">{p.number}</a></td>
                          <td className="px-3 py-2.5">{p.client}</td>
                          <td className="px-3 py-2.5 text-ink-soft">{p.via}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{inr(p.total, true)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{p.fee ? `${inr(p.fee, true)}${p.feeEstimated ? "*" : ""}` : "—"}</td>
                          <td className="px-5 py-2.5 text-right tabular-nums font-semibold">{inr(p.net, true)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div className="px-5 py-3 text-[11.5px] text-ink-soft border-t border-line">Razorpay deposits these into your bank about 2 working days after payment — see Razorpay → Settlements. * estimated fee.</div>
              </div>
            </>
          )}
        </div>
      </div>

      {form && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={() => setForm(null)}>
          <div className="w-full max-w-[440px] bg-white rounded-2xl border border-line p-6 flex flex-col gap-3" onClick={(e) => e.stopPropagation()} data-testid="ledger-form">
            <div className="text-[18px] font-display font-semibold">{form.kind === "topup" ? "Record a Sarvam top-up" : "Update Sarvam balance"}</div>
            <div className="text-[12.5px] text-ink-soft">{form.kind === "topup" ? "Enter what you paid Sarvam. RANA adds it to the estimated balance." : "Enter the credit balance shown on your Sarvam dashboard right now. RANA restarts its estimate from this number."}</div>
            <label className="text-[12px] font-semibold">Amount (₹)<input id="lg-amount" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={field} placeholder={form.kind === "topup" ? "29500" : "18250"} /></label>
            {form.kind === "topup" && <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={form.gstIncluded} onChange={(e) => setForm({ ...form, gstIncluded: e.target.checked })} /> Amount includes 18% GST</label>}
            <label className="text-[12px] font-semibold">Date (optional)<input id="lg-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={field} /></label>
            <label className="text-[12px] font-semibold">Note (optional)<input id="lg-note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={field} placeholder="Sarvam invoice no." /></label>
            <div className="flex justify-end gap-2 mt-1">
              <button onClick={() => setForm(null)} className="border border-line rounded-lg px-4 py-2 text-[13px] font-semibold">Cancel</button>
              <button onClick={save} disabled={busy} className="bg-signal text-white rounded-lg px-4 py-2 text-[13px] font-semibold disabled:opacity-50" data-testid="save-ledger">{busy ? "Saving…" : "Save"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
