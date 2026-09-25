"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import StatusPill, { type PillTone } from "@/components/StatusPill";
import CallDrawer from "@/components/CallDrawer";
import type { CallRow, LeadStatus } from "@/lib/calls";
import { LEAD_LABEL, LEAD_TONE, fmtDuration, fmtPhone, fmtDate, fmtClock } from "@/lib/format";
import { CAMPAIGN_STATUS } from "@/lib/campaignUi";

type Row = {
  contactId: string; name: string | null; phone: string; variables: Record<string, string>; dialStatus: string; attempts: number;
  call: { id: string; lifted: boolean; talkSeconds: number; lead: LeadStatus; reason: string | null; summary: string | null; at: string; followUp: boolean } | null;
};
type Detail = {
  campaign: { id: string; name: string; status: string; total_contacts: number; created_at: string; started_at: string | null; scheduled_at: string | null; from_number: string | null; last_error: string | null; cartesia_batch_id: string | null };
  employee: { id: string; name: string } | null;
  kpis: { dialled: number; connected: number; connectRate: number; dnp: number; engaged: number; interested: number; hot: number; readyToClose: number; warm: number; cold: number; notInterested: number; followUps: number; talkSeconds: number; avgTalk: number; leadRate: number };
  notConnected: { reason: string; count: number }[];
  progress: { total: number; dialled: number };
  rows: Row[];
};

type Filter = "all" | "hot" | "warm" | "follow" | "dnp" | "not_interested" | "cold" | "pending";
const FILTERS: { k: Filter; l: string; test: (r: Row) => boolean }[] = [
  { k: "all", l: "All", test: () => true },
  { k: "hot", l: "Hot", test: (r) => r.call?.lead === "hot" || r.call?.lead === "ready_to_close" },
  { k: "warm", l: "Warm", test: (r) => r.call?.lead === "warm" },
  { k: "follow", l: "Follow-up", test: (r) => !!r.call?.followUp || r.call?.lead === "ready_to_close" },
  { k: "dnp", l: "DNP", test: (r) => !!r.call && !r.call.lifted },
  { k: "not_interested", l: "Not interested", test: (r) => r.call?.lead === "not_interested" },
  { k: "cold", l: "Cold", test: (r) => r.call?.lead === "cold" },
  { k: "pending", l: "Not dialled yet", test: (r) => !r.call },
];

