"use client";
import { useEffect, useState } from "react";
import { inr } from "@/lib/money";

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");
const field = "mt-1 w-full border border-line rounded-lg px-2.5 py-1.5 text-[12.5px] font-normal";

/** Billing inside the HQ client drawer: invoices, issue a plan or custom invoice, mark paid (bank/UPI), cancel. */
export default function HqBilling({ clientId, onChanged }: { clientId: string; onChanged?: () => void }) {
  const [d, setD] = useState<any>(null);
  const [mode, setMode] = useState<"" | "plan" | "custom">("");
  const [plan, setPlan] = useState({ plan: "growth", interval: "monthly", waiveOnboarding: false });
  const [lines, setLines] = useState([{ description: "", qty: "1", rate: "" }]);
  const [notes, setNotes] = useState("");
  const [paying, setPaying] = useState<any>(null);
  const [pay, setPay] = useState({ via: "bank transfer", ref: "" });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => fetch(`/api/hq/clients/${clientId}/invoices`).then((r) => r.json()).then(setD).catch(() => {});
  useEffect(() => { load(); }, [clientId]);

  async function issue() {
    setBusy(true); setMsg("");
    try {
      const body = mode === "plan" ? { mode, ...plan } : { mode, notes, items: lines.map((l) => ({ description: l.description, qty: Number(l.qty) || 1, rate: Number(l.rate) || 0 })) };
      const r = await fetch(`/api/hq/clients/${clientId}/invoices`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) { setMsg(j.error || "Couldn't issue the invoice."); return; }
      setMsg(`Issued ${j.invoice.number} for ${inr(j.invoice.total, true)}.${j.invoice.rzp_link_url ? " Razorpay has sent the payment link to the client." : ""}${j.linkError ? ` Payment link failed: ${j.linkError}` : ""}`);
      setMode(""); setLines([{ description: "", qty: "1", rate: "" }]); setNotes("");
      load();
    } finally { setBusy(false); }
  }

  async function act(inv: any, body: any) {
    setBusy(true); setMsg("");
    try {
      const r = await fetch(`/api/hq/invoices/${inv.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) { setMsg(j.error || "Couldn't update the invoice."); return; }
      setMsg(body.action === "void" ? `${inv.number} cancelled.` : `${inv.number} marked paid.${inv.plan ? " Plan switched on." : ""}`);
      setPaying(null); load(); onChanged?.();
    } finally { setBusy(false); }
  }

  if (!d) return <div className="text-[12px] text-ink-soft">Loading billing…</div>;
  const st = d.state || {};
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-4" data-testid="hq-billing">
      <div className="flex items-center justify-between">
        <div className="text-[14px] font-semibold">Billing</div>
        <div className="text-[11px] text-ink-soft">{d.razorpay?.enabled ? `Razorpay ${d.razorpay.mode}` : "Razorpay not connected"} · {d.gstRegistered ? "GST on" : "no GSTIN"}</div>
      </div>
      <div className="text-[12px] text-ink-soft">
        {st.paidUntil ? `Paid until ${fmt(st.paidUntil)} (${st.interval || "monthly"}) · renews automatically` : "Not auto-billed — invoices only when you issue them."}
        {st.openCount ? ` · ${st.openCount} unpaid (${inr(st.openTotal, true)})` : ""}
        {st.overdue ? " · OVERDUE" : ""}
        {!d.hasBillingDetails && " · client hasn't added billing details (company name is used)"}
      </div>

      {d.invoices?.length > 0 && (
        <div className="flex flex-col gap-1.5" data-testid="hq-invoices">
          {d.invoices.slice(0, 12).map((i: any) => (
            <div key={i.id} className="border border-line rounded-lg px-3 py-2 text-[12px] flex items-center gap-2 flex-wrap">
              <a href={`/billing/invoices/${i.id}`} target="_blank" className="font-semibold underline decoration-line">{i.number}</a>
              <span className="text-ink-soft">{i.kind}{i.plan ? ` · ${i.plan}` : ""}</span>
              <span className="tabular-nums ml-auto">{inr(i.total, true)}</span>
              <span className={`font-semibold ${i.status === "paid" ? "text-signal" : i.status === "void" ? "text-ink-soft" : "text-hot"}`}>{i.status === "issued" ? `due ${fmt(i.due_date)}` : i.status}</span>
              {i.status === "issued" && (
                <span className="w-full flex gap-2 mt-1">
                  {i.rzp_link_url && <button onClick={() => navigator.clipboard?.writeText(i.rzp_link_url)} className="border border-line rounded px-2 py-0.5 text-[11.5px]">Copy pay link</button>}
                  <button onClick={() => { setPaying(i); setPay({ via: "bank transfer", ref: "" }); }} className="border border-signal/40 text-signal rounded px-2 py-0.5 text-[11.5px] font-semibold" data-testid="hq-mark-paid">Mark paid</button>
                  <button onClick={() => { if (confirm(`Cancel ${i.number}?`)) act(i, { action: "void" }); }} className="border border-line rounded px-2 py-0.5 text-[11.5px]" data-testid="hq-void">Cancel</button>
                </span>
              )}
              {paying?.id === i.id && (
                <span className="w-full grid grid-cols-[1fr_1fr_auto] gap-2 mt-1 items-end">
                  <label className="text-[11px] font-semibold">Received by<select id="hq-pay-via" value={pay.via} onChange={(e) => setPay({ ...pay, via: e.target.value })} className={field}>{["bank transfer", "upi", "cheque", "cash", "razorpay", "other"].map((v) => <option key={v}>{v}</option>)}</select></label>
                  <label className="text-[11px] font-semibold">UTR / reference<input id="hq-pay-ref" value={pay.ref} onChange={(e) => setPay({ ...pay, ref: e.target.value })} className={field} /></label>
                  <button disabled={busy} onClick={() => act(i, { action: "mark_paid", ...pay })} className="bg-signal text-white rounded-lg px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50" data-testid="hq-confirm-paid">Confirm</button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {!mode ? (
        <div className="flex gap-2">
          <button onClick={() => setMode("plan")} className="border border-line rounded-lg px-3 py-1.5 text-[12px] font-semibold" data-testid="hq-inv-plan">Invoice a plan</button>
          <button onClick={() => setMode("custom")} className="border border-line rounded-lg px-3 py-1.5 text-[12px] font-semibold" data-testid="hq-inv-custom">Custom invoice</button>
        </div>
      ) : (
        <div className="border border-line rounded-lg p-3 flex flex-col gap-2 bg-paper/50">
          {mode === "plan" ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px] font-semibold">Plan<select id="hq-inv-plan-key" value={plan.plan} onChange={(e) => setPlan({ ...plan, plan: e.target.value })} className={field}><option value="starter">Starter</option><option value="growth">Growth</option><option value="scale">Scale</option></select></label>
                <label className="text-[11px] font-semibold">Billing<select id="hq-inv-interval" value={plan.interval} onChange={(e) => setPlan({ ...plan, interval: e.target.value })} className={field}><option value="monthly">Monthly</option><option value="annual">Annual (pay 10)</option></select></label>
              </div>
              <label className="flex items-center gap-2 text-[12px]"><input type="checkbox" checked={plan.waiveOnboarding} onChange={(e) => setPlan({ ...plan, waiveOnboarding: e.target.checked })} /> Waive onboarding fee</label>
              <div className="text-[11px] text-ink-soft">When paid, the plan switches on and renews automatically every {plan.interval === "annual" ? "year" : "month"}.</div>
            </>
          ) : (
            <>
              {lines.map((l, n) => (
                <div key={n} className="grid grid-cols-[1fr_52px_90px] gap-2">
                  <input id={`hq-line-desc-${n}`} value={l.description} onChange={(e) => setLines(lines.map((x, k) => (k === n ? { ...x, description: e.target.value } : x)))} placeholder="e.g. Pilot — 2,000 minutes, Oct 2026" className={field} />
                  <input id={`hq-line-qty-${n}`} value={l.qty} onChange={(e) => setLines(lines.map((x, k) => (k === n ? { ...x, qty: e.target.value } : x)))} placeholder="Qty" className={field} />
                  <input id={`hq-line-rate-${n}`} value={l.rate} onChange={(e) => setLines(lines.map((x, k) => (k === n ? { ...x, rate: e.target.value } : x)))} placeholder="₹ each" className={field} />
                </div>
              ))}
              <button onClick={() => setLines([...lines, { description: "", qty: "1", rate: "" }])} className="self-start text-[11.5px] text-signal font-semibold">+ Add line</button>
              <input id="hq-inv-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Note on the invoice (optional)" className={field} />
              <div className="text-[11px] text-ink-soft">Amounts before GST. Due in 7 days.</div>
            </>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={() => setMode("")} className="border border-line rounded-lg px-3 py-1.5 text-[12px] font-semibold">Back</button>
            <button onClick={issue} disabled={busy} className="bg-ink text-white rounded-lg px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50" data-testid="hq-issue">{busy ? "Issuing…" : "Issue invoice"}</button>
          </div>
        </div>
      )}
      {msg && <div className="text-[12px] text-ink-soft" data-testid="hq-billing-msg">{msg}</div>}
    </div>
  );
}
