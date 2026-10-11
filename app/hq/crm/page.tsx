"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import { PLANS, SALES_DISCOUNT_STEPS, YEARLY_MONTHS_PAID } from "@/lib/pricing";

/** RANA HQ → Sales CRM: our own prospects, from first call to won. */
const inr = (n: number) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;
const field = "mt-1 w-full border border-line rounded-lg px-3 py-2 text-[13px] font-normal bg-paper";
const STAGE_TONE: Record<string, string> = {
  new: "border-hot/50 text-hot", contacted: "border-line", demo_booked: "border-signal/50 text-signal", demo_done: "border-signal/50 text-signal",
  proposal: "border-violet/50 text-violet", won: "border-signal bg-signal/15 text-signal", lost: "border-line text-ink-soft",
};
const KINDS: [string, string][] = [["call", "📞 Call"], ["whatsapp", "💬 WhatsApp"], ["meeting", "🤝 Meeting"], ["email", "✉️ Email"], ["note", "📝 Note"]];
const PLAN_KEYS = ["starter", "growth", "scale", "enterprise"];
const day = (d: string | null) => (d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "");
const ago = (d: string) => { const s = (Date.now() - Date.parse(d)) / 1000; return s < 3600 ? `${Math.max(1, Math.round(s / 60))}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`; };
const localInput = (d: string | null) => { if (!d) return ""; const t = new Date(d); t.setMinutes(t.getMinutes() - t.getTimezoneOffset()); return t.toISOString().slice(0, 16); };
const dueTone = (d: string | null) => { if (!d) return ""; const t = Date.parse(d), now = Date.now(); const end = new Date(); end.setHours(23, 59, 59, 999); return t < now ? "text-miss font-semibold" : t <= end.getTime() ? "text-hot font-semibold" : "text-ink-soft"; };
const listOf = (plan: string | null) => (plan && plan !== "enterprise" ? (PLANS as any)[plan]?.pricePerMonth || 0 : 0);
const wa = (p: string | null) => (p ? `https://wa.me/${p.replace(/[^\d]/g, "")}` : "");

