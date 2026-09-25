"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import SetupChecklist from "@/components/SetupChecklist";
import StatusPill from "@/components/StatusPill";
import CallDrawer from "@/components/CallDrawer";
import type { CallRow, LeadStatus } from "@/lib/calls";
import { LEAD_LABEL, LEAD_TONE, fmtDuration, fmtPhone, fmtTimeAgo, fmtClock, fmtDate } from "@/lib/format";

/* ───────── types mirrored from /api/dashboard ───────── */
type Kpis = {
  total: number; dialled: number; received: number; connected: number; dnp: number; connectRate: number;
  engaged: number; interested: number; hot: number; readyToClose: number; warm: number; cold: number;
  notInterested: number; followUps: number; talkSeconds: number; avgTalk: number; leadRate: number;
};
type Lean = { id: string; direction: "inbound" | "outbound"; caller_name: string | null; caller_phone: string | null; duration_seconds: number; lead_status: LeadStatus; lead_reason: string | null; summary: string | null; created_at: string; follow_up: boolean };
type Campaign = { id: string; name: string; status: string; totalContacts: number | null; dialled: number; connected: number; dnp: number; connectRate: number; hot: number; warm: number; followUps: number; notInterested: number; talkSeconds: number; lastCallAt: string | null };
type Dash = {
  range: { key: string; from: string; to: string; label: string; days: number };
  previous: { from: string; to: string; label: string };
  direction: "all" | "inbound" | "outbound";
  kpis: Kpis; previousKpis: Kpis; split: { inbound: Kpis; outbound: Kpis };
  hourly: { hour: number; inbound: number; outbound: number; connected: number }[];
  trend: { date: string; inbound: number; outbound: number; connected: number; hot: number }[];
  notConnected: { reason: string; count: number }[];
  leadMix: { status: LeadStatus; count: number }[];
  campaigns: Campaign[]; hotLeads: Lean[]; followUps: Lean[];
  definitions: { term: string; rule: string }[];
  generatedAt: string;
};

const IN_COLOR = "#008300";   // inbound — validated pair (CVD ΔE 26.5) with outbound
const OUT_COLOR = "#2a78d6";  // outbound
const ONE_HUE = "#1C6B4F";    // single-series magnitude bars (brand signal)

const RANGES = [
  { key: "today", label: "Today" }, { key: "yesterday", label: "Yesterday" }, { key: "day_before", label: "Day before" },
  { key: "7d", label: "7 days" }, { key: "30d", label: "30 days" }, { key: "custom", label: "Custom" },
];
const DIRS = [{ key: "all", label: "All activity" }, { key: "inbound", label: "Inbound" }, { key: "outbound", label: "Outbound" }] as const;

