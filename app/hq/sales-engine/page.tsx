"use client";
// RANA HQ → Sales Engine: configure one outbound campaign and launch the whole pipeline with one button.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";

const INDUSTRIES: [string, string][] = [["real_estate", "Real estate & developers"], ["education", "Education & coaching"], ["healthcare", "Healthcare"], ["recruitment", "Recruitment & HR"], ["hospitality", "Hotels & hospitality"], ["other", "Other"]];
const COUNTRIES: [string, string, string][] = [["IN", "India", "Asia/Kolkata"], ["US", "United States", "America/New_York"], ["AU", "Australia", "Australia/Sydney"]];
const LANGS: [string, string][] = [["en", "English"], ["hi", "Hindi"], ["te", "Telugu"], ["te-en", "Telugu-English"]];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const STATUS_LABEL: Record<string, [string, string]> = {
  new: ["New", "text-ink-soft"], research_completed: ["Researched", "text-ink-soft"], contact_verified: ["Contact verified", "text-ink"], ready: ["Call-ready", "text-signal"],
  calling: ["Calling…", "text-signal"], no_answer: ["No answer", "text-warm"], receptionist: ["Reception answered", "text-warm"], decision_maker_reached: ["Decision-maker reached", "text-signal"],
  interested: ["Interested", "text-signal"], not_interested: ["Not interested", "text-ink-soft"], callback_requested: ["Callback requested", "text-hot"],
  demo_booked: ["Demo booked", "text-signal"], booking_pending: ["Booking pending", "text-hot"], needs_other_approach: ["Needs another approach", "text-warm"],
  disqualified: ["Disqualified", "text-ink-soft"], opted_out: ["Opted out", "text-miss"], blocked: ["Blocked (compliance)", "text-miss"], awaiting_outcome: ["Awaiting call result", "text-hot"],
};
const TILES: [string, string][] = [
  ["companiesDiscovered", "Companies discovered"], ["decisionMakers", "Decision-makers identified"], ["contactsVerified", "Contacts verified"], ["qualified", "Prospects qualified"],
  ["callReady", "Call-ready"], ["callsAttempted", "Calls attempted"], ["callsConnected", "Calls connected"], ["decisionMakersReached", "Decision-makers reached"],
  ["interested", "Interested"], ["demosBooked", "Demos booked"], ["followUpsScheduled", "Follow-ups scheduled"], ["errors", "Errors & blocked"],
];

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const mins = (s: string) => { const [h, m] = s.split(":").map(Number); return (h || 0) * 60 + (m || 0); };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—");

/** "business,website,phone,email,city,contact,role,consent" CSV (header optional) → rows. */
function parseList(text: string) {
  const rows = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const out: string[] = []; let cur = "", q = false;
    for (const ch of l) { if (ch === '"') q = !q; else if (ch === "," && !q) { out.push(cur.trim()); cur = ""; } else cur += ch; }
    out.push(cur.trim()); return out;
  });
  if (rows[0] && /business|company|name/i.test(rows[0][0] || "")) rows.shift();
  return rows.map(([business, website, phone, email, city, contactName, contactRole, consent]) => ({ business, website, phone, email, city, contactName, contactRole, consent })).filter((r) => r.business);
}

