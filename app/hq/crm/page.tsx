"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import { PLANS, SALES_DISCOUNT_STEPS, YEARLY_MONTHS_PAID } from "@/lib/pricing";
import { parseText, readXlsx, findHeaderRow } from "@/lib/leadImport";
import { INDUSTRIES, LEAD_FIELDS, guessLeadColumns, rowsToLeads, type LeadField } from "@/lib/crm";

/** RANA HQ → Sales CRM. Five stages: New → Contacted → Prospect → Deal (+ Not interested). */
const inr = (n: number) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;
const field = "mt-1 w-full border border-line rounded-lg px-3 py-2 text-[13px] font-normal bg-paper";
const btn = "border border-line rounded-lg px-3 py-2 text-[13px] font-semibold bg-raised hover:border-signal/60";
const primary = "bg-signal text-on-accent rounded-lg px-4 py-2 text-[13px] font-semibold disabled:opacity-50";
const STAGE_TONE: Record<string, string> = {
  new: "border-hot/50 text-hot", contacted: "border-violet/50 text-violet", prospect: "border-signal/50 text-signal",
  deal: "border-signal bg-signal/15 text-signal", not_interested: "border-line text-ink-soft",
};
const NEXT: Record<string, string> = { new: "contacted", contacted: "prospect", prospect: "deal" };
const KINDS: [string, string][] = [["note", "📝 Note"], ["call", "📞 Call"], ["whatsapp", "💬 WhatsApp"], ["meeting", "🤝 Meeting"], ["email", "✉️ Email"]];
const PLAN_KEYS = ["starter", "growth", "scale", "enterprise"];
const day = (d: string | null) => (d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "");
const ago = (d: string) => { const s = (Date.now() - Date.parse(d)) / 1000; return s < 3600 ? `${Math.max(1, Math.round(s / 60))}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`; };
const localInput = (d: string | null) => { if (!d) return ""; const t = new Date(d); t.setMinutes(t.getMinutes() - t.getTimezoneOffset()); return t.toISOString().slice(0, 16); };
const inDays = (n: number, h = 11) => { const t = new Date(); t.setDate(t.getDate() + n); t.setHours(h, 0, 0, 0); return localInput(t.toISOString()); };
const FOLLOW_TONE: Record<string, string> = { overdue: "text-miss font-semibold", today: "text-hot font-semibold", later: "text-ink-soft", none: "text-ink-soft" };
const listOf = (plan: string | null) => (plan && plan !== "enterprise" ? (PLANS as any)[plan]?.pricePerMonth || 0 : 0);
const wa = (p: string | null) => (p ? `https://wa.me/${p.replace(/[^\d]/g, "")}` : "");
const indLabel = (k: string) => INDUSTRIES.find((i) => i.key === k)?.label || "Other";
const TEMPLATE = "Business name,Contact person,Phone,Email,City,Industry,Notes\nSri Sai Clinic,Dr. Ravi,9876543210,ravi@example.com,Hyderabad,Healthcare,Met at expo\n";

