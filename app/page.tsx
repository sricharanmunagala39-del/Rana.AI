"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import StatusPill from "@/components/StatusPill";
import CallDrawer from "@/components/CallDrawer";
import type { CallRow } from "@/lib/calls";
import { LEAD_LABEL, LEAD_TONE, fmtDuration, fmtPhone, fmtTimeAgo } from "@/lib/format";

type Summary = {
  today: { calls: number; inbound: number; outbound: number; connected: number; connectRate: number; hot: number; readyToClose: number; avgDurationSeconds: number };
  yesterday: { calls: number };
  recent: CallRow[];
};

function DirectionIcon({ direction }: { direction: "in" | "out" }) {
  const path = direction === "in" ? "M17 7L7 17 M16 17H7V8" : "M7 17L17 7 M8 7h9v9";
  const classes = direction === "in" ? "bg-signal-tint text-signal" : "bg-warm-tint text-warm";
  return (
    <div className={`w-[30px] h-[30px] rounded-full flex items-center justify-center shrink-0 ${classes}`}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>
    </div>
  );
}

export default function OverviewPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<CallRow | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/calls/summary", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load");
      setData(json); setError("");
    } catch (e: any) { setError(e.message); }
  }
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);

  const t = data?.today;
  const delta = data ? t!.calls - data.yesterday.calls : 0;
  const stats = [
    { label: "Calls today", value: t ? String(t.calls) : "—", delta: data ? `${delta >= 0 ? "+" : ""}${delta} vs yesterday` : "", deltaColor: delta >= 0 ? "text-signal" : "text-miss" },
    { label: "Connected", value: t ? String(t.connected) : "—", delta: t ? `${t.connectRate}% connect rate` : "", deltaColor: "text-ink-soft" },
    { label: "Hot leads", value: t ? String(t.hot) : "—", delta: t ? `${t.readyToClose} ready to close` : "", deltaColor: "text-hot" },
    { label: "Avg call length", value: t ? fmtDuration(t.avgDurationSeconds) : "—", delta: t ? `${t.inbound} in · ${t.outbound} out` : "", deltaColor: "text-ink-soft" },
  ];
  const todayLabel = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" });

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar active="overview" />
      <main className="flex-1 box-border p-11 flex flex-col gap-7">
        <div className="flex items-baseline justify-between">
          <div>
            <h1 className="font-display text-[26px] font-semibold m-0">Overview</h1>
            <div className="text-[13px] text-ink-soft mt-1">{todayLabel}</div>
          </div>
          <button onClick={load} className="text-[13px] text-ink-soft border border-line rounded-lg px-3.5 py-1.5 bg-raised hover:border-ink">Refresh</button>
        </div>

        {error && <div className="text-[12.5px] text-miss bg-miss-tint rounded-lg px-3 py-2.5">{error}</div>}

        <div className="grid grid-cols-4 gap-4">
          {stats.map((s) => (
            <div key={s.label} className="bg-raised border border-line rounded-[10px] px-5 py-4 flex flex-col gap-1.5">
              <span className="text-[12.5px] text-ink-soft font-medium">{s.label}</span>
              <div className="flex items-baseline gap-1.5">
                <span className="font-display text-[30px] font-bold">{s.value}</span>
                <span className={`text-[12.5px] font-semibold ${s.deltaColor}`}>{s.delta}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-raised border border-line rounded-[10px] flex-1 flex flex-col overflow-hidden">
          <div className="px-5 py-4 border-b border-line flex items-center justify-between">
            <span className="text-[14.5px] font-semibold">Recent activity</span>
            <span className="text-[12.5px] text-ink-soft">Inbound + outbound · updates every 30s</span>
          </div>
          <div className="overflow-y-auto flex-1">
            {!data && !error && <div className="p-6 text-[13px] text-ink-soft">Loading…</div>}
            {data && data.recent.length === 0 && (
              <div className="p-8 text-center text-[13.5px] text-ink-soft">
                No calls yet. Once your agent number is live, every call will appear here automatically.
              </div>
            )}
            {data?.recent.map((c) => (
              <button key={c.id} onClick={() => setSelected(c)} className="w-full text-left flex items-center gap-4 px-5 py-3.5 border-b border-line last:border-b-0 hover:bg-paper">
                <DirectionIcon direction={c.direction === "inbound" ? "in" : "out"} />
                <div className="w-[190px] shrink-0">
                  <div className="text-[13.5px] font-semibold truncate">{c.caller_name || "Unknown caller"}</div>
                  <div className="text-xs text-ink-soft">{fmtPhone(c.caller_phone)}</div>
                </div>
                <div className="flex-1 min-w-0 text-[13px] text-ink-soft truncate">{c.summary || (c.direction === "outbound" ? "Outbound call" : "Inbound call")}</div>
                <div className="w-[70px] shrink-0 text-[13px] text-ink-soft">{fmtDuration(c.duration_seconds)}</div>
                <StatusPill label={LEAD_LABEL[c.lead_status]} tone={LEAD_TONE[c.lead_status]} />
                <span className="w-16 text-right shrink-0 text-xs text-ink-soft">{fmtTimeAgo(c.created_at)}</span>
              </button>
            ))}
          </div>
        </div>
      </main>
      <CallDrawer call={selected} onClose={() => setSelected(null)} onUpdated={(c) => { setSelected(c); load(); }} />
    </div>
  );
}
