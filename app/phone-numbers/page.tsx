// @ts-nocheck
"use client";
// Phone Numbers: the number your AI employees call from, your own business numbers, and Get a number
// (pick from the live list, or ask RANA for one — including fancy numbers like …7777 or ending in 786).

import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";

const inr = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
const TIER = {
  platinum: { label: "Platinum", cls: "bg-violet-tint text-violet border-violet/30" },
  gold: { label: "Gold", cls: "bg-warm-tint text-warm border-warm/30" },
  standard: { label: "Standard", cls: "bg-sunken text-ink-soft border-line" },
};
const STATUS = {
  requested: ["RANA is finding your number", "bg-sunken text-ink-soft"],
  awaiting_payment: ["Pay to reserve", "bg-warm-tint text-warm"],
  provisioning: ["Setting up · usually within a working day", "bg-signal-tint text-signal"],
  failed: ["Setting up · RANA is on it", "bg-warm-tint text-warm"],
  active: ["Live", "bg-signal-tint text-signal"],
  lapsed: ["Rent unpaid", "bg-miss-tint text-miss"],
  released: ["Released", "bg-sunken text-ink-soft"],
};

export default function PhoneNumbersPage() {
  const [sarvam, setSarvam] = useState<any>(null);
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  const [city, setCity] = useState("hyderabad");
  const [fancyOnly, setFancyOnly] = useState(false);
  const [cat, setCat] = useState<any>({ loading: false, numbers: [], error: "" });
  const [pick, setPick] = useState<any>(null); // { kind: "buy", n } | { kind: "request" }
  const [req, setReq] = useState({ style: "any", digits: "", note: "" });
  const [biz, setBiz] = useState({ legalName: "", gstin: "", pan: "", signatory: "" });
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function load() {
    try {
      const [s, d] = await Promise.all([
        fetch("/api/sarvam/status").then((r) => r.json()).catch(() => null),
        fetch("/api/numbers").then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Couldn't load numbers."); return j; }),
      ]);
      setSarvam(s?.sarvam || null); setData(d); setErr("");
      setBiz((b) => ({ ...b, legalName: b.legalName || d.business?.legalName || "", gstin: b.gstin || d.business?.gstin || "" }));
    } catch (e: any) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!data?.catalogLive || data?.blocked) return;
    setCat((c) => ({ ...c, loading: true, error: "" }));
    fetch(`/api/numbers/catalog?${new URLSearchParams({ city, fancy: fancyOnly ? "1" : "0" })}`)
      .then((r) => r.json()).then((d) => setCat({ loading: false, numbers: d.numbers || [], error: d.error || "" }))
      .catch(() => setCat({ loading: false, numbers: [], error: "Couldn't load numbers right now." }));
  }, [data?.catalogLive, data?.blocked, city, fancyOnly]);

  const cityName = useMemo(() => data?.cities?.find((c) => c.key === city)?.name || city, [data, city]);
  const mine = (data?.numbers || []).filter((n) => n.status !== "released");
  const released = (data?.numbers || []).filter((n) => n.status === "released");

  async function act(id: string, action: string, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;
    setMsg(null);
    const r = await fetch(`/api/numbers/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) setMsg({ ok: false, text: j.error || "That didn't work." }); else load();
  }

  async function submit() {
    setBusy(true); setMsg(null);
    try {
      const body = pick.kind === "buy"
        ? { action: "buy", number: pick.n.number, city, business: biz, consent: agree }
        : { action: "request", city: cityName, ...req, business: biz, consent: agree };
      const r = await fetch("/api/numbers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "That didn't work.");
      if (j.payUrl) { window.location.href = j.payUrl; return; }
      setPick(null); setAgree(false);
      setMsg({ ok: true, text: pick.kind === "buy" ? "Reserved. Pay the invoice on Plan & usage to switch it on." : "Request sent. RANA will find your number and send you a link to reserve it — usually within a working day." });
      load();
    } catch (e: any) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(false); }
  }

  const bizOk = biz.legalName.trim().length >= 2 && (/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(biz.gstin.trim().toUpperCase()) || /^[A-Z]{5}\d{4}[A-Z]$/.test(biz.pan.trim().toUpperCase()));
  const input = "border border-line rounded-lg px-3 py-2 text-[13px] bg-paper outline-none focus:border-signal";

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar active="phone-numbers" />
      <div className="flex-1 min-w-0 px-6 py-8 lg:px-10">
        <div className="max-w-[900px] flex flex-col gap-6">
          <div>
            <div className="text-[20px] font-display font-semibold">Phone Numbers</div>
            <div className="text-[13px] text-ink-soft mt-0.5">The number your AI employees call from and answer — and your own business numbers.</div>
          </div>

          <div className="border border-signal/30 rounded-xl bg-raised p-5 flex items-center gap-4" data-testid="sarvam-number">
            <div className="w-10 h-10 rounded-full bg-signal-tint text-signal flex items-center justify-center font-bold">☎</div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-semibold">{sarvam?.number || "Your Indian number"} <span className="text-[11px] font-semibold text-signal bg-signal-tint rounded-full px-2 py-0.5 ml-1">{sarvam?.ownNumber ? "Your number" : "RANA shared number"}</span></div>
              <div className="text-[12px] text-ink-soft mt-0.5 leading-relaxed">
                {sarvam?.ready && sarvam?.calling
                  ? (sarvam?.ownNumber ? "Your AI employees call from and answer on this number." : "Your AI employees call from RANA's shared number until you get your own below.")
                  : sarvam ? "Calling isn't fully connected yet — RANA support has been notified." : "Checking…"}
              </div>
            </div>
            <span className={`text-[11.5px] font-semibold rounded-full px-2.5 py-1 ${sarvam?.ready && sarvam?.calling ? "bg-signal-tint text-signal" : "bg-paper text-ink-soft"}`}>{sarvam?.ready && sarvam?.calling ? "Ready" : "—"}</span>
          </div>

          {err && <div className="text-[12.5px] text-miss bg-miss-tint border border-miss/20 rounded-lg px-3 py-2.5">{err}</div>}
          {msg && <div className={`text-[12.5px] rounded-lg px-3 py-2.5 border ${msg.ok ? "text-signal bg-signal-tint border-signal/20" : "text-miss bg-miss-tint border-miss/20"}`}>{msg.text}</div>}

          {mine.length > 0 && (
            <div className="border border-line rounded-xl bg-raised overflow-hidden" data-testid="my-numbers">
              <div className="px-4 py-3 border-b border-line text-[13px] font-semibold">Your numbers</div>
              {mine.map((n) => (
                <div key={n.id} className="px-4 py-3 border-b border-line last:border-b-0 flex items-center gap-3 flex-wrap">
                  <div className="flex-1 min-w-[220px]">
                    <div className="text-[14.5px] font-semibold font-mono tracking-tight">
                      {n.pretty || (n.request?.style === "series140" ? "140-series number" : `A number in ${n.city || n.request?.city || "your city"}`)}
                      {n.tier && n.tier !== "standard" && <span className={`ml-2 text-[10.5px] font-sans font-semibold border rounded-full px-1.5 py-0.5 ${TIER[n.tier].cls}`}>{TIER[n.tier].label}</span>}
                      {n.isDefault && <span className="ml-2 text-[10.5px] font-sans font-semibold text-signal">✓ used for calls</span>}
                    </div>
                    <div className="text-[12px] text-ink-soft mt-0.5">
                      {[n.city, n.pattern, n.number ? `${inr(n.monthlyPrice)}/month${n.fancyFee ? ` + ${inr(n.fancyFee)} one-time` : ""} (+GST)` : n.request?.style === "fancy" ? "Fancy number" : n.request?.digits ? `Ending in ${n.request.digits}` : null, n.paidUntil && n.status === "active" ? `paid until ${new Date(n.paidUntil).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : null].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <span className={`text-[11px] font-semibold rounded-full px-2.5 py-1 ${STATUS[n.status]?.[1] || ""}`}>{STATUS[n.status]?.[0] || n.status}</span>
                  {n.payUrl && <a href={n.payUrl} className="bg-signal text-on-accent rounded-lg px-3 py-1.5 text-[12px] font-semibold">Pay {n.invoiceTotal ? inr(n.invoiceTotal) : ""}</a>}
                  {n.status === "active" && !n.isDefault && <button onClick={() => act(n.id, "default")} className="text-[12px] font-semibold text-signal border border-signal/30 rounded-lg px-3 py-1.5">Use for calls</button>}
                  {["requested", "awaiting_payment"].includes(n.status) && <button onClick={() => act(n.id, "cancel", "Cancel this number?")} className="text-[12px] font-semibold text-ink-soft border border-line rounded-lg px-3 py-1.5">Cancel</button>}
                  {["active", "lapsed"].includes(n.status) && <button onClick={() => act(n.id, "release", `Release ${n.pretty}? Your employees stop using it and it goes back to the provider. This can't be undone.`)} className="text-[12px] font-semibold text-miss border border-miss/20 rounded-lg px-3 py-1.5">Release</button>}
                </div>
              ))}
            </div>
          )}

          <div className="border border-line rounded-xl bg-raised p-5 flex flex-col gap-4" data-testid="get-number">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="text-[15px] font-semibold">Get a business number</div>
                <div className="text-[12.5px] text-ink-soft mt-0.5">A local city number in your business name — your callers see it, and your AI employees answer and call from it.</div>
              </div>
              {data && <div className="text-[12px] text-ink-soft text-right">From <b className="text-ink">{inr(data.pricing.monthlyFrom)}/month</b> (+GST)<br />Fancy numbers: one-time {inr(data.pricing.goldFee)} (Gold) · {inr(data.pricing.platinumFee)} (Platinum)</div>}
            </div>

            {data?.blocked ? (
              <div className="text-[13px] bg-sunken border border-line rounded-lg px-4 py-3">{data.blocked} <a href="/billing" className="font-semibold text-signal">See plans →</a></div>
            ) : data && (<>
              <div className="flex flex-wrap gap-1.5" data-testid="cities">
                {data.cities.map((c) => (
                  <button key={c.key} type="button" onClick={() => setCity(c.key)} aria-pressed={city === c.key}
                    className={`text-[12.5px] font-semibold px-3 py-1.5 rounded-full border ${city === c.key ? "bg-ink text-paper border-ink" : "border-line text-ink-soft hover:text-ink"}`}>
                    {c.name} <span className="opacity-60 font-mono">{c.code}</span>
                  </button>
                ))}
              </div>

              {data.catalogLive ? (<>
                <label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" checked={fancyOnly} onChange={(e) => setFancyOnly(e.target.checked)} className="accent-signal" /> Show fancy numbers only</label>
                {cat.loading ? <div className="text-[12.5px] text-ink-soft">Loading numbers in {cityName}…</div>
                  : cat.error ? <div className="text-[12.5px] text-miss">{cat.error}</div>
                  : !cat.numbers.length ? <div className="text-[12.5px] text-ink-soft">No {fancyOnly ? "fancy " : ""}numbers free in {cityName} right now. <button className="text-signal font-semibold" onClick={() => setPick({ kind: "request" })}>Ask RANA to find one →</button></div>
                  : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5" data-testid="catalog">
                      {cat.numbers.map((n) => (
                        <button key={n.number} type="button" onClick={() => { setPick({ kind: "buy", n }); setMsg(null); }}
                          className={`text-left border rounded-xl px-3.5 py-3 bg-paper hover:border-signal/60 ${pick?.n?.number === n.number ? "border-signal ring-1 ring-signal" : "border-line"}`}>
                          <div className="font-mono text-[15px] font-semibold tracking-tight">{n.pretty}</div>
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <span className={`text-[10.5px] font-semibold border rounded-full px-1.5 py-0.5 ${TIER[n.tier].cls}`}>{TIER[n.tier].label}</span>
                            {n.pattern && <span className="text-[11px] text-ink-soft truncate">{n.pattern}</span>}
                          </div>
                          <div className="text-[12px] mt-1.5"><b>{inr(n.monthly)}</b>/mo{n.fancyFee ? <span className="text-ink-soft"> + {inr(n.fancyFee)} once</span> : null}</div>
                        </button>
                      ))}
                    </div>
                  )}
                <button type="button" className="self-start text-[12.5px] font-semibold text-signal" onClick={() => { setPick({ kind: "request" }); setMsg(null); }}>Want a specific ending (like 786 or 1234)? Ask RANA →</button>
              </>) : (
                <div className="flex flex-col gap-3" data-testid="request-form">
                  <div className="text-[12.5px] text-ink-soft">Tell us what you'd like in <b className="text-ink">{cityName}</b> — RANA finds it and sends you a link to reserve it, usually within a working day.</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      ["any", "Any good number", `A clean local ${cityName} number · ${inr(data.pricing.monthlyFrom)}/month`],
                      ["fancy", "A fancy number", "Easy to remember — repeating digits, sequences, …000 · one-time fee"],
                      ["digits", "Ending in digits I choose", "e.g. …786, …1234 or your year · one-time fee"],
                      ["series140", "140-series (cold campaigns)", "For promotional calls to people who never enquired — needs company documents"],
                    ].map(([k, t, d]) => (
                      <label key={k} className={`flex items-start gap-2.5 border rounded-xl px-3.5 py-3 cursor-pointer ${req.style === k ? "border-signal bg-signal-tint/40" : "border-line bg-paper"}`}>
                        <input type="radio" name="style" checked={req.style === k} onChange={() => setReq({ ...req, style: k })} className="mt-1 accent-signal" data-testid={`style-${k}`} />
                        <span><span className="text-[13px] font-semibold block">{t}</span><span className="text-[11.5px] text-ink-soft">{d}</span></span>
                      </label>
                    ))}
                  </div>
                  {req.style === "digits" && <input className={`${input} max-w-[260px] font-mono`} placeholder="Ending in, e.g. 786" value={req.digits} onChange={(e) => setReq({ ...req, digits: e.target.value.replace(/\D/g, "").slice(0, 6) })} data-testid="digits" />}
                  <input className={input} placeholder="Anything else? (optional)" value={req.note} onChange={(e) => setReq({ ...req, note: e.target.value })} />
                  <button type="button" onClick={() => { setPick({ kind: "request" }); setMsg(null); }} className="self-start bg-ink text-paper rounded-lg px-4 py-2 text-[12.5px] font-semibold" data-testid="request-continue">Continue</button>
                </div>
              )}

              {pick && (
                <div className="border border-signal/40 rounded-xl bg-paper p-4 flex flex-col gap-3" data-testid="checkout">
                  <div className="text-[14px] font-semibold">
                    {pick.kind === "buy" ? <>Reserve <span className="font-mono">{pick.n.pretty}</span> · {inr(pick.n.monthly)}/month{pick.n.fancyFee ? ` + ${inr(pick.n.fancyFee)} one-time` : ""} <span className="text-ink-soft font-normal">(+GST)</span></> : "Your business details"}
                  </div>
                  <div className="text-[12px] text-ink-soft">Indian telecom rules register every business number to a verified business, so we need these once.</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input className={input} placeholder="Legal business name" value={biz.legalName} onChange={(e) => setBiz({ ...biz, legalName: e.target.value })} data-testid="biz-name" />
                    <input className={`${input} font-mono uppercase`} placeholder="GSTIN" value={biz.gstin} onChange={(e) => setBiz({ ...biz, gstin: e.target.value.toUpperCase() })} data-testid="biz-gstin" />
                    <input className={`${input} font-mono uppercase`} placeholder="PAN (if no GST)" value={biz.pan} onChange={(e) => setBiz({ ...biz, pan: e.target.value.toUpperCase() })} />
                    <input className={input} placeholder="Authorised person's name" value={biz.signatory} onChange={(e) => setBiz({ ...biz, signatory: e.target.value })} />
                  </div>
                  <label className="flex items-start gap-2 text-[12.5px] cursor-pointer">
                    <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 accent-signal" data-testid="agree" />
                    <span>I'll use this number to answer calls and to call people who enquired with us or are our customers — not for cold promotional calls (TRAI requires a 140-series number for those).</span>
                  </label>
                  <div className="flex gap-2">
                    <button type="button" onClick={submit} disabled={busy || !agree || !bizOk} className="bg-signal text-on-accent rounded-lg px-4 py-2 text-[12.5px] font-semibold disabled:opacity-40" data-testid="checkout-submit">
                      {busy ? "Working…" : pick.kind === "buy" ? "Continue to payment" : "Send request"}
                    </button>
                    <button type="button" onClick={() => setPick(null)} className="text-[12.5px] text-ink-soft px-3">Cancel</button>
                  </div>
                  {!bizOk && (biz.gstin || biz.pan) && <div className="text-[11.5px] text-miss">Check the GSTIN (15 characters) or PAN (10 characters).</div>}
                </div>
              )}
            </>)}
          </div>

          <div className="text-[12px] text-ink-soft leading-relaxed border border-line rounded-xl px-4 py-3">
            <b className="text-ink">How numbers work.</b> Your own number is billed monthly with GST and can be released any time. Use it for incoming calls and for calling people who enquired or are your customers.
            Promotional calls to people who never enquired need a 140-series number and DLT registration — choose "140-series" above and RANA will guide you.
            {released.length > 0 && <> Released: {released.map((n) => n.pretty).filter(Boolean).join(", ")}.</>}
          </div>
        </div>
      </div>
    </div>
  );
}
