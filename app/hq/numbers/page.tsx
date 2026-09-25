// @ts-nocheck
"use client";
// RANA HQ → Phone numbers: answer number requests, switch paid numbers on after attaching them in Sarvam, release.
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";

const inr = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
const ORDER = { requested: 0, failed: 1, provisioning: 2, lapsed: 3, awaiting_payment: 4, active: 5, released: 6 };
const LABEL = { requested: "Wants a number", failed: "Paid · auto-buy failed", provisioning: "Paid · switch on", lapsed: "Rent unpaid", awaiting_payment: "Waiting for payment", active: "Live", released: "Released" };

export default function HqNumbersPage() {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  const [form, setForm] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState("");
  const load = () => fetch("/api/hq/numbers").then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Couldn't load"); setD(j); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  async function act(id: string, action: string, extra: any = {}, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(id); setErr("");
    try {
      const r = await fetch("/api/hq/numbers", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action, ...extra }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || "Failed");
      await load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(""); }
  }
  const f = (id: string) => form[id] || {};
  const setF = (id: string, k: string, v: any) => setForm((s) => ({ ...s, [id]: { ...(s[id] || {}), [k]: v } }));
  const rows = (d?.numbers || []).slice().sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9));
  const input = "border border-line rounded-lg px-2.5 py-1.5 text-[12.5px] bg-paper outline-none focus:border-signal";

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar active="hq" />
      <div className="flex-1 min-w-0 px-6 py-8 lg:px-10">
        <div className="max-w-[1000px] flex flex-col gap-5">
          <div>
            <div className="text-[20px] font-display font-semibold">Phone numbers</div>
            <div className="text-[13px] text-ink-soft mt-0.5">
              Client business numbers. Requests: find a number (Sarvam → Deploy → Phone numbers → Rent, or Vobiz) and offer it — the client gets an invoice.
              Paid: attach the number to the RANA voice app in Vobiz, add it under Deploy → Phone numbers in Sarvam, then Mark live.
            </div>
          </div>
          {err && <div className="text-[12.5px] text-miss bg-miss-tint rounded-lg px-3 py-2">{err}</div>}
          {!d ? <div className="text-[13px] text-ink-soft">Loading…</div> : !rows.length ? <div className="text-[13px] text-ink-soft border border-line rounded-xl p-6 text-center">No number requests yet.</div> : (
            <div className="border border-line rounded-xl bg-raised overflow-hidden">
              {rows.map((n) => (
                <div key={n.id} className="px-4 py-3 border-b border-line last:border-b-0 flex flex-col gap-2" data-testid={`hq-num-${n.status}`}>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex-1 min-w-[240px]">
                      <div className="text-[14px] font-semibold">{n.clientName} · <span className="font-mono">{n.pretty || "—"}</span></div>
                      <div className="text-[12px] text-ink-soft">
                        {[n.city || n.request?.city, n.request?.style === "fancy" ? "wants a fancy number" : n.request?.style === "digits" ? `wants ending ${n.request.digits}` : n.request?.style === "series140" ? "wants a 140-series number" : null,
                          n.request?.note, n.number ? `${inr(n.monthly_price)}/mo${Number(n.fancy_fee) ? ` + ${inr(n.fancy_fee)} once` : ""}` : null,
                          n.request?.business ? `${n.request.business.legalName} · ${n.request.business.gstin || n.request.business.pan}` : null].filter(Boolean).join(" · ")}
                      </div>
                      {n.last_error && <div className="text-[11.5px] text-miss mt-0.5">{n.last_error}</div>}
                    </div>
                    <span className="text-[11px] font-semibold rounded-full px-2.5 py-1 bg-sunken">{LABEL[n.status] || n.status}</span>
                  </div>
                  {n.status === "requested" && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <input className={`${input} font-mono w-[170px]`} placeholder="Number e.g. 04071234567" value={f(n.id).number || ""} onChange={(e) => setF(n.id, "number", e.target.value)} />
                      <input className={`${input} w-[130px]`} placeholder={`Monthly (${inr(d.pricing.monthly)})`} value={f(n.id).monthlyPrice || ""} onChange={(e) => setF(n.id, "monthlyPrice", e.target.value)} />
                      <input className={`${input} w-[150px]`} placeholder="Fancy fee (auto)" value={f(n.id).fancyFee ?? ""} onChange={(e) => setF(n.id, "fancyFee", e.target.value)} />
                      <button disabled={busy === n.id || !f(n.id).number} onClick={() => act(n.id, "offer", f(n.id))} className="bg-signal text-on-accent rounded-lg px-3 py-1.5 text-[12px] font-semibold disabled:opacity-40">Offer & send invoice</button>
                      <button disabled={busy === n.id} onClick={() => act(n.id, "release", {}, "Close this request?")} className="text-[12px] text-ink-soft px-2">Close</button>
                    </div>
                  )}
                  {["provisioning", "failed", "lapsed"].includes(n.status) && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <input className={`${input} w-[260px] font-mono`} placeholder="Sarvam connection id (blank = default)" value={f(n.id).connectionId || ""} onChange={(e) => setF(n.id, "connectionId", e.target.value)} />
                      <button disabled={busy === n.id} onClick={() => act(n.id, "live", f(n.id))} className="bg-signal text-on-accent rounded-lg px-3 py-1.5 text-[12px] font-semibold disabled:opacity-40">Mark live</button>
                      <button disabled={busy === n.id} onClick={() => act(n.id, "release", {}, `Release ${n.pretty}?`)} className="text-[12px] text-miss px-2">Release</button>
                    </div>
                  )}
                  {n.status === "active" && <div><button disabled={busy === n.id} onClick={() => act(n.id, "release", {}, `Release ${n.pretty}? The client falls back to the shared number.`)} className="text-[12px] text-miss">Release</button></div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
