"use client";
import { useState } from "react";
import { inr } from "@/lib/money";

const field = "mt-1 w-full border border-line rounded-lg px-3 py-2 text-[13px] font-normal";

/** Prepaid calling balance on the client's Billing page: balance, minutes left, recharge packs, auto-recharge, history. */
export default function WalletCard({ w, canPay, onOffline, onNeedDetails, onChanged }: { w: any; canPay: boolean; onOffline: (j: any) => void; onNeedDetails: () => void; onChanged: () => void }) {
  const [amount, setAmount] = useState<string>("");
  const [busy, setBusy] = useState<string>("");
  const [msg, setMsg] = useState("");
  const [auto, setAuto] = useState<{ below: string; amount: string } | null>(null);
  const [showLog, setShowLog] = useState(false);

  async function recharge(a: number) {
    setMsg(""); setBusy(String(a));
    try {
      const r = await fetch("/api/billing/recharge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: a }) });
      const j = await r.json();
      if (!r.ok) { if (j.code === "billing_details") onNeedDetails(); else setMsg(j.error || "Couldn't start the recharge."); return; }
      if (j.payUrl) { window.location.href = j.payUrl; return; }
      onOffline(j); onChanged();
    } finally { setBusy(""); }
  }
  async function saveAuto(off = false) {
    setMsg(""); setBusy("auto");
    try {
      const r = await fetch("/api/billing/auto-recharge", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(off ? { off: true } : { below: Number(auto?.below), amount: Number(auto?.amount) }) });
      const j = await r.json();
      if (!r.ok) { setMsg(j.error || "Couldn't save."); return; }
      setAuto(null); onChanged();
    } finally { setBusy(""); }
  }

  const tone = w.empty ? "text-miss" : w.low ? "text-hot" : "";
  return (
    <div id="recharge" className="border border-line rounded-xl bg-raised p-5 flex flex-col gap-4" data-testid="wallet-card">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[15px] font-semibold">Prepaid calling balance</div>
          <div className="text-[12px] text-ink-soft">Your plan minutes are used first each month. After that, calls are paid from this balance at {inr(w.rate)}/min. It never expires.</div>
        </div>
        <div className="text-right ml-auto">
          <div className={`text-[28px] font-display font-semibold tabular-nums ${tone}`} data-testid="wallet-balance">{inr(w.balance)}</div>
          <div className="text-[12px] text-ink-soft">≈ {w.walletMinutesLeft.toLocaleString("en-IN")} extra min · {w.planMinutesLeft.toLocaleString("en-IN")} plan min left</div>
        </div>
      </div>
      {(w.low || w.empty) && (
        <div className={`rounded-lg px-4 py-3 text-[13px] ${w.empty ? "bg-miss-tint text-miss" : "bg-hot/10"}`} data-testid="wallet-warning">
          {w.empty ? <><b>Calling is paused.</b> Your plan minutes and balance are used up — recharge to start again.</> : <><b>Balance is low.</b> Recharge so your campaigns don't stop.</>}
        </div>
      )}
      {canPay && (
        <div className="flex flex-wrap items-end gap-2">
          {w.packs.map((p: number) => (
            <button key={p} onClick={() => recharge(p)} disabled={!!busy} data-testid={`pack-${p}`} className="border border-line rounded-lg px-4 py-2 text-left hover:border-signal disabled:opacity-50">
              <div className="text-[14px] font-semibold tabular-nums">{busy === String(p) ? "Opening…" : inr(p)}</div>
              <div className="text-[11px] text-ink-soft">≈ {Math.floor(p / (w.rate || 8)).toLocaleString("en-IN")} min + GST</div>
            </button>
          ))}
          <div className="flex items-end gap-2">
            <label className="text-[11.5px] font-semibold">Other amount<input id="wallet-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))} className={field + " w-[120px]"} placeholder={`min ${w.min}`} /></label>
            <button onClick={() => recharge(Number(amount))} disabled={!!busy || !amount} className="bg-signal text-on-accent rounded-lg px-4 py-2 text-[13px] font-semibold disabled:opacity-50" data-testid="recharge-custom">Recharge</button>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between gap-3 flex-wrap border-t border-line pt-3 text-[12.5px]">
        <div data-testid="auto-state">
          <b>Auto-recharge:</b>{" "}
          {w.autoRecharge ? <>when the balance drops below {inr(w.autoRecharge.below)}, we send a {inr(w.autoRecharge.amount)} recharge link to pay in one tap.</> : "off"}
        </div>
        {canPay && (
          <div className="flex gap-2">
            <button onClick={() => setAuto({ below: String(w.autoRecharge?.below || 2000), amount: String(w.autoRecharge?.amount || 10000) })} className="border border-line rounded-lg px-3 py-1.5 font-semibold" data-testid="auto-edit">{w.autoRecharge ? "Change" : "Turn on"}</button>
            {w.autoRecharge && <button onClick={() => saveAuto(true)} className="border border-line rounded-lg px-3 py-1.5 font-semibold">Turn off</button>}
            <button onClick={() => setShowLog(!showLog)} className="text-signal font-semibold px-2">{showLog ? "Hide history" : "History"}</button>
          </div>
        )}
      </div>
      {auto && (
        <div className="flex flex-wrap items-end gap-3 bg-paper rounded-lg p-3" data-testid="auto-form">
          <label className="text-[11.5px] font-semibold">When balance is below (₹)<input id="auto-below" value={auto.below} onChange={(e) => setAuto({ ...auto, below: e.target.value.replace(/[^\d]/g, "") })} className={field + " w-[140px]"} /></label>
          <label className="text-[11.5px] font-semibold">Recharge (₹)<input id="auto-amount" value={auto.amount} onChange={(e) => setAuto({ ...auto, amount: e.target.value.replace(/[^\d]/g, "") })} className={field + " w-[140px]"} /></label>
          <button onClick={() => saveAuto()} disabled={busy === "auto"} className="bg-ink text-paper rounded-lg px-4 py-2 text-[13px] font-semibold" data-testid="auto-save">Save</button>
          <button onClick={() => setAuto(null)} className="text-[13px] font-semibold px-2">Cancel</button>
        </div>
      )}
      {showLog && (
        <div className="text-[12.5px] flex flex-col gap-1" data-testid="wallet-log">
          {w.ledger.length === 0 ? <div className="text-ink-soft">No recharges yet.</div> : w.ledger.map((e: any) => (
            <div key={e.id} className="flex justify-between gap-3 border-b border-line last:border-0 py-1">
              <span className="text-ink-soft w-[90px]">{new Date(e.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
              <span className="flex-1">{e.note || e.kind}</span>
              <span className={`tabular-nums font-semibold ${e.kind === "debit" ? "text-miss" : "text-signal"}`}>{e.kind === "debit" ? "−" : "+"}{inr(Math.abs(Number(e.amount)))}</span>
            </div>
          ))}
          {w.liveOverage > 0 && <div className="flex justify-between py-1 text-ink-soft"><span>This month so far (extra minutes)</span><span className="tabular-nums">−{inr(w.liveOverage)}</span></div>}
        </div>
      )}
      {msg && <div className="text-[12.5px] text-miss">{msg}</div>}
    </div>
  );
}