const n = (v: number) => v.toLocaleString("en-IN");
const talk = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m` : fmtDuration(s));
const share = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

/* ───────── small pieces ───────── */
function Info({ text }: { text: string }) {
  return (
    <span className="relative group inline-flex">
      <span className="w-[15px] h-[15px] rounded-full border border-line text-[9.5px] leading-[13px] text-center text-ink-soft cursor-help">i</span>
      <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-5 z-30 w-[240px] rounded-lg bg-ink text-white text-[11.5px] leading-snug px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">{text}</span>
    </span>
  );
}

function Delta({ cur, prev, invert = false, suffix = "" }: { cur: number; prev: number; invert?: boolean; suffix?: string }) {
  const d = Math.round((cur - prev) * 10) / 10;
  if (!prev && !cur) return <span className="text-[11.5px] text-ink-soft">no activity before</span>;
  const good = invert ? d < 0 : d > 0;
  const tone = d === 0 ? "text-ink-soft" : good ? "text-signal" : "text-miss";
  return <span className={`text-[11.5px] font-semibold ${tone}`}>{d > 0 ? "▲" : d < 0 ? "▼" : "•"} {Math.abs(d)}{suffix} <span className="font-normal text-ink-soft">vs prev.</span></span>;
}

function Tile({ label, value, sub, info, delta, href }: { label: string; value: string; sub?: React.ReactNode; info: string; delta?: React.ReactNode; href?: string }) {
  const body = (
    <div className="bg-raised border border-line rounded-[12px] px-4 py-4 flex flex-col gap-1.5 h-full hover:border-ink-soft transition-colors">
      <div className="flex items-center gap-1.5 text-[12px] text-ink-soft font-medium">{label}<Info text={info} /></div>
      <div className="font-display text-[28px] leading-none font-bold tracking-tight">{value}</div>
      {sub && <div className="text-[12px] text-ink-soft">{sub}</div>}
      {delta}
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

function Card({ title, info, right, children, className = "" }: { title: string; info?: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`bg-raised border border-line rounded-[12px] flex flex-col min-w-0 ${className}`}>
      <div className="px-5 pt-4 pb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-[14px] font-semibold">{title}{info && <Info text={info} />}</div>
        {right}
      </div>
      <div className="px-5 pb-5 flex-1 min-w-0">{children}</div>
    </section>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-[11.5px] text-ink-soft">
      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: IN_COLOR }} />Inbound</span>
      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: OUT_COLOR }} />Outbound</span>
    </div>
  );
}

/** Horizontal single-hue bars with value + share. Used for funnel, lead mix and not-connected reasons. */
function BarList({ items, max, color = ONE_HUE }: { items: { label: React.ReactNode; value: number; note?: string; color?: string }[]; max: number; color?: string }) {
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((it, i) => (
        <div key={i} className="grid grid-cols-[132px_1fr_auto] items-center gap-3 text-[12.5px]">
          <div className="text-ink truncate">{it.label}</div>
          <div className="h-[14px] bg-paper rounded-[4px] overflow-hidden" title={`${it.value}`}>
            <div className="h-full rounded-r-[4px]" style={{ width: `${max ? Math.max(it.value ? 2 : 0, (it.value / max) * 100) : 0}%`, background: it.color || color }} />
          </div>
          <div className="text-right tabular-nums whitespace-nowrap"><span className="font-semibold">{n(it.value)}</span>{it.note && <span className="text-ink-soft ml-1.5">{it.note}</span>}</div>
        </div>
      ))}
    </div>
  );
}

/** Stacked columns inbound/outbound with a 2px surface gap and a hover tooltip. */
function StackedColumns({ data, labelOf, height = 170 }: { data: { key: string; inbound: number; outbound: number; connected: number }[]; labelOf: (k: string, i: number) => string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.inbound + d.outbound));
  const ticks = [0, Math.ceil(max / 2), max];
  const every = data.length > 16 ? 3 : data.length > 10 ? 2 : 1;
  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="flex flex-col justify-between text-[10.5px] text-ink-soft tabular-nums pb-5" style={{ height }}>
          {[...ticks].reverse().map((t) => <span key={t}>{t}</span>)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="relative border-b border-line" style={{ height: height - 20 }}>
            {ticks.slice(1).map((t) => <div key={t} className="absolute left-0 right-0 border-t border-line/60" style={{ bottom: `${(t / max) * 100}%` }} />)}
            <div className="absolute inset-0 flex items-end gap-[3px]">
              {data.map((d, i) => {
                const tot = d.inbound + d.outbound;
                const hIn = (d.inbound / max) * 100, hOut = (d.outbound / max) * 100;
                return (
                  <div key={d.key} className="flex-1 h-full flex flex-col justify-end items-center cursor-default"
                    onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                    <div className="w-full max-w-[24px] flex flex-col justify-end h-full" style={{ opacity: hover === null || hover === i ? 1 : 0.45 }}>
                      {d.outbound > 0 && <div style={{ height: `${hOut}%`, background: OUT_COLOR, borderRadius: "4px 4px 0 0", marginBottom: d.inbound > 0 ? 2 : 0 }} />}
                      {d.inbound > 0 && <div style={{ height: `${hIn}%`, background: IN_COLOR, borderRadius: d.outbound > 0 ? 0 : "4px 4px 0 0" }} />}
                      {tot === 0 && <div className="h-[2px] bg-line rounded" />}
                    </div>
                  </div>
                );
              })}
            </div>
            {hover !== null && (
              <div className="absolute z-20 -top-2 pointer-events-none bg-ink text-white rounded-lg px-3 py-2 text-[11.5px] shadow-lg whitespace-nowrap"
                style={{ left: `${Math.min(80, Math.max(0, (hover / data.length) * 100 - 6))}%` }}>
                <div className="font-semibold mb-0.5">{labelOf(data[hover].key, hover)}</div>
                <div>Inbound {data[hover].inbound} · Outbound {data[hover].outbound}</div>
                <div className="text-white/70">Connected {data[hover].connected} ({share(data[hover].connected, data[hover].inbound + data[hover].outbound)})</div>
              </div>
            )}
          </div>
          <div className="flex gap-[3px] mt-1.5">
            {data.map((d, i) => <div key={d.key} className="flex-1 text-center text-[10px] text-ink-soft truncate">{i % every === 0 ? labelOf(d.key, i) : ""}</div>)}
          </div>
        </div>
      </div>
    </div>
  );
}

function LeadRow({ c, onOpen }: { c: Lean; onOpen: (id: string) => void }) {
  return (
    <button onClick={() => onOpen(c.id)} className="w-full text-left flex items-start gap-3 py-3 border-b border-line last:border-b-0 hover:bg-paper -mx-2 px-2 rounded-md">
      <span className="mt-1 w-2 h-2 rounded-full shrink-0" style={{ background: c.direction === "inbound" ? IN_COLOR : OUT_COLOR }} title={c.direction} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13.5px] font-semibold truncate">{c.caller_name || fmtPhone(c.caller_phone)}</span>
          <StatusPill label={LEAD_LABEL[c.lead_status]} tone={LEAD_TONE[c.lead_status]} />
        </div>
        <div className="text-[12px] text-ink-soft truncate">{c.lead_reason || c.summary || "—"}</div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-[12px] text-ink-soft">{fmtTimeAgo(c.created_at)}</div>
        <div className="text-[11.5px] text-ink-soft tabular-nums">{fmtDuration(c.duration_seconds)}</div>
      </div>
    </button>
  );
}

/* ───────── page ───────── */
export default function DashboardPage() {
  const [range, setRange] = useState("today");
  const [dir, setDir] = useState<"all" | "inbound" | "outbound">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<Dash | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showDefs, setShowDefs] = useState(false);
  const [selected, setSelected] = useState<CallRow | null>(null);

  async function load() {
    if (range === "custom" && (!from || !to)) return;
    setLoading(true);
    try {
      const q = new URLSearchParams({ range, direction: dir });
      if (range === "custom") { q.set("from", from); q.set("to", to); }
      const res = await fetch(`/api/dashboard?${q}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load");
      setData(json); setError("");
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [range, dir, from, to]);

  async function syncNow() {
    setSyncing(true);
    try { await fetch("/api/calls/sync", { method: "POST" }); await load(); } finally { setSyncing(false); }
  }
  async function openCall(id: string) {
    const res = await fetch(`/api/calls/${id}`);
    const j = await res.json();
    if (res.ok) setSelected(j.call);
  }

  const k = data?.kpis, p = data?.previousKpis;
  const singleDay = (data?.range.days ?? 1) <= 1;
  const chartData = useMemo(() => {
    if (!data) return [];
    if (singleDay) {
      // Trim to the active window (first→last hour with calls, min 9am–9pm) so the columns stay readable.
      const active = data.hourly.map((h, i) => (h.inbound + h.outbound ? i : -1)).filter((i) => i >= 0);
      const lo = Math.min(9, ...(active.length ? active : [9])), hi = Math.max(21, ...(active.length ? active : [21]));
      return data.hourly.slice(lo, hi + 1).map((h) => ({ key: String(h.hour), inbound: h.inbound, outbound: h.outbound, connected: h.connected }));
    }
    return data.trend.map((d) => ({ key: d.date, inbound: d.inbound, outbound: d.outbound, connected: d.connected }));
  }, [data, singleDay]);
  const hourLabel = (key: string) => { const h = Number(key); return `${((h + 11) % 12) + 1}${h < 12 ? "a" : "p"}`; };
  const dayLabel = (key: string) => new Date(`${key}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

  const dirLink = (extra = "") => (dir === "outbound" ? `/outbound${extra}` : `/inbound${extra}`);
  const subtitle = data ? `${data.range.label} · ${new Date(data.range.from).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}${data.range.days > 1 ? ` – ${new Date(Date.parse(data.range.to) - 1).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}` : ""}` : "";

  const funnel = k ? [
    { label: dir === "inbound" ? "Received" : dir === "outbound" ? "Dialled" : "All calls", value: k.total },
    { label: "Connected", value: k.connected, note: share(k.connected, k.total) },
    { label: "Engaged (≥30s)", value: k.engaged, note: share(k.engaged, k.connected) },
    { label: "Interested", value: k.interested, note: share(k.interested, k.connected) },
    { label: "Hot", value: k.hot, note: share(k.hot, k.connected) },
    { label: "Ready to close", value: k.readyToClose, note: share(k.readyToClose, k.connected) },
  ] : [];
  const mixTotal = data ? data.leadMix.reduce((a, m) => a + m.count, 0) : 0;
  const empty = data && data.kpis.total === 0;

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar active="overview" />
      <main className="flex-1 min-w-0 box-border px-6 py-8 lg:px-10 flex flex-col gap-5">
        <SetupChecklist />
        {/* Header + filters */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-[26px] font-semibold m-0">Dashboard</h1>
            <div className="text-[13px] text-ink-soft mt-1">{subtitle || "Loading…"}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11.5px] text-ink-soft">{data ? `Updated ${fmtClock(data.generatedAt)}` : ""}</span>
            <button onClick={syncNow} disabled={syncing} className="text-[12.5px] font-semibold border border-line bg-raised rounded-lg px-3 py-1.5 hover:border-ink-soft disabled:opacity-50">
              {syncing ? "Syncing…" : "↻ Sync calls"}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 bg-raised border border-line rounded-[10px] p-1">
            {DIRS.map((d) => (
              <button key={d.key} onClick={() => setDir(d.key)}
                className={`text-[13px] font-semibold px-3.5 py-1.5 rounded-md flex items-center gap-1.5 ${dir === d.key ? "bg-ink text-white" : "text-ink-soft hover:text-ink"}`}>
                {d.key !== "all" && <span className="w-2 h-2 rounded-full" style={{ background: d.key === "inbound" ? IN_COLOR : OUT_COLOR }} />}
                {d.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1 bg-raised border border-line rounded-[10px] p-1">
            {RANGES.map((r) => (
              <button key={r.key} onClick={() => setRange(r.key)}
                className={`text-[12.5px] font-semibold px-3 py-1.5 rounded-md ${range === r.key ? "bg-signal text-white" : "text-ink-soft hover:text-ink"}`}>{r.label}</button>
            ))}
          </div>
          {range === "custom" && (
            <div className="flex items-center gap-1.5 text-[12.5px]">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border border-line rounded-md px-2 py-1.5 bg-raised" />
              <span className="text-ink-soft">to</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border border-line rounded-md px-2 py-1.5 bg-raised" />
            </div>
          )}
          {data && <span className="text-[12px] text-ink-soft">▲▼ compared with {data.previous.label}</span>}
          {loading && <span className="text-[12px] text-ink-soft">Loading…</span>}
        </div>

        {error && <div className="text-[12.5px] text-miss bg-miss-tint rounded-lg px-3 py-2.5">{error}</div>}

        {empty && (
          <div className="border border-dashed border-line rounded-[12px] bg-raised px-5 py-4 text-[13px] text-ink-soft">
            No calls in this period yet. New calls show up here automatically — make sure your employee is
            published on the <Link href="/employees" className="text-signal font-semibold">My Employees</Link> page, or try a longer range.
          </div>
        )}

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <Tile label={dir === "outbound" ? "Numbers dialled" : dir === "inbound" ? "Calls received" : "Total calls"} value={k ? n(k.total) : "—"}
            sub={k && dir === "all" ? <>{n(k.received)} in · {n(k.dialled)} out</> : undefined}
            info="Every call in the selected period. Outbound = every number the agent dialled, answered or not. Inbound = every call that reached the agent."
            delta={k && p && <Delta cur={k.total} prev={p.total} />} href={dirLink()} />
          <Tile label="Connected (lifted)" value={k ? n(k.connected) : "—"} sub={k ? <>{k.connectRate}% connectivity</> : undefined}
            info="Answered with talk time above 0s. Connectivity % = connected ÷ all calls."
            delta={k && p && <Delta cur={k.connectRate} prev={p.connectRate} suffix=" pts" />} />
          <Tile label={dir === "inbound" ? "Not connected" : "DNP (did not pick)"} value={k ? n(dir === "inbound" ? k.total - k.connected : k.dnp) : "—"}
            sub={k ? <>{share(dir === "inbound" ? k.total - k.connected : k.dnp, dir === "inbound" ? k.total : k.dialled || k.total)} of {dir === "inbound" ? "received" : "dialled"}</> : undefined}
            info="Outbound attempts that were busy, unanswered, rejected, went to voicemail or failed to dial. Retry these."
            delta={k && p && <Delta cur={k.dnp} prev={p.dnp} invert />} href={dirLink("?filter=missed")} />
          <Tile label="Interested leads" value={k ? n(k.interested) : "—"} sub={k ? <>{k.leadRate}% of connected</> : undefined}
            info="Warm + Hot + Ready to close. Lead rate = interested ÷ connected."
            delta={k && p && <Delta cur={k.interested} prev={p.interested} />} href={dirLink("?filter=warm")} />
          <Tile label="Hot leads" value={k ? n(k.hot) : "—"} sub={k ? <>{n(k.readyToClose)} ready to close</> : undefined}
            info="Asked a buying question (fees, batch, price, timing…) and talked 60s+, or gave a commitment signal (Ready to close)."
            delta={k && p && <Delta cur={k.hot} prev={p.hot} />} href={dirLink("?filter=hot")} />
          <Tile label="Talk time" value={k ? talk(k.talkSeconds) : "—"} sub={k ? <>avg {fmtDuration(k.avgTalk)} per connected call</> : undefined}
            info="Total minutes of connected conversation. Average = talk time ÷ connected calls."
            delta={k && p && <Delta cur={Math.round(k.talkSeconds / 60)} prev={Math.round(p.talkSeconds / 60)} suffix=" min" />} />
        </div>

        {/* Funnel + lead mix */}
        <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_1fr] gap-4">
          <Card title="Conversion funnel" info="Each step is a subset of the one above. Percentages after Connected are of connected calls, so a poor dial list doesn't hide a good script.">
            <BarList items={funnel} max={k?.total || 0} />
            {k && k.followUps > 0 && <div className="mt-4 text-[12.5px] text-ink-soft"><span className="font-semibold text-ink">{n(k.followUps)}</span> calls need a follow-up from your sales team.</div>}
          </Card>
          <Card title="Lead quality" info="Every call gets exactly one label. Open any call to see the rule that assigned it." right={<span className="text-[11.5px] text-ink-soft">{n(mixTotal)} calls</span>}>
            <BarList max={Math.max(1, ...(data?.leadMix.map((m) => m.count) || [1]))}
              items={(data?.leadMix || []).filter((m) => m.status !== "new" || m.count > 0).map((m) => ({
                label: <StatusPill label={m.status === "no_answer" ? "DNP / no answer" : LEAD_LABEL[m.status]} tone={LEAD_TONE[m.status]} />,
                value: m.count, note: share(m.count, mixTotal),
                color: m.status === "no_answer" || m.status === "not_interested" || m.status === "new" ? "#8a8f8a" : undefined,
              }))} />
          </Card>
        </div>

        {/* Activity + not connected */}
        <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-4">
          <Card title={singleDay ? "Calls by hour" : "Calls by day"} info="Stacked: inbound (green) and outbound (blue). Hover a column for connected counts." right={<Legend />}>
            {data ? <StackedColumns data={chartData} labelOf={singleDay ? hourLabel : dayLabel} /> : <div className="h-[170px]" />}
          </Card>
          <Card title="Why calls didn't connect" info="The reason the phone network reported when a call wasn't answered. Busy and no-answer numbers are worth retrying at a different hour.">
            {data && data.notConnected.length ? (
              <BarList items={data.notConnected.map((r) => ({ label: r.reason, value: r.count, note: share(r.count, data.kpis.total) }))} max={Math.max(...data.notConnected.map((r) => r.count))} color="#8a8f8a" />
            ) : data ? <div className="text-[13px] text-ink-soft py-6 text-center">Every call connected in this period.</div> : null}
          </Card>
        </div>

        {/* Inbound vs outbound */}
        {dir === "all" && data && (
          <Card title="Inbound vs outbound" info="The same metrics side by side, so you can see which channel is producing leads.">
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] min-w-[560px]">
                <thead><tr className="text-left text-[11.5px] text-ink-soft">
                  <th className="font-medium pb-2">Channel</th><th className="font-medium pb-2 text-right">Calls</th><th className="font-medium pb-2 text-right">Connected</th>
                  <th className="font-medium pb-2 text-right">Connectivity</th><th className="font-medium pb-2 text-right">Interested</th><th className="font-medium pb-2 text-right">Hot</th>
                  <th className="font-medium pb-2 text-right">Avg talk</th><th className="font-medium pb-2 text-right">Follow-ups</th>
                </tr></thead>
                <tbody>
                  {(["inbound", "outbound"] as const).map((ch) => {
                    const s = data.split[ch];
                    return (
                      <tr key={ch} className="border-t border-line cursor-pointer hover:bg-paper" onClick={() => setDir(ch)}>
                        <td className="py-2.5 font-semibold"><span className="inline-flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ background: ch === "inbound" ? IN_COLOR : OUT_COLOR }} />{ch === "inbound" ? "Inbound" : "Outbound"}</span></td>
                        <td className="text-right tabular-nums">{n(s.total)}</td><td className="text-right tabular-nums">{n(s.connected)}</td>
                        <td className="text-right tabular-nums">{s.connectRate}%</td><td className="text-right tabular-nums">{n(s.interested)}</td>
                        <td className="text-right tabular-nums font-semibold">{n(s.hot)}</td><td className="text-right tabular-nums">{fmtDuration(s.avgTalk)}</td>
                        <td className="text-right tabular-nums">{n(s.followUps)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Campaigns */}
        {dir !== "inbound" && (
          <Card title={`Outbound campaigns — ${data?.range.label.toLowerCase() || ""}`} info="Every outbound batch that dialled in this period. DNP = dialled but not picked. Click a row to open the campaign's full call list."
            right={<Link href="/outbound" className="text-[12.5px] font-semibold text-signal">All campaigns →</Link>}>
            {data && data.campaigns.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px] min-w-[760px]">
                  <thead><tr className="text-left text-[11.5px] text-ink-soft">
                    <th className="font-medium pb-2">Campaign</th><th className="font-medium pb-2 text-right">Dialled</th><th className="font-medium pb-2 text-right">Connected</th>
                    <th className="font-medium pb-2 text-right">DNP</th><th className="font-medium pb-2 text-right">Hot</th><th className="font-medium pb-2 text-right">Warm</th>
                    <th className="font-medium pb-2 text-right">Follow-ups</th><th className="font-medium pb-2 text-right">Not int.</th><th className="font-medium pb-2 text-right">Talk time</th><th className="font-medium pb-2 text-right">Last call</th>
                  </tr></thead>
                  <tbody>
                    {data.campaigns.map((c) => (
                      <tr key={c.id} className="border-t border-line hover:bg-paper">
                        <td className="py-2.5 pr-3"><Link href={`/outbound?campaign=${encodeURIComponent(c.id)}`} className="font-semibold hover:text-signal">{c.name}</Link>
                          {c.totalContacts ? <div className="text-[11.5px] text-ink-soft">{n(c.dialled)} of {n(c.totalContacts)} contacts</div> : null}</td>
                        <td className="text-right tabular-nums">{n(c.dialled)}</td>
                        <td className="text-right tabular-nums">{n(c.connected)} <span className="text-ink-soft">({c.connectRate}%)</span></td>
                        <td className="text-right tabular-nums">{n(c.dnp)}</td><td className="text-right tabular-nums font-semibold">{n(c.hot)}</td>
                        <td className="text-right tabular-nums">{n(c.warm)}</td><td className="text-right tabular-nums">{n(c.followUps)}</td>
                        <td className="text-right tabular-nums">{n(c.notInterested)}</td><td className="text-right tabular-nums">{talk(c.talkSeconds)}</td>
                        <td className="text-right text-ink-soft whitespace-nowrap">{c.lastCallAt ? `${fmtDate(c.lastCallAt)} ${fmtClock(c.lastCallAt)}` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : data ? <div className="text-[13px] text-ink-soft py-6 text-center">No outbound campaigns ran in this period.</div> : null}
          </Card>
        )}

        {/* Action lists */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Card title="Hot leads — call these now" info="Ready to close first, then hot, newest first. Each line shows why RANA marked it hot." right={<span className="text-[11.5px] text-ink-soft">{k ? n(k.hot) : ""}</span>}>
            {data?.hotLeads.length ? data.hotLeads.map((c) => <LeadRow key={c.id} c={c} onOpen={openCall} />)
              : data ? <div className="text-[13px] text-ink-soft py-6 text-center">No hot leads in this period yet.</div> : null}
          </Card>
          <Card title="Follow-ups requested" info="Callers who asked to be called back, excluding the hot leads listed alongside.">
            {data?.followUps.length ? data.followUps.map((c) => <LeadRow key={c.id} c={c} onOpen={openCall} />)
              : data ? <div className="text-[13px] text-ink-soft py-6 text-center">No pending follow-ups.</div> : null}
          </Card>
        </div>

        {/* Definitions */}
        <section className="bg-raised border border-line rounded-[12px]">
          <button onClick={() => setShowDefs((v) => !v)} className="w-full flex items-center justify-between px-5 py-3.5 text-[14px] font-semibold">
            How RANA counts every number
            <span className="text-ink-soft text-[12.5px] font-normal">{showDefs ? "Hide" : "Show definitions"}</span>
          </button>
          {showDefs && (
            <div className="px-5 pb-5 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
              {(data?.definitions || []).map((d) => (
                <div key={d.term} className="text-[12.5px] leading-relaxed"><span className="font-semibold">{d.term}.</span> <span className="text-ink-soft">{d.rule}</span></div>
              ))}
            </div>
          )}
        </section>
      </main>
      <CallDrawer call={selected} onClose={() => setSelected(null)} onUpdated={(c) => { setSelected(c); load(); }} />
    </div>
  );
}