const talk = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m` : fmtDuration(s));
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

function dialLabel(r: Row): { label: string; tone: PillTone } {
  if (r.call) return r.call.lifted ? { label: "Lifted", tone: "signal" } : { label: "DNP", tone: "miss" };
  const s = r.dialStatus.toLowerCase();
  if (/progress|dial|ring|active/.test(s)) return { label: "Dialling…", tone: "warm" };
  if (/fail|error/.test(s)) return { label: "Failed", tone: "miss" };
  if (/cancel/.test(s)) return { label: "Cancelled", tone: "neutral" };
  return { label: "Queued", tone: "neutral" };
}

export default function CampaignDetailPage({ params }: { params: { id: string } }) {
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState("");
  const [selected, setSelected] = useState<CallRow | null>(null);

  async function load() {
    try {
      const res = await fetch(`/api/campaigns/${encodeURIComponent(params.id)}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed to load");
      setD(j); setError("");
    } catch (e: any) { setError(e.message); }
  }
  useEffect(() => { load(); }, [params.id]);
  useEffect(() => {
    if (!d || !["running", "scheduled"].includes(d.campaign.status)) return;
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [d?.campaign.status]);

  async function act(action: "cancel" | "retry" | "refresh") {
    if (action === "cancel" && !confirm("Stop this campaign? Calls already in progress will finish; nobody else will be dialled.")) return;
    if (action === "retry" && !confirm("Call again every number that didn't pick up?")) return;
    setBusy(action);
    try {
      const res = await fetch(`/api/campaigns/${encodeURIComponent(params.id)}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Action failed");
      await load();
    } catch (e: any) { alert(e.message); }
    finally { setBusy(""); }
  }
  async function openCall(id: string) {
    const res = await fetch(`/api/calls/${id}`);
    const j = await res.json();
    if (res.ok) setSelected(j.call);
  }

  if (error && !d) return (
    <div className="flex min-h-screen bg-paper"><Sidebar active="outbound" />
      <div className="flex-1 p-10 text-[13px]"><Link href="/outbound" className="text-ink-soft">← Campaigns</Link><div className="mt-4 text-miss">{error}</div></div>
    </div>
  );

  const c = d?.campaign, k = d?.kpis;
  const st = c ? CAMPAIGN_STATUS[c.status] || { label: c.status, tone: "neutral" as PillTone } : null;
  const rows = (d?.rows || []).filter((r) => FILTERS.find((f) => f.k === filter)!.test(r))
    .filter((r) => !q || `${r.name || ""} ${r.phone}`.toLowerCase().includes(q.toLowerCase()));
  const counts = Object.fromEntries(FILTERS.map((f) => [f.k, (d?.rows || []).filter(f.test).length])) as Record<Filter, number>;
  const progressPct = d ? Math.min(100, Math.round((d.progress.dialled / Math.max(1, d.progress.total)) * 100)) : 0;

  const tiles = k && d ? [
    { l: "Numbers", v: d.progress.total.toLocaleString("en-IN"), s: `${d.progress.dialled.toLocaleString("en-IN")} dialled so far` },
    { l: "Lifted", v: String(k.connected), s: `${k.connectRate}% connectivity` },
    { l: "DNP", v: String(k.dnp), s: `${pct(k.dnp, k.dialled)} of dialled` },
    { l: "Hot", v: String(k.hot), s: `${k.readyToClose} ready to close` },
    { l: "Warm", v: String(k.warm), s: `${k.leadRate}% lead rate` },
    { l: "Follow-ups", v: String(k.followUps), s: "sales must call" },
    { l: "Not interested", v: String(k.notInterested), s: `${k.cold} cold` },
    { l: "Talk time", v: talk(k.talkSeconds), s: `avg ${fmtDuration(k.avgTalk)}` },
  ] : [];

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar active="outbound" />
      <main className="flex-1 min-w-0 px-6 py-8 lg:px-10 flex flex-col gap-5">
        <div>
          <Link href="/outbound" className="text-[12.5px] text-ink-soft hover:text-ink">← Campaigns</Link>
          <div className="flex flex-wrap items-end justify-between gap-4 mt-1">
            <div>
              <div className="flex items-center gap-2"><h1 className="font-display text-[24px] font-semibold m-0">{c?.name || "Loading…"}</h1>{st && <StatusPill label={st.label} tone={st.tone} />}</div>
              {c && <div className="text-[12.5px] text-ink-soft mt-1">
                {d?.employee ? <>Called by <Link href="/employees" className="font-semibold text-ink">{d.employee.name}</Link></> : "—"}
                {c.from_number ? ` from ${c.from_number}` : ""} · {c.scheduled_at && c.status === "scheduled" ? `starts ${fmtDate(c.scheduled_at)} ${fmtClock(c.scheduled_at)}` : `launched ${fmtDate(c.started_at || c.created_at)} ${fmtClock(c.started_at || c.created_at)}`}
              </div>}
            </div>
            {c && (
              <div className="flex flex-wrap gap-2">
                <button onClick={() => act("refresh")} disabled={!!busy} className="text-[12.5px] font-semibold border border-line bg-raised rounded-lg px-3 py-1.5 disabled:opacity-50">{busy === "refresh" ? "Refreshing…" : "↻ Refresh"}</button>
                {k && k.dnp > 0 && (c as any).engine !== "sarvam" && ["completed", "paused", "running"].includes(c.status) && <button onClick={() => act("retry")} disabled={!!busy} className="text-[12.5px] font-semibold border border-line bg-raised rounded-lg px-3 py-1.5 disabled:opacity-50">Retry {k.dnp} DNP</button>}
                {["running", "scheduled"].includes(c.status) && <button onClick={() => act("cancel")} disabled={!!busy} className="text-[12.5px] font-semibold text-miss border border-miss/30 bg-raised rounded-lg px-3 py-1.5 disabled:opacity-50">Stop</button>}
                <a href={`/api/campaigns/${encodeURIComponent(params.id)}/export`} className="text-[12.5px] font-semibold bg-signal text-on-accent rounded-lg px-3 py-1.5">Export CSV</a>
              </div>
            )}
          </div>
        </div>

        {c?.last_error && <div className="text-[12.5px] text-miss bg-miss-tint rounded-lg px-3 py-2.5">{c.last_error}</div>}

        {d && (
          <div>
            <div className="flex justify-between text-[12px] text-ink-soft mb-1"><span>{d.progress.dialled.toLocaleString("en-IN")} of {d.progress.total.toLocaleString("en-IN")} numbers dialled</span><span>{progressPct}%</span></div>
            <div className="h-[10px] bg-raised border border-line rounded-full overflow-hidden"><div className="h-full bg-signal" style={{ width: `${progressPct}%` }} /></div>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
          {tiles.map((t) => (
            <div key={t.l} className="bg-raised border border-line rounded-[12px] px-4 py-3">
              <div className="text-[11.5px] text-ink-soft font-medium">{t.l}</div>
              <div className="font-display text-[22px] font-bold leading-tight mt-0.5 tabular-nums">{t.v}</div>
              <div className="text-[11px] text-ink-soft">{t.s}</div>
            </div>
          ))}
        </div>

        <section className="bg-raised border border-line rounded-[12px] flex flex-col min-w-0">
          <div className="px-5 pt-4 pb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1">
              {FILTERS.map((f) => (
                <button key={f.k} onClick={() => setFilter(f.k)} className={`text-[12.5px] font-semibold px-3 py-1.5 rounded-md ${filter === f.k ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"}`}>
                  {f.l} <span className="opacity-60">{counts[f.k]}</span>
                </button>
              ))}
            </div>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or number" className="border border-line rounded-lg px-3 py-1.5 text-[12.5px] bg-paper outline-none focus:border-signal w-[200px]" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] min-w-[860px]">
              <thead><tr className="text-left text-[11.5px] text-ink-soft border-y border-line">
                <th className="font-medium px-5 py-2">Person</th><th className="font-medium py-2">Call</th><th className="font-medium py-2 text-right pr-4">Talk time</th>
                <th className="font-medium py-2">Lead</th><th className="font-medium py-2">Why / what they said</th><th className="font-medium py-2 text-right pr-5">When</th>
              </tr></thead>
              <tbody>
                {!d && <tr><td colSpan={6} className="px-5 py-6 text-ink-soft">Loading…</td></tr>}
                {d && rows.length === 0 && <tr><td colSpan={6} className="px-5 py-8 text-center text-ink-soft">No numbers in this view.</td></tr>}
                {rows.map((r) => {
                  const dl = dialLabel(r);
                  return (
                    <tr key={r.contactId} onClick={() => r.call && openCall(r.call.id)} className={`border-b border-line last:border-b-0 ${r.call ? "cursor-pointer hover:bg-paper" : ""}`}>
                      <td className="px-5 py-2.5">
                        <div className="font-semibold">{r.name || "—"}</div>
                        <div className="text-[11.5px] text-ink-soft">{fmtPhone(r.phone)}{Object.values(r.variables || {}).length ? ` · ${Object.values(r.variables).slice(0, 2).join(" · ")}` : ""}</div>
                      </td>
                      <td className="py-2.5"><StatusPill label={dl.label} tone={dl.tone} />{r.attempts > 1 && <span className="text-[11px] text-ink-soft ml-1.5">{r.attempts} tries</span>}</td>
                      <td className="py-2.5 text-right pr-4 tabular-nums">{r.call?.lifted ? fmtDuration(r.call.talkSeconds) : "—"}</td>
                      <td className="py-2.5">{r.call ? <StatusPill label={r.call.lead === "no_answer" ? "DNP" : LEAD_LABEL[r.call.lead]} tone={LEAD_TONE[r.call.lead]} /> : <span className="text-ink-soft">—</span>}
                        {r.call?.followUp && r.call.lead !== "ready_to_close" && <span className="ml-1.5 text-[11px] font-semibold text-hot">follow-up</span>}</td>
                      <td className="py-2.5 pr-3 max-w-[340px]"><div className="truncate text-ink-soft">{r.call?.reason || "—"}</div>{r.call?.summary && <div className="truncate text-[11.5px] text-ink-soft/80">{r.call.summary}</div>}</td>
                      <td className="py-2.5 pr-5 text-right text-[12px] text-ink-soft whitespace-nowrap">{r.call ? `${fmtDate(r.call.at)} ${fmtClock(r.call.at)}` : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {d && d.notConnected.length > 0 && (
          <div className="text-[12.5px] text-ink-soft">Why numbers didn't connect: {d.notConnected.map((n) => `${n.reason} ${n.count}`).join(" · ")}. Retrying at a different time of day usually lifts more.</div>
        )}
      </main>
      <CallDrawer call={selected} onClose={() => setSelected(null)} onUpdated={(u) => { setSelected(u); load(); }} />
    </div>
  );
}