export default function HqCrmPage() {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [view, setView] = useState<"board" | "list">("board");
  const [q, setQ] = useState("");
  const [owner, setOwner] = useState("all");
  const [industry, setIndustry] = useState("all");
  const [focus, setFocus] = useState<"" | "overdue" | "today" | "delayed">("");
  const [showDead, setShowDead] = useState(false);
  const [adding, setAdding] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [moving, setMoving] = useState<any>(null); // { deal, to }
  const [open, setOpen] = useState<any>(null); // { deal, activities }
  const [busy, setBusy] = useState(false);

  const load = () => fetch("/api/hq/crm", { cache: "no-store" }).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setD(j); if (j.synced) setMsg(`${j.synced} new lead${j.synced === 1 ? "" : "s"} pulled from the Google Sheet.`); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); try { const v = localStorage.getItem("crm-view"); if (v === "list" || v === "board") setView(v); const o = localStorage.getItem("crm-owner"); if (o) setOwner(o); } catch {} }, []);
  useEffect(() => { try { localStorage.setItem("crm-view", view); localStorage.setItem("crm-owner", owner); } catch {} }, [view, owner]);

  const staffName = (e: string | null) => { if (!e) return "Nobody"; const s = d?.staff?.find((x: any) => x.email === e); return s?.name || e.split("@")[0]; };
  // Filters except industry (so the chips show how many each industry has).
  const base = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (d?.deals || []).filter((x: any) =>
      (owner === "all" || (owner === "mine" ? x.owner === d.me : owner === "none" ? !x.owner : x.owner === owner)) &&
      (!focus || (focus === "delayed" ? x.delayed : x.follow === focus)) &&
      (!t || [x.business, x.contact_name, x.phone, x.email, x.city, indLabel(x.industry), x.notes].some((v) => String(v || "").toLowerCase().includes(t))));
  }, [d, q, owner, focus]);
  const deals = useMemo(() => base.filter((x: any) => industry === "all" || x.industry === industry), [base, industry]);
  const indCounts = useMemo(() => { const c: Record<string, number> = {}; base.filter((x: any) => showDead || x.stage !== "not_interested").forEach((x: any) => { c[x.industry] = (c[x.industry] || 0) + 1; }); return c; }, [base, showDead]);
  const mine = useMemo(() => (d?.deals || []).filter((x: any) => owner === "all" || (owner === "mine" ? x.owner === d.me : owner === "none" ? !x.owner : x.owner === owner)), [d, owner]);

  async function openDeal(id: string) {
    const r = await fetch(`/api/hq/crm/${id}`, { cache: "no-store" }); const j = await r.json();
    if (!r.ok) { setErr(j.error); return; } setOpen(j);
  }
  async function save(id: string, body: any): Promise<boolean> {
    setBusy(true); setErr("");
    try {
      const r = await fetch(`/api/hq/crm/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error);
      setD((x: any) => x && { ...x, deals: x.deals.map((y: any) => (y.id === id ? j.deal : y)) });
      if (open?.deal?.id === id) await openDeal(id);
      if ("stage" in body) load();
      return true;
    } catch (e: any) { setErr(e.message); return false; } finally { setBusy(false); }
  }
  /** Moving stage: Contacted / Prospect need a follow-up date, Not interested asks why. */
  function move(deal: any, to: string) {
    if (to === deal.stage) return;
    setMoving({ deal, to, nextAt: deal.next_action_at && Date.parse(deal.next_action_at) > Date.now() ? localInput(deal.next_action_at) : inDays(to === "contacted" ? 2 : 3), nextAction: "", closeAt: deal.expected_close_at ? localInput(deal.expected_close_at).slice(0, 10) : "", reason: "", note: "" });
  }
  async function confirmMove() {
    const m = moving; const needs = (d?.needsFollowUp || []).includes(m.to);
    const body: any = { stage: m.to, stageNote: m.note || undefined };
    if (needs) { body.nextActionAt = new Date(m.nextAt).toISOString(); body.nextAction = m.nextAction || (m.to === "prospect" ? "Follow up on proposal" : "Call back"); }
    if (m.to === "prospect" && m.closeAt) body.expectedCloseAt = new Date(m.closeAt + "T18:00").toISOString();
    if (m.to === "not_interested") body.lostReason = m.reason;
    if (await save(m.deal.id, body)) setMoving(null);
  }
  async function create() {
    setBusy(true); setErr("");
    try {
      const r = await fetch(`/api/hq/crm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(adding) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error);
      setAdding(null); await load(); openDeal(j.deal.id);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  async function logActivity(id: string, body: any) {
    setBusy(true); setErr("");
    try {
      const r = await fetch(`/api/hq/crm/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error);
      await openDeal(id); load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  async function remove(id: string, name: string) {
    if (!confirm(`Delete the lead "${name}" and its notes? This can't be undone.`)) return;
    const r = await fetch(`/api/hq/crm/${id}`, { method: "DELETE" }); const j = await r.json();
    if (!r.ok) { setErr(j.error); return; } setOpen(null); load();
  }

  const stages = (d?.stages || []).filter((s: any) => showDead || s.key !== "not_interested");
  const t = d?.totals;
  const cnt = (f: (x: any) => boolean) => mine.filter(f).length;

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar active="hq" />
      <div className="flex-1 p-6 md:p-8 min-w-0">
        <div className="w-full max-w-[1500px] flex flex-col gap-5">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-signal"><Link href="/hq">RANA HQ</Link> · Sales CRM</div>
              <div className="text-[22px] font-display font-semibold">Sales leads</div>
              <div className="text-[13px] text-ink-soft mt-0.5">New → Contacted → Prospect → Deal. Everyone sees every lead and every note.</div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => setSheetOpen(true)} className={btn} data-testid="crm-sheet-btn">🔗 Google Sheet{d?.sheet?.url ? " ✓" : ""}</button>
              <button onClick={() => setUploading(true)} className={btn} data-testid="crm-upload-btn">⬆ Upload leads</button>
              <button onClick={() => setAdding({ business: "", contactName: "", phone: "", email: "", city: "", industry: "", source: "manual", note: "" })} className={primary} data-testid="crm-add">+ Add lead</button>
            </div>
          </div>
          {err && <div className="text-[13px] text-miss" data-testid="crm-error">{err} <button onClick={() => setErr("")} className="ml-2 opacity-70">×</button></div>}
          {msg && <div className="text-[13px] text-signal" data-testid="crm-msg">{msg} <button onClick={() => setMsg("")} className="ml-2 opacity-70">×</button></div>}

          {t && (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3" data-testid="crm-today">
              {([
                ["overdue", "Follow-up missed", cnt((x) => x.follow === "overdue"), "date passed — call now", "text-miss"],
                ["today", "Call today", cnt((x) => x.follow === "today"), "follow-ups due today", "text-hot"],
                ["delayed", "Prospects going cold", cnt((x) => x.delayed), "7+ days quiet or close date passed", "text-hot"],
                ["", "New, not called", cnt((x) => x.stage === "new"), "start here", ""],
                ["", "Deals this month", t.wonThisMonth, t.wonMonthlyThisMonth ? `${inr(t.wonMonthlyThisMonth)}/mo` : "", "text-signal"],
              ] as [string, string, number, string, string][]).map(([k, l, v, s, tone]) => (
                <button key={l} onClick={() => k && setFocus(focus === k ? "" : (k as any))} disabled={!k} className={`text-left border rounded-xl bg-raised px-4 py-3 ${focus && focus === k ? "border-signal ring-1 ring-signal" : "border-line"} ${k ? "hover:border-signal/60" : "cursor-default"}`} data-testid={`crm-box-${k || l.split(" ")[0].toLowerCase()}`}>
                  <div className="text-[11.5px] text-ink-soft">{l}</div>
                  <div className={`text-[22px] font-display font-semibold tabular-nums ${v ? tone : ""}`}>{v}</div>
                  <div className="text-[11px] text-ink-soft">{s}{k && focus === k ? " · showing only these" : ""}</div>
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone, city, notes…" className="border border-line rounded-lg px-3 py-2 text-[13px] bg-raised w-full sm:w-[280px]" data-testid="crm-search" />
            <select value={owner} onChange={(e) => setOwner(e.target.value)} className="border border-line rounded-lg px-3 py-2 text-[13px] bg-raised" data-testid="crm-owner-filter">
              <option value="all">Everyone's leads</option>
              <option value="mine">My leads</option>
              <option value="none">Nobody assigned</option>
              {(d?.staff || []).map((s: any) => <option key={s.email} value={s.email}>{s.name || s.email}</option>)}
            </select>
            <div className="flex rounded-lg border border-line overflow-hidden text-[12.5px] font-semibold">
              {(["board", "list"] as const).map((v) => <button key={v} onClick={() => setView(v)} className={`px-3 py-2 ${view === v ? "bg-ink text-paper" : "bg-raised"}`} data-testid={`crm-view-${v}`}>{v === "board" ? "Board" : "List"}</button>)}
            </div>
            <label className="flex items-center gap-1.5 text-[12.5px] text-ink-soft ml-1"><input type="checkbox" checked={showDead} onChange={(e) => setShowDead(e.target.checked)} /> Show not interested</label>
            {focus && <button onClick={() => setFocus("")} className="text-[12.5px] text-signal font-semibold">Clear “{focus === "delayed" ? "going cold" : focus === "today" ? "call today" : "follow-up missed"}” ×</button>}
          </div>
          <div className="flex flex-wrap gap-1.5" data-testid="crm-industries">
            <button onClick={() => setIndustry("all")} className={`rounded-full border px-3 py-1 text-[12px] font-semibold ${industry === "all" ? "bg-ink text-paper border-ink" : "border-line text-ink-soft"}`}>All industries</button>
            {INDUSTRIES.filter((i) => indCounts[i.key] || industry === i.key).map((i) => (
              <button key={i.key} onClick={() => setIndustry(industry === i.key ? "all" : i.key)} className={`rounded-full border px-3 py-1 text-[12px] font-semibold ${industry === i.key ? "bg-ink text-paper border-ink" : "border-line text-ink-soft"}`} data-testid={`crm-ind-${i.key}`}>{i.label} <span className="opacity-70">{indCounts[i.key] || 0}</span></button>
            ))}
          </div>

          {!d ? <div className="text-[13px] text-ink-soft">Loading…</div> : view === "board" ? (
            <div className="grid gap-3 overflow-x-auto pb-3" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(240px, 1fr))` }} data-testid="crm-board">
              {stages.map((s: any) => {
                const col = deals.filter((x: any) => x.stage === s.key).sort((a: any, b: any) => (a.next_action_at ? Date.parse(a.next_action_at) : 9e15) - (b.next_action_at ? Date.parse(b.next_action_at) : 9e15));
                return (
                  <div key={s.key} className="flex flex-col gap-2 min-w-0" data-testid={`crm-col-${s.key}`}>
                    <div className="flex items-baseline justify-between px-1">
                      <div className="text-[12.5px] font-semibold">{s.label} <span className="text-ink-soft font-normal">{col.length}</span></div>
                      <div className="text-[11px] text-ink-soft">{s.hint}</div>
                    </div>
                    <div className="flex flex-col gap-2 min-h-[80px] rounded-xl bg-raised/50 border border-line p-2">
                      {col.slice(0, 300).map((x: any) => (
                        <div key={x.id} className={`rounded-lg border bg-raised p-3 flex flex-col gap-1 ${x.follow === "overdue" ? "border-miss/60" : x.delayed ? "border-hot/60" : "border-line"}`} data-testid="crm-card">
                          <button onClick={() => openDeal(x.id)} className="text-left flex flex-col gap-1">
                            <div className="text-[13px] font-semibold leading-snug">{x.business}</div>
                            <div className="text-[11.5px] text-ink-soft truncate">{[x.contact_name, x.phone, x.city].filter(Boolean).join(" · ") || x.email || "—"}</div>
                            <div className="text-[11px] text-ink-soft">{indLabel(x.industry)} · {staffName(x.owner)}</div>
                            {x.next_action_at && x.follow !== "none" && <div className={`text-[11.5px] ${FOLLOW_TONE[x.follow]}`}>⏰ {x.follow === "overdue" ? "Missed: " : ""}{x.next_action || "Follow up"} · {day(x.next_action_at)}</div>}
                            {x.delayed && <div className="text-[11.5px] text-hot font-semibold">Going cold — update it</div>}
                            {x.stage === "deal" && x.monthly ? <div className="text-[12px] font-semibold tabular-nums text-signal">{inr(x.monthly)}/mo</div> : null}
                          </button>
                          {NEXT[x.stage] && <button onClick={() => move(x, NEXT[x.stage])} className="self-start mt-1 text-[11.5px] font-semibold text-signal" data-testid="crm-card-next">→ Move to {d.stages.find((y: any) => y.key === NEXT[x.stage])?.label}</button>}
                        </div>
                      ))}
                      {col.length > 300 && <div className="text-[11.5px] text-ink-soft px-1">+{col.length - 300} more — search or filter to find them</div>}
                      {!col.length && <div className="text-[11.5px] text-ink-soft px-1 py-2">Nothing here.</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="border border-line rounded-xl bg-raised overflow-x-auto" data-testid="crm-list">
              <table className="w-full text-[13px] min-w-[900px]">
                <thead><tr className="text-left text-[11px] uppercase tracking-wide text-ink-soft border-b border-line">
                  <th className="px-4 py-2">Lead</th><th className="px-3 py-2">Stage</th><th className="px-3 py-2">Industry</th><th className="px-3 py-2">Next follow-up</th><th className="px-3 py-2">Owner</th><th className="px-3 py-2">Came from</th><th className="px-3 py-2">Last update</th>
                </tr></thead>
                <tbody>
                  {deals.filter((x: any) => showDead || x.stage !== "not_interested").sort((a: any, b: any) => (a.next_action_at ? Date.parse(a.next_action_at) : 9e15) - (b.next_action_at ? Date.parse(b.next_action_at) : 9e15)).slice(0, 1000).map((x: any) => (
                    <tr key={x.id} onClick={() => openDeal(x.id)} className="border-b border-line last:border-0 cursor-pointer hover:bg-paper">
                      <td className="px-4 py-2.5"><div className="font-semibold">{x.business}</div><div className="text-[11.5px] text-ink-soft">{[x.contact_name, x.phone, x.city].filter(Boolean).join(" · ")}</div></td>
                      <td className="px-3 py-2.5"><span className={`border rounded-full px-2 py-0.5 text-[11px] font-semibold ${STAGE_TONE[x.stage] || ""}`}>{d.stages.find((s: any) => s.key === x.stage)?.label}</span>{x.delayed && <span className="ml-1.5 text-[11px] text-hot font-semibold">going cold</span>}</td>
                      <td className="px-3 py-2.5">{indLabel(x.industry)}</td>
                      <td className={`px-3 py-2.5 ${FOLLOW_TONE[x.follow]}`}>{x.next_action_at && x.follow !== "none" ? `${x.next_action || "Follow up"} · ${day(x.next_action_at)}` : <span className="text-ink-soft">—</span>}</td>
                      <td className="px-3 py-2.5">{staffName(x.owner)}</td>
                      <td className="px-3 py-2.5 text-ink-soft">{d.sources[x.source] || x.source}</td>
                      <td className="px-3 py-2.5 text-ink-soft">{ago(x.last_activity_at || x.updated_at)}</td>
                    </tr>
                  ))}
                  {!deals.length && <tr><td colSpan={7} className="px-4 py-6 text-ink-soft">No leads match. Upload a list or add one.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {adding && (
        <Modal onClose={() => setAdding(null)} testid="crm-add-form" title="Add a lead">
          <label className="text-[12px] font-semibold">Business name<input autoFocus value={adding.business} onChange={(e) => setAdding({ ...adding, business: e.target.value })} className={field} placeholder="e.g. Sri Sai Clinic" data-testid="crm-new-business" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-[12px] font-semibold">Contact person<input value={adding.contactName} onChange={(e) => setAdding({ ...adding, contactName: e.target.value })} className={field} /></label>
            <label className="text-[12px] font-semibold">Phone<input value={adding.phone} onChange={(e) => setAdding({ ...adding, phone: e.target.value })} className={field} inputMode="tel" placeholder="98765 43210" data-testid="crm-new-phone" /></label>
            <label className="text-[12px] font-semibold">Email<input value={adding.email} onChange={(e) => setAdding({ ...adding, email: e.target.value })} className={field} /></label>
            <label className="text-[12px] font-semibold">City<input value={adding.city} onChange={(e) => setAdding({ ...adding, city: e.target.value })} className={field} /></label>
            <label className="text-[12px] font-semibold">Industry<select value={adding.industry} onChange={(e) => setAdding({ ...adding, industry: e.target.value })} className={field} data-testid="crm-new-industry"><option value="">Guess from the name</option>{INDUSTRIES.map((i) => <option key={i.key} value={i.key}>{i.label}</option>)}</select></label>
            <label className="text-[12px] font-semibold">Came from<select value={adding.source} onChange={(e) => setAdding({ ...adding, source: e.target.value })} className={field}>{Object.entries(d?.sources || {}).map(([k, l]: any) => <option key={k} value={k}>{l}</option>)}</select></label>
          </div>
          <label className="text-[12px] font-semibold">Note for the team<textarea value={adding.note} onChange={(e) => setAdding({ ...adding, note: e.target.value })} className={field} rows={2} placeholder="What they need, who decides, best time to call…" /></label>
          <div className="text-[11.5px] text-ink-soft">It goes to <b>New</b> with you as owner.</div>
          <div className="flex justify-end gap-2 mt-1">
            <button onClick={() => setAdding(null)} className={btn}>Cancel</button>
            <button onClick={create} disabled={busy || !adding.business.trim() || (!adding.phone.trim() && !adding.email.trim())} className={primary} data-testid="crm-new-save">Add lead</button>
          </div>
        </Modal>
      )}

      {uploading && <UploadModal staff={d?.staff || []} me={d?.me} onClose={() => setUploading(false)} onDone={(m: string) => { setUploading(false); setMsg(m); load(); }} />}
      {sheetOpen && d && <SheetModal d={d} onClose={() => setSheetOpen(false)} onChanged={(m: string) => { setMsg(m); load(); }} />}

      {moving && (
        <Modal onClose={() => setMoving(null)} testid="crm-move" title={`${moving.deal.business} → ${d.stages.find((s: any) => s.key === moving.to)?.label}`}>
          {(d.needsFollowUp || []).includes(moving.to) && (
            <>
              <div className="text-[12.5px] text-ink-soft">When should someone call them next? You'll get a reminder.</div>
              <div className="flex flex-wrap gap-1.5">
                {[["Tomorrow", 1], ["In 2 days", 2], ["In 3 days", 3], ["Next week", 7]].map(([l, n]) => <button key={l} onClick={() => setMoving({ ...moving, nextAt: inDays(n as number) })} className={`rounded-lg px-2.5 py-1 text-[12px] border ${moving.nextAt === inDays(n as number) ? "bg-ink text-paper border-ink font-semibold" : "border-line"}`}>{l}</button>)}
              </div>
              <div className="grid grid-cols-2 gap-3">
// @@RANA_CONT@@