export default function HqCrmPage() {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  const [view, setView] = useState<"board" | "list">("board");
  const [q, setQ] = useState("");
  const [owner, setOwner] = useState("all");
  const [showLost, setShowLost] = useState(false);
  const [adding, setAdding] = useState<any>(null);
  const [open, setOpen] = useState<any>(null); // { deal, activities }
  const [busy, setBusy] = useState(false);

  const load = () => fetch("/api/hq/crm", { cache: "no-store" }).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setD(j); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); try { const v = localStorage.getItem("crm-view"); if (v === "list" || v === "board") setView(v); } catch {} }, []);
  useEffect(() => { try { localStorage.setItem("crm-view", view); } catch {} }, [view]);

  const staffName = (e: string | null) => { if (!e) return "—"; const s = d?.staff?.find((x: any) => x.email === e); return s?.name || e.split("@")[0]; };
  const deals = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (d?.deals || []).filter((x: any) =>
      (owner === "all" || (owner === "mine" ? x.owner === d.me : owner === "none" ? !x.owner : x.owner === owner)) &&
      (!t || [x.business, x.contact_name, x.phone, x.email, x.city, x.industry].some((v) => String(v || "").toLowerCase().includes(t))));
  }, [d, q, owner]);

  async function openDeal(id: string) {
    const r = await fetch(`/api/hq/crm/${id}`, { cache: "no-store" }); const j = await r.json();
    if (!r.ok) { setErr(j.error); return; } setOpen(j);
  }
  async function save(id: string, body: any) {
    setBusy(true); setErr("");
    try {
      const r = await fetch(`/api/hq/crm/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error);
      setD((x: any) => x && { ...x, deals: x.deals.map((y: any) => (y.id === id ? j.deal : y)) });
      if (open?.deal?.id === id) await openDeal(id);
      if ("stage" in body) load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
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
    if (!confirm(`Delete the deal "${name}" and its history? This can't be undone.`)) return;
    const r = await fetch(`/api/hq/crm/${id}`, { method: "DELETE" }); const j = await r.json();
    if (!r.ok) { setErr(j.error); return; } setOpen(null); load();
  }

  const stages = (d?.stages || []).filter((s: any) => showLost || s.key !== "lost");
  const t = d?.totals;

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar active="hq" />
      <div className="flex-1 p-6 md:p-8 min-w-0">
        <div className="w-full max-w-[1700px] flex flex-col gap-5">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-signal"><Link href="/hq">RANA HQ</Link> · Sales CRM</div>
              <div className="text-[22px] font-display font-semibold">Our sales pipeline</div>
              <div className="text-[13px] text-ink-soft mt-0.5">Every business we're pitching, from first call to won. Website demo requests and free proof runs arrive here automatically.</div>
            </div>
            <button onClick={() => setAdding({ business: "", contactName: "", phone: "", email: "", city: "", industry: "", source: "manual", plan: "", note: "" })} className="bg-signal text-on-accent rounded-lg px-4 py-2 text-[13px] font-semibold" data-testid="crm-add">+ Add deal</button>
          </div>
          {err && <div className="text-[13px] text-miss" data-testid="crm-error">{err} <button onClick={() => setErr("")} className="ml-2 opacity-70">×</button></div>}

          {t && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="crm-totals">
              {[["Open deals", String(t.open), ""], ["Pipeline value", `${inr(t.pipelineMonthly)}/mo`, "after discounts offered"], ["Follow-ups due", String(t.due), t.overdue ? `${t.overdue} overdue` : "today"], ["Won this month", String(t.wonThisMonth), `${inr(t.wonMonthlyThisMonth)}/mo`]].map(([l, v, s]) => (
                <div key={l} className="border border-line rounded-xl bg-raised px-4 py-3">
                  <div className="text-[11.5px] text-ink-soft">{l}</div>
                  <div className="text-[22px] font-display font-semibold tabular-nums">{v}</div>
                  <div className={`text-[11.5px] ${l === "Follow-ups due" && t.overdue ? "text-miss font-semibold" : "text-ink-soft"}`}>{s}</div>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search business, person, phone, city…" className="border border-line rounded-lg px-3 py-2 text-[13px] bg-raised w-full sm:w-[300px]" data-testid="crm-search" />
            <select value={owner} onChange={(e) => setOwner(e.target.value)} className="border border-line rounded-lg px-3 py-2 text-[13px] bg-raised" data-testid="crm-owner-filter">
              <option value="all">Everyone's deals</option>
              <option value="mine">My deals</option>
              <option value="none">No owner</option>
              {(d?.staff || []).map((s: any) => <option key={s.email} value={s.email}>{s.name || s.email}</option>)}
            </select>
            <div className="flex rounded-lg border border-line overflow-hidden text-[12.5px] font-semibold">
              {(["board", "list"] as const).map((v) => <button key={v} onClick={() => setView(v)} className={`px-3 py-2 ${view === v ? "bg-ink text-paper" : "bg-raised"}`} data-testid={`crm-view-${v}`}>{v === "board" ? "Board" : "List"}</button>)}
            </div>
            <label className="flex items-center gap-1.5 text-[12.5px] text-ink-soft ml-1"><input type="checkbox" checked={showLost} onChange={(e) => setShowLost(e.target.checked)} /> Show lost</label>
          </div>

          {!d ? <div className="text-[13px] text-ink-soft">Loading…</div> : view === "board" ? (
            <div className="flex gap-3 overflow-x-auto pb-3" data-testid="crm-board">
              {stages.map((s: any) => {
                const col = deals.filter((x: any) => x.stage === s.key);
                return (
                  <div key={s.key} className="w-[260px] shrink-0 flex flex-col gap-2">
                    <div className="flex items-baseline justify-between px-1">
                      <div className="text-[12.5px] font-semibold">{s.label} <span className="text-ink-soft font-normal">{col.length}</span></div>
                      <div className="text-[11px] text-ink-soft tabular-nums">{inr(col.reduce((a: number, x: any) => a + (x.monthly || 0), 0))}/mo</div>
                    </div>
                    <div className="flex flex-col gap-2 min-h-[80px] rounded-xl bg-raised/50 border border-line p-2">
                      {col.map((x: any) => (
                        <button key={x.id} onClick={() => openDeal(x.id)} className="text-left rounded-lg border border-line bg-raised p-3 hover:border-signal/60 flex flex-col gap-1" data-testid="crm-card">
                          <div className="text-[13px] font-semibold leading-snug">{x.business}</div>
                          <div className="text-[11.5px] text-ink-soft truncate">{[x.contact_name, x.city].filter(Boolean).join(" · ") || x.phone || "—"}</div>
                          <div className="flex items-center justify-between text-[11.5px]">
                            <span>{x.plan ? `${x.plan[0].toUpperCase()}${x.plan.slice(1)}${x.discount_pct ? ` −${x.discount_pct}%` : ""}` : <span className="text-ink-soft">No plan yet</span>}</span>
                            {x.monthly ? <span className="tabular-nums font-semibold">{inr(x.monthly)}</span> : null}
                          </div>
                          {x.next_action_at && <div className={`text-[11px] ${dueTone(x.next_action_at)}`}>⏰ {x.next_action || "Follow up"} · {day(x.next_action_at)}</div>}
                          <div className="text-[10.5px] text-ink-soft">{staffName(x.owner)} · {d.sources[x.source] || x.source}</div>
                        </button>
                      ))}
                      {!col.length && <div className="text-[11.5px] text-ink-soft px-1 py-2">{s.hint}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="border border-line rounded-xl bg-raised overflow-x-auto" data-testid="crm-list">
              <table className="w-full text-[13px] min-w-[900px]">
                <thead><tr className="text-left text-[11px] uppercase tracking-wide text-ink-soft border-b border-line">
                  <th className="px-4 py-2">Business</th><th className="px-3 py-2">Stage</th><th className="px-3 py-2">Plan · value</th><th className="px-3 py-2">Next follow-up</th><th className="px-3 py-2">Owner</th><th className="px-3 py-2">Source</th><th className="px-3 py-2">Updated</th>
                </tr></thead>
                <tbody>
                  {[...deals].filter((x: any) => showLost || x.stage !== "lost").sort((a: any, b: any) => (a.next_action_at ? Date.parse(a.next_action_at) : 9e15) - (b.next_action_at ? Date.parse(b.next_action_at) : 9e15)).map((x: any) => (
                    <tr key={x.id} onClick={() => openDeal(x.id)} className="border-b border-line last:border-0 cursor-pointer hover:bg-paper">
                      <td className="px-4 py-2.5"><div className="font-semibold">{x.business}</div><div className="text-[11.5px] text-ink-soft">{[x.contact_name, x.phone, x.city].filter(Boolean).join(" · ")}</div></td>
                      <td className="px-3 py-2.5"><span className={`border rounded-full px-2 py-0.5 text-[11px] font-semibold ${STAGE_TONE[x.stage] || ""}`}>{d.stages.find((s: any) => s.key === x.stage)?.label}</span></td>
                      <td className="px-3 py-2.5 tabular-nums">{x.plan ? `${x.plan}${x.discount_pct ? ` −${x.discount_pct}%` : ""}` : "—"}{x.monthly ? ` · ${inr(x.monthly)}/mo` : ""}</td>
                      <td className={`px-3 py-2.5 ${dueTone(x.next_action_at)}`}>{x.next_action_at ? `${x.next_action || "Follow up"} · ${day(x.next_action_at)}` : <span className="text-ink-soft">—</span>}</td>
                      <td className="px-3 py-2.5">{staffName(x.owner)}</td>
                      <td className="px-3 py-2.5 text-ink-soft">{d.sources[x.source] || x.source}</td>
                      <td className="px-3 py-2.5 text-ink-soft">{ago(x.updated_at)}</td>
                    </tr>
                  ))}
                  {!deals.length && <tr><td colSpan={7} className="px-4 py-6 text-ink-soft">No deals yet. Add the first business you're pitching.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {adding && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={() => setAdding(null)}>
          <div className="w-full max-w-[520px] bg-raised rounded-2xl border border-line p-6 flex flex-col gap-3 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="crm-add-form">
            <div className="text-[18px] font-display font-semibold">Add a deal</div>
            <label className="text-[12px] font-semibold">Business name<input autoFocus value={adding.business} onChange={(e) => setAdding({ ...adding, business: e.target.value })} className={field} placeholder="e.g. Sri Sai Clinic" data-testid="crm-new-business" /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-[12px] font-semibold">Contact person<input value={adding.contactName} onChange={(e) => setAdding({ ...adding, contactName: e.target.value })} className={field} /></label>
              <label className="text-[12px] font-semibold">Phone<input value={adding.phone} onChange={(e) => setAdding({ ...adding, phone: e.target.value })} className={field} inputMode="tel" placeholder="98765 43210" /></label>
              <label className="text-[12px] font-semibold">Email<input value={adding.email} onChange={(e) => setAdding({ ...adding, email: e.target.value })} className={field} /></label>
              <label className="text-[12px] font-semibold">City<input value={adding.city} onChange={(e) => setAdding({ ...adding, city: e.target.value })} className={field} /></label>
              <label className="text-[12px] font-semibold">Industry<input value={adding.industry} onChange={(e) => setAdding({ ...adding, industry: e.target.value })} className={field} placeholder="Clinic, real estate, retail…" /></label>
              <label className="text-[12px] font-semibold">Source<select value={adding.source} onChange={(e) => setAdding({ ...adding, source: e.target.value })} className={field}>{Object.entries(d?.sources || {}).map(([k, l]: any) => <option key={k} value={k}>{l}</option>)}</select></label>
              <label className="text-[12px] font-semibold col-span-2">Plan they're interested in<select value={adding.plan} onChange={(e) => setAdding({ ...adding, plan: e.target.value })} className={field}><option value="">Not decided</option>{PLAN_KEYS.map((k) => <option key={k} value={k}>{k[0].toUpperCase() + k.slice(1)}{listOf(k) ? ` — ${inr(listOf(k))}/mo list` : ""}</option>)}</select></label>
            </div>
            <label className="text-[12px] font-semibold">First note<textarea value={adding.note} onChange={(e) => setAdding({ ...adding, note: e.target.value })} className={field} rows={2} placeholder="What they need, how many calls, who decides…" /></label>
            <div className="flex justify-end gap-2 mt-1">
              <button onClick={() => setAdding(null)} className="border border-line rounded-lg px-4 py-2 text-[13px] font-semibold">Cancel</button>
              <button onClick={create} disabled={busy || !adding.business.trim()} className="bg-signal text-on-accent rounded-lg px-4 py-2 text-[13px] font-semibold disabled:opacity-50" data-testid="crm-new-save">Add deal</button>
            </div>
          </div>
        </div>
      )}

      {open && <DealDrawer key={open.deal.id + open.deal.updated_at} data={open} meta={d} busy={busy} onClose={() => setOpen(null)} onSave={save} onLog={logActivity} onDelete={remove} staffName={staffName} />}
    </div>
  );
}

function DealDrawer({ data, meta, busy, onClose, onSave, onLog, onDelete, staffName }: any) {
  const x = data.deal;
  const [log, setLog] = useState({ kind: "call", text: "", nextAction: x.next_action || "", nextAt: localInput(x.next_action_at) });
  const blur = (k: string, cur: any) => (e: any) => { const v = e.target.value; if (v !== (cur ?? "")) onSave(x.id, { [k]: v }); };
  const list = listOf(x.plan);
  const yearly = x.billing === "yearly";
  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-[560px] h-full bg-raised border-l border-line overflow-y-auto p-6 flex flex-col gap-4" onClick={(e) => e.stopPropagation()} data-testid="crm-drawer">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <input defaultValue={x.business} onBlur={blur("business", x.business)} className="text-[19px] font-display font-semibold bg-transparent w-full outline-none" data-testid="crm-business" />
            <div className="text-[12px] text-ink-soft">{meta.sources[x.source] || x.source} · added {ago(x.created_at)}{x.last_contact_at ? ` · last contact ${ago(x.last_contact_at)}` : ""}</div>
          </div>
          <button onClick={onClose} className="text-ink-soft text-xl">×</button>
        </div>

        <div className="flex flex-wrap gap-1.5" data-testid="crm-stages">
          {meta.stages.map((s: any) => (
            <button key={s.key} disabled={busy} onClick={() => { if (s.key === x.stage) return; const reason = s.key === "lost" ? prompt("Why was it lost? (price, timing, chose someone else…)") : undefined; if (s.key === "lost" && reason === null) return; onSave(x.id, { stage: s.key, ...(reason ? { lostReason: reason } : {}) }); }}
              className={`rounded-full border px-3 py-1 text-[12px] font-semibold ${x.stage === s.key ? `${STAGE_TONE[s.key]} ring-1 ring-current` : "border-line text-ink-soft"}`} data-testid={`crm-stage-${s.key}`}>{s.label}</button>
          ))}
        </div>
        {x.stage === "lost" && x.lost_reason && <div className="text-[12.5px] text-ink-soft">Lost because: {x.lost_reason}</div>}

        <div className="flex gap-2 flex-wrap">
          {x.phone && <a href={`tel:${x.phone}`} className="border border-line rounded-lg px-3 py-1.5 text-[12.5px] font-semibold">📞 {x.phone}</a>}
          {x.phone && <a href={wa(x.phone)} target="_blank" rel="noreferrer" className="border border-line rounded-lg px-3 py-1.5 text-[12.5px] font-semibold">💬 WhatsApp</a>}
          {x.email && <a href={`mailto:${x.email}`} className="border border-line rounded-lg px-3 py-1.5 text-[12.5px] font-semibold">✉️ {x.email}</a>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-[12px] font-semibold">Contact person<input defaultValue={x.contact_name || ""} onBlur={blur("contactName", x.contact_name)} className={field} /></label>
          <label className="text-[12px] font-semibold">Phone<input defaultValue={x.phone || ""} onBlur={blur("phone", x.phone)} className={field} inputMode="tel" /></label>
          <label className="text-[12px] font-semibold">Email<input defaultValue={x.email || ""} onBlur={blur("email", x.email)} className={field} /></label>
          <label className="text-[12px] font-semibold">City<input defaultValue={x.city || ""} onBlur={blur("city", x.city)} className={field} /></label>
          <label className="text-[12px] font-semibold">Industry<input defaultValue={x.industry || ""} onBlur={blur("industry", x.industry)} className={field} /></label>
          <label className="text-[12px] font-semibold">Owner<select value={x.owner || ""} onChange={(e) => onSave(x.id, { owner: e.target.value })} className={field} data-testid="crm-owner">
            <option value="">Nobody</option>{meta.staff.map((s: any) => <option key={s.email} value={s.email}>{s.name || s.email}{s.designation ? ` · ${s.designation}` : ""}</option>)}
          </select></label>
        </div>

        <div className="border border-line rounded-xl p-3 flex flex-col gap-2 bg-paper" data-testid="crm-offer">
          <div className="text-[12px] font-semibold">Offer</div>
          <div className="grid grid-cols-2 gap-2">
            <select value={x.plan || ""} onChange={(e) => onSave(x.id, { plan: e.target.value })} className="border border-line rounded-lg px-2.5 py-1.5 text-[12.5px] bg-raised" data-testid="crm-plan">
              <option value="">Plan not decided</option>{PLAN_KEYS.map((k) => <option key={k} value={k}>{k[0].toUpperCase() + k.slice(1)}</option>)}
            </select>
            <div className="flex rounded-lg border border-line overflow-hidden text-[12px] font-semibold">
              {(["monthly", "yearly"] as const).map((b) => <button key={b} onClick={() => onSave(x.id, { billing: b })} className={`flex-1 py-1.5 ${x.billing === b ? "bg-ink text-paper" : "bg-raised"}`}>{b === "monthly" ? "Monthly" : "Yearly"}</button>)}
            </div>
          </div>
          {x.plan && x.plan !== "enterprise" && (
            <>
              <div className="flex flex-wrap gap-1.5">
                {SALES_DISCOUNT_STEPS.map((p) => <button key={p} disabled={busy} onClick={() => onSave(x.id, { discountPct: p })} className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold border ${Number(x.discount_pct || 0) === p ? "bg-ink text-paper border-ink" : "border-line"}`} data-testid={`crm-discount-${p}`}>{p ? `${p}% off` : "List price"}</button>)}
              </div>
              <div className="text-[13px] tabular-nums" data-testid="crm-price">
                {x.discount_pct ? <span className="line-through text-ink-soft mr-1.5">{inr(list)}</span> : null}<b>{inr(x.monthly)}</b>/month
                {yearly ? <> · <b>{inr(x.monthly * YEARLY_MONTHS_PAID)}</b> for 12 months (2 free, no setup fee)</> : null}
              </div>
              <div className="text-[11px] text-ink-soft">When they sign, open their workspace in HQ and set the same discount there so invoices match.</div>
            </>
          )}
          {x.plan === "enterprise" && <div className="text-[12px] text-ink-soft">Enterprise is priced per deal — write the agreed price in notes.</div>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-[12px] font-semibold">RANA client (once signed)<select value={x.client_id || ""} onChange={(e) => onSave(x.id, { clientId: e.target.value })} className={field}>
            <option value="">Not a client yet</option>{meta.clients.map((c: any) => <option key={c.id} value={c.id}>{c.name} · {c.plan}</option>)}
          </select></label>
          <label className="text-[12px] font-semibold">Source<select value={x.source} onChange={(e) => onSave(x.id, { source: e.target.value })} className={field}>{Object.entries(meta.sources).map(([k, l]: any) => <option key={k} value={k}>{l}</option>)}</select></label>
        </div>
        <label className="text-[12px] font-semibold">Notes<textarea defaultValue={x.notes || ""} onBlur={blur("notes", x.notes)} rows={3} className={field} placeholder="Calls a day, decision maker, objections, what they liked in the demo…" /></label>

        <div className="border border-line rounded-xl p-3 flex flex-col gap-2" data-testid="crm-log">
          <div className="text-[12px] font-semibold">Log what happened</div>
          <div className="flex flex-wrap gap-1.5">{KINDS.map(([k, l]) => <button key={k} onClick={() => setLog({ ...log, kind: k })} className={`rounded-lg px-2.5 py-1 text-[12px] border ${log.kind === k ? "bg-ink text-paper border-ink font-semibold" : "border-line"}`}>{l}</button>)}</div>
          <textarea value={log.text} onChange={(e) => setLog({ ...log, text: e.target.value })} rows={2} className={field} placeholder="e.g. Spoke to owner, 40 calls a day, wants Telugu. Demo Thursday." data-testid="crm-log-text" />
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input value={log.nextAction} onChange={(e) => setLog({ ...log, nextAction: e.target.value })} className={field} placeholder="Next step (e.g. Send proposal)" />
            <input type="datetime-local" value={log.nextAt} onChange={(e) => setLog({ ...log, nextAt: e.target.value })} className={field} data-testid="crm-next-at" />
          </div>
          <div className="flex justify-end">
            <button disabled={busy || !log.text.trim()} onClick={() => onLog(x.id, { kind: log.kind, text: log.text, nextAction: log.nextAction, nextActionAt: log.nextAt ? new Date(log.nextAt).toISOString() : null })} className="bg-signal text-on-accent rounded-lg px-4 py-2 text-[12.5px] font-semibold disabled:opacity-50" data-testid="crm-log-save">Save</button>
          </div>
          {x.next_action_at && <div className={`text-[12px] ${dueTone(x.next_action_at)}`}>Next: {x.next_action || "Follow up"} · {day(x.next_action_at)}</div>}
        </div>

        <div className="flex flex-col gap-2" data-testid="crm-timeline">
          <div className="text-[12px] font-semibold">History</div>
          {data.activities.map((a: any) => (
            <div key={a.id} className="text-[12.5px] border-l-2 border-line pl-3">
              <div className="text-[11px] text-ink-soft">{KINDS.find(([k]) => k === a.kind)?.[1] || (a.kind === "stage" ? "➜ Stage" : "•")} · {staffName(a.created_by)} · {day(a.created_at)}</div>
              <div className="whitespace-pre-wrap">{a.text}</div>
            </div>
          ))}
          {!data.activities.length && <div className="text-[12px] text-ink-soft">Nothing logged yet.</div>}
        </div>

        <div className="pt-2 border-t border-line flex justify-between items-center">
          <span className="text-[11px] text-ink-soft">Owner: {staffName(x.owner)}</span>
          <button onClick={() => onDelete(x.id, x.business)} className="text-miss text-[12px] font-semibold">Delete deal</button>
        </div>
      </div>
    </div>
  );
}