export default function SalesEnginePage() {
  const [data, setData] = useState<any>(null);
  const [cfg, setCfg] = useState<any>(null);
  const [listText, setListText] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [presetName, setPresetName] = useState("");
  const ticking = useRef(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/hq/sales-engine"); const j = await r.json();
    if (!r.ok) { setErr(j.error || "Couldn't load"); return; }
    setData(j);
    setCfg((c: any) => c || { ...j.defaults, name: "" });
  }, []);
  const loadDetail = useCallback(async (id: string) => {
    const r = await fetch(`/api/hq/sales-engine/${id}`); const j = await r.json();
    if (r.ok) setDetail(j); else setErr(j.error);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (sel) loadDetail(sel); }, [sel, loadDetail]);

  // While a running campaign is open, keep it moving (one request at a time) and refresh the numbers.
  useEffect(() => {
    if (!sel || detail?.campaign?.status !== "running") return;
    let stop = false;
    const loop = async () => {
      if (stop || ticking.current) return;
      ticking.current = true;
      try { await fetch(`/api/hq/sales-engine/${sel}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "tick" }) }); await loadDetail(sel); }
      finally { ticking.current = false; }
    };
    const t = setInterval(loop, 4000); loop();
    return () => { stop = true; clearInterval(t); };
  }, [sel, detail?.campaign?.status, loadDetail]);

  const set = (k: string, v: any) => setCfg((c: any) => ({ ...c, [k]: v }));
  const setDemo = (k: string, v: any) => setCfg((c: any) => ({ ...c, demo: { ...c.demo, [k]: v } }));
  const config = () => ({ ...cfg, uploadedList: cfg.sources.includes("list") ? parseList(listText) : [] });

  async function launchIt() {
    setErr(""); setBusy(true);
    try {
      const r = await fetch("/api/hq/sales-engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "launch", config: config() }) });
      const j = await r.json();
      if (!r.ok) { setErr(j.error); if (j.duplicateOf) setSel(j.duplicateOf); return; }
      await load(); setSel(j.campaign.id);
    } finally { setBusy(false); }
  }
  async function act(action: string) {
    if (!sel) return;
    if (action === "cancel" && !confirm("Cancel this campaign? Nobody else will be called.")) return;
    const r = await fetch(`/api/hq/sales-engine/${sel}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const j = await r.json(); if (!r.ok) setErr(j.error);
    await Promise.all([loadDetail(sel), load()]);
  }
  async function savePreset() {
    const r = await fetch("/api/hq/sales-engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "preset", name: presetName || cfg.name, config: config() }) });
    const j = await r.json(); if (!r.ok) setErr(j.error); else { setPresetName(""); load(); }
  }

  const caps = data?.capabilities;
  const inp = "w-full border border-line rounded-lg px-2.5 py-1.5 text-[13px] bg-sunken";
  const lbl = "text-[11.5px] font-semibold text-ink-soft";

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar active="hq-sales-engine" />
      <div className="flex-1 p-6 md:p-10 min-w-0">
        <div className="w-full max-w-[1600px] flex flex-col gap-5">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-signal"><Link href="/hq">RANA HQ</Link> · Sales Engine</div>
            <div className="text-[22px] font-display font-semibold">Find, qualify, call and book — in one click</div>
            <div className="text-[13px] text-ink-soft mt-0.5">Researches companies from free public sources, finds decision-makers, scores them with written reasons, checks do-not-call lists, prepares an honest call plan, calls, books demos into a real free slot and updates the Sales CRM.</div>
          </div>
          {err && <div className="text-[13px] text-miss" role="alert">{err}</div>}
          {data?.setupNeeded && (
            <div className="border border-hot/50 bg-hot-tint rounded-xl p-4 text-[13px]">
              <b>One-time setup needed.</b> The Sales Engine's tables don't exist yet. Apply <code>supabase/migrations/20261017_sales_engine.sql</code> to the Supabase project, then reload.
            </div>
          )}
          {caps && (
            <div className={`rounded-xl border p-3 text-[12.5px] flex flex-col gap-1 ${caps.liveCalling ? "border-miss/60 bg-miss-tint" : "border-signal/40 bg-signal-tint"}`}>
              <div className="font-semibold">{caps.liveCalling ? "LIVE calling is available on this deployment — live campaigns place real calls." : "SIMULATION MODE — no real calls are placed and nothing is charged."}</div>
              {caps.liveNotes.map((n: string) => <div key={n} className="text-ink-soft">• {n}</div>)}
              <div className="text-ink-soft">• {caps.ai} • {caps.calendar}</div>
            </div>
          )}

          {cfg && (
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-5">
              <div className="border border-line rounded-xl bg-raised p-5 flex flex-col gap-4">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex-1 min-w-[220px]"><div className={lbl}>Campaign name</div><input className={inp} value={cfg.name} onChange={(e) => set("name", e.target.value)} placeholder="Hyderabad developers — Oct" /></div>
                  {!!data?.presets?.length && (
                    <div><div className={lbl}>Load preset</div>
                      <select className={inp} defaultValue="" onChange={(e) => { const p = data.presets.find((x: any) => x.id === e.target.value); if (p) setCfg({ ...data.defaults, ...p.config, name: p.config.name || p.name }); }}>
                        <option value="">Choose…</option>{data.presets.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select></div>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div><div className={lbl}>Country</div><select className={inp} value={cfg.country} onChange={(e) => { const c = COUNTRIES.find((x) => x[0] === e.target.value)!; setCfg((x: any) => ({ ...x, country: c[0], timezone: c[2], demo: { ...x.demo } })); }}>{COUNTRIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
                  <div><div className={lbl}>City / region</div><input className={inp} value={cfg.region} onChange={(e) => set("region", e.target.value)} /></div>
                  <div><div className={lbl}>Industry</div><select className={inp} value={cfg.industry} onChange={(e) => set("industry", e.target.value)}>{INDUSTRIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
                  <div><div className={lbl}>Sub-industry</div><input className={inp} value={cfg.subIndustry} onChange={(e) => set("subIndustry", e.target.value)} placeholder="Villa & plot developers" /></div>
                  <div><div className={lbl}>Company size</div><select className={inp} value={cfg.companySize} onChange={(e) => set("companySize", e.target.value)}><option value="any">Any</option><option value="small">Small</option><option value="mid">Mid-size</option><option value="large">Large / multi-branch</option></select></div>
                  <div><div className={lbl}>Prospects to research</div><input type="number" min={1} max={200} className={inp} value={cfg.prospectCount} onChange={(e) => set("prospectCount", +e.target.value)} /></div>
                  <div><div className={lbl}>Call language</div><select className={inp} value={cfg.language} onChange={(e) => set("language", e.target.value)}>{LANGS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
                  <div><div className={lbl}>Min. lead score</div><input type="number" min={0} max={100} className={inp} value={cfg.minScore} onChange={(e) => set("minScore", +e.target.value)} /></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div><div className={lbl}>Company types (comma-separated)</div><input className={inp} value={cfg.companyTypes.join(", ")} onChange={(e) => set("companyTypes", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} placeholder="Builders, brokers" /></div>
                  <div><div className={lbl}>Decision-maker roles</div><input className={inp} value={cfg.roles.join(", ")} onChange={(e) => set("roles", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} /></div>
                  <div><div className={lbl}>Business problem to address</div><textarea rows={2} className={inp} value={cfg.problem} onChange={(e) => set("problem", e.target.value)} /></div>
                  <div><div className={lbl}>What RANA AI does for them (use case)</div><textarea rows={2} className={inp} value={cfg.useCase} onChange={(e) => set("useCase", e.target.value)} /></div>
                  <div><div className={lbl}>Qualification questions (one per line)</div><textarea rows={2} className={inp} value={cfg.qualification.join("\n")} onChange={(e) => set("qualification", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))} placeholder="How many enquiry calls a day?" /></div>
                  <div className="grid grid-cols-3 gap-2">
                    <div><div className={lbl}>Call from</div><input type="time" className={inp} value={hhmm(cfg.callingStart)} onChange={(e) => set("callingStart", mins(e.target.value))} /></div>
                    <div><div className={lbl}>Call until</div><input type="time" className={inp} value={hhmm(cfg.callingEnd)} onChange={(e) => set("callingEnd", mins(e.target.value))} /></div>
                    <div><div className={lbl}>Max attempts</div><input type="number" min={1} max={5} className={inp} value={cfg.maxAttempts} onChange={(e) => set("maxAttempts", +e.target.value)} /></div>
                    <div className="col-span-3 text-[11px] text-ink-soft">Times are in {cfg.timezone}. The legal window always applies on top (India 9am–9pm; US 8am–9pm; Australia weekdays 9–8, Sat 9–5).</div>
                  </div>
                </div>
                <div className="border-t border-line pt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <div className={lbl}>Demo days &amp; hours ({cfg.demo.timezone})</div>
                    <div className="flex flex-wrap gap-1.5 my-1">{DAYS.map((d, i) => (
                      <button key={d} type="button" onClick={() => setDemo("days", cfg.demo.days.includes(i) ? cfg.demo.days.filter((x: number) => x !== i) : [...cfg.demo.days, i].sort())}
                        className={`px-2 py-0.5 rounded-md text-[12px] border ${cfg.demo.days.includes(i) ? "border-signal text-signal bg-signal-tint" : "border-line text-ink-soft"}`}>{d}</button>))}</div>
                    <div className="grid grid-cols-4 gap-2">
                      <input type="time" className={inp} value={hhmm(cfg.demo.start)} onChange={(e) => setDemo("start", mins(e.target.value))} aria-label="Demos from" />
                      <input type="time" className={inp} value={hhmm(cfg.demo.end)} onChange={(e) => setDemo("end", mins(e.target.value))} aria-label="Demos until" />
                      <select className={inp} value={cfg.demo.slotMinutes} onChange={(e) => setDemo("slotMinutes", +e.target.value)} aria-label="Slot length">{[15, 20, 30, 45, 60].map((m) => <option key={m} value={m}>{m} min</option>)}</select>
                      <select className={inp} value={cfg.demo.bufferHours} onChange={(e) => setDemo("bufferHours", +e.target.value)} aria-label="Earliest demo">{[2, 4, 20, 24, 48].map((h) => <option key={h} value={h}>≥ {h}h ahead</option>)}</select>
                    </div>
                  </div>
                  <div>
                    <div className={lbl}>Lead sources</div>
                    <div className="flex flex-wrap gap-3 my-1 text-[12.5px]">
                      {[["osm", "OpenStreetMap"], ["list", "My list"], ["crm", "Uncalled CRM leads"]].map(([k, l]) => (
                        <label key={k} className="flex items-center gap-1.5"><input type="checkbox" checked={cfg.sources.includes(k)} onChange={(e) => set("sources", e.target.checked ? [...cfg.sources, k] : cfg.sources.filter((x: string) => x !== k))} />{l}</label>))}
                    </div>
                    {cfg.sources.includes("list") && (
                      <textarea rows={4} className={`${inp} font-mono text-[11.5px]`} value={listText} onChange={(e) => setListText(e.target.value)}
                        placeholder={"business,website,phone,email,city,contact,role,consent\nSkyline Homes,skylinehomes.in,,,Hyderabad,,,"} />
                    )}
                    {cfg.sources.includes("list") && <div className="text-[11px] text-ink-soft">{parseList(listText).length} companies. “consent” = yes only if the person agreed to be called (needed for US/Australia live calls).</div>}
                    {cfg.sources.includes("osm") && <div className="text-[11px] text-ink-soft mt-1">Company data © OpenStreetMap contributors (ODbL). Coverage of Indian businesses is thin — add your own list for best results.</div>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
                  <select className={`${inp} w-auto`} value={cfg.mode} onChange={(e) => set("mode", e.target.value)} aria-label="Mode">
                    <option value="simulation">Simulation (no real calls)</option>
                    <option value="live" disabled={!caps?.liveCalling}>Live calls{caps?.liveCalling ? "" : " — not available"}</option>
                  </select>
                  <input className={`${inp} w-auto`} value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="Preset name" />
                  <button onClick={savePreset} className="text-[12.5px] font-semibold text-signal hover:underline" disabled={data?.setupNeeded}>Save as preset</button>
                </div>
                <button onClick={launchIt} disabled={busy || data?.setupNeeded}
                  className="w-full rounded-xl bg-signal text-on-accent font-display font-bold tracking-wide text-[17px] py-4 shadow-glow disabled:opacity-50" data-testid="se-launch">
                  {busy ? "Launching…" : "GENERATE & LAUNCH OUTBOUND CAMPAIGN"}
                </button>
                <div className="text-[11.5px] text-ink-soft -mt-2 text-center">{cfg.mode === "live" ? "LIVE: real calls will be placed to prospects who pass every compliance check." : "Simulation: the full pipeline runs with simulated calls, clearly labelled. No phone is dialled."}</div>
              </div>

              <div className="border border-line rounded-xl bg-raised p-4 flex flex-col gap-2 h-fit">
                <div className="text-[15px] font-semibold">Campaigns</div>
                {!data?.campaigns?.length && <div className="text-[13px] text-ink-soft">None yet.</div>}
                {(data?.campaigns || []).map((c: any) => (
                  <button key={c.id} onClick={() => setSel(c.id)} className={`text-left border rounded-lg p-2.5 ${sel === c.id ? "border-signal bg-signal-tint" : "border-line hover:bg-sunken"}`}>
                    <div className="flex items-center gap-2 text-[13px] font-semibold">
                      <span className={`text-[10px] font-mono px-1.5 rounded ${c.mode === "live" ? "bg-miss text-white" : "bg-sunken text-ink-soft"}`}>{c.mode === "live" ? "LIVE" : "SIM"}</span>
                      <span className="truncate">{c.name}</span><span className="ml-auto text-[11px] text-ink-soft">{c.status}</span>
                    </div>
                    {c.counters && <div className="text-[11.5px] text-ink-soft mt-0.5">{c.counters.companiesDiscovered} found · {c.counters.callsAttempted} calls · {c.counters.demosBooked} demos</div>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {detail && (
            <div className="border border-line rounded-xl bg-raised p-5 flex flex-col gap-4" data-testid="se-detail">
              <div className="flex flex-wrap items-center gap-3">
                <div className="text-[17px] font-display font-semibold">{detail.campaign.name}</div>
                <span className={`text-[11px] font-mono px-2 py-0.5 rounded-full ${detail.campaign.mode === "live" ? "bg-miss text-white" : "bg-signal-tint text-signal"}`}>{detail.campaign.mode === "live" ? "LIVE CALLS" : "SIMULATED CALLS"}</span>
                <span className="text-[12.5px] text-ink-soft">{detail.campaign.status} · phase: {detail.campaign.phase}{detail.campaign.nextRunAt && detail.campaign.status === "running" ? ` · next step ${when(detail.campaign.nextRunAt)}` : ""}</span>
                <div className="ml-auto flex gap-2 text-[12.5px]">
                  {detail.campaign.status === "running" && <button onClick={() => act("pause")} className="border border-line rounded-lg px-3 py-1">Pause</button>}
                  {detail.campaign.status === "paused" && <button onClick={() => act("resume")} className="border border-signal text-signal rounded-lg px-3 py-1">Resume</button>}
                  {!["cancelled"].includes(detail.campaign.status) && <button onClick={() => act("retry")} className="border border-line rounded-lg px-3 py-1">Retry failed steps</button>}
                  {["running", "paused"].includes(detail.campaign.status) && <button onClick={() => act("cancel")} className="border border-miss/60 text-miss rounded-lg px-3 py-1">Cancel</button>}
                </div>
              </div>
              <div className="text-[11.5px] text-ink-soft">Calling window: {detail.window}</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                {TILES.map(([k, l]) => {
                  const v = k === "errors" ? detail.counters.errors + detail.counters.blocked : detail.counters[k];
                  return <div key={k} className="rounded-lg bg-sunken px-3 py-2"><div className="text-[20px] font-display font-semibold">{v}</div><div className="text-[11px] text-ink-soft">{l}</div></div>;
                })}
              </div>
              <div className="text-[11.5px] text-ink-soft">Also: {detail.counters.bookingsPending} bookings to confirm · {detail.counters.needsOtherApproach} need another approach · {detail.counters.optedOut} opted out · {detail.counters.disqualified} disqualified · {detail.counters.simulatedCalls} simulated / {detail.counters.liveCalls} live calls</div>

              <div className="overflow-x-auto border border-line rounded-xl">
                <table className="w-full text-[12.5px]">
                  <thead className="text-left text-ink-soft"><tr className="border-b border-line">
                    <th className="p-2">Company</th><th className="p-2">Score</th><th className="p-2">Decision-maker</th><th className="p-2">Contact</th><th className="p-2">Status</th><th className="p-2">Next</th>
                  </tr></thead>
                  <tbody>
                    {detail.prospects.map((p: any) => {
                      const dm = p.contacts.find((c: any) => c.decisionMaker) || p.contacts[0];
                      const [sl, sc] = STATUS_LABEL[p.status] || [p.status, ""];
                      return [
                        <tr key={p.id} className="border-b border-line/60 cursor-pointer hover:bg-sunken" onClick={() => setOpen(open === p.id ? null : p.id)}>
                          <td className="p-2"><div className="font-semibold">{p.company.name}</div><div className="text-[11px] text-ink-soft">{p.company.city}{p.company.website ? ` · ${p.company.domain || p.company.website}` : ""}</div></td>
                          <td className="p-2 font-mono">{p.score ?? "—"}</td>
                          <td className="p-2">{dm ? <>{dm.name}<div className="text-[11px] text-ink-soft">{dm.role}{dm.verified ? " · on their site" : " · from your list"}</div></> : <span className="text-ink-soft">—</span>}</td>
                          <td className="p-2"><div>{p.company.phone || dm?.phone || "—"}</div><div className="text-[11px] text-ink-soft">{(dm?.phone && dm.phoneType) || p.company.phoneType}</div></td>
                          <td className={`p-2 font-semibold ${sc}`}>{sl}<div className="text-[11px] font-normal text-ink-soft max-w-[320px]">{p.statusReason}</div></td>
                          <td className="p-2 text-[11.5px] text-ink-soft">{p.booking ? `Demo ${when(p.booking.slotStart)}` : when(p.nextActionAt)}</td>
                        </tr>,
                        open === p.id && (
                          <tr key={p.id + "-d"} className="border-b border-line/60 bg-sunken/50"><td colSpan={6} className="p-3">
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-[12px]">
                              <div>
                                <div className="font-semibold mb-1">Why this score</div>
                                {p.scoreReasons.map((r: any, i: number) => (
                                  <div key={i} className="mb-0.5"><span className="font-mono">{r.points > 0 ? "+" : ""}{r.points}</span> {r.kind === "hypothesis" && <span className="text-warm">[guess] </span>}{r.reason}{r.url && /^https?:/.test(r.url) && <> · <a className="text-signal" href={r.url} target="_blank" rel="noreferrer">source</a></>}</div>
                                ))}
                                <div className="font-semibold mt-2 mb-1">Evidence</div>
                                {p.evidence.slice(0, 12).map((e: any, i: number) => <div key={i} className="truncate">{e.field}: {e.value} {e.verified ? "✓" : "(unverified)"} {/^https?:/.test(e.url) && <a className="text-signal" href={e.url} target="_blank" rel="noreferrer">↗</a>}</div>)}
                              </div>
                              <div>
                                <div className="font-semibold mb-1">Call plan ({p.outreach?.language || "—"})</div>
                                {p.outreach ? <>
                                  <div className="mb-1">{p.outreach.opening} {p.outreach.permission}</div>
                                  <div className="mb-1">{p.outreach.problem} {p.outreach.howWeHelp}</div>
                                  <div className="mb-1">{p.outreach.questions.map((q: string) => <div key={q}>• {q}</div>)}</div>
                                  <div className="mb-1">{p.outreach.demoInvite}</div>
                                  <div className="text-ink-soft">Front desk: {p.outreach.receptionist}</div>
                                </> : <div className="text-ink-soft">Not prepared (not qualified).</div>}
                              </div>
                              <div>
                                <div className="font-semibold mb-1">Last call {p.lastCall ? (p.lastCall.simulated ? <span className="text-signal">[SIMULATED]</span> : <span className="text-miss">[REAL]</span>) : ""}</div>
                                {p.lastCall?.transcript?.length ? p.lastCall.transcript.map((l: any, i: number) => <div key={i} className="mb-0.5"><b>{l.who === "agent" ? "Rana" : "Them"}:</b> {l.text}</div>) : <div className="text-ink-soft">{p.lastCall ? `${p.lastCall.outcome}` : "Not called yet."}</div>}
                                {p.crmDealId && <div className="mt-2"><Link className="text-signal" href="/hq/crm">Open in Sales CRM →</Link></div>}
                              </div>
                            </div>
                          </td></tr>
                        ),
                      ];
                    })}
                  </tbody>
                </table>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-[12px]">
                <div><div className="font-semibold mb-1">Run log</div>{[...detail.campaign.log].reverse().slice(0, 30).map((l: any, i: number) => <div key={i} className={l.level === "error" ? "text-miss" : l.level === "warn" ? "text-warm" : "text-ink-soft"}>{when(l.at)} — {l.msg}</div>)}</div>
                <div><div className="font-semibold mb-1">Recent activity</div>{detail.events.slice(0, 30).map((e: any) => <div key={e.id} className={e.kind === "error" || e.kind === "booking_failed" ? "text-miss" : "text-ink-soft"}>{when(e.at)} — {e.kind === "call" ? `${e.data.simulated ? "Simulated" : "Real"} call: ${e.data.reached} → ${e.data.outcome}${e.data.wouldBeBlockedLive ? " (a live call would be blocked: compliance)" : ""}` : e.kind === "booking" ? `Demo booked ${e.data.label}` : e.kind === "booking_failed" ? `Booking failed: ${e.data.message}` : `${e.data?.step || e.kind}: ${e.data?.message || ""}`}</div>)}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
