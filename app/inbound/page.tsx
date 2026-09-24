"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import StatusPill from "@/components/StatusPill";
import CallDrawer from "@/components/CallDrawer";
import type { CallRow, LeadStatus } from "@/lib/calls";
import { LEAD_LABEL, LEAD_TONE, fmtDuration, fmtPhone, fmtClock, fmtDate } from "@/lib/format";

type Filter = "all" | "hot" | "warm" | "missed";
const filters: { key: Filter; label: string }[] = [
  { key: "all", label: "All" }, { key: "hot", label: "Hot" }, { key: "warm", label: "Warm" }, { key: "missed", label: "Missed" },
];
const matches = (c: CallRow, f: Filter) =>
  f === "all" ? true
  : f === "hot" ? (c.lead_status === "hot" || c.lead_status === "ready_to_close")
  : f === "warm" ? c.lead_status === "warm"
  : (c.lead_status === "no_answer" || c.duration_seconds === 0);

export default function InboundPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [calls, setCalls] = useState<CallRow[] | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<CallRow | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");

  async function syncNow() {
    setSyncing(true); setSyncMsg("");
    try {
      const res = await fetch("/api/calls/sync", { method: "POST" });
      const j = await res.json();
      if (!res.ok && !j.saved) throw new Error(j.errors?.[0] || j.error || "Sync failed");
      setSyncMsg(j.agents === 0 ? "No published Cartesia agent yet — publish a script first." : `Synced — ${j.saved} new or updated call${j.saved === 1 ? "" : "s"}.`);
      await load();
    } catch (e: any) { setSyncMsg(e.message); }
    finally { setSyncing(false); }
  }

  async function load() {
    try {
      const res = await fetch("/api/calls?direction=inbound&limit=200", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load");
      setCalls(json.calls); setError("");
    } catch (e: any) { setError(e.message); }
  }
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);

  const all = calls ?? [];
  const shown = all.filter((c) => matches(c, filter));
  const counts = Object.fromEntries(filters.map((f) => [f.key, all.filter((c) => matches(c, f.key)).length])) as Record<Filter, number>;

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar active="inbound" />
      <main className="flex-1 box-border p-11 flex flex-col gap-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-[26px] font-semibold m-0">Inbound</h1>
            <div className="text-[13px] text-ink-soft mt-1">Every call answered by your AI agent. Click a row for the transcript and captured details.</div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <button onClick={syncNow} disabled={syncing}
              className="text-[12.5px] font-semibold border border-line bg-raised rounded-lg px-3.5 py-2 hover:border-ink-soft disabled:opacity-50 whitespace-nowrap">
              {syncing ? "Syncing…" : "↻ Sync calls"}
            </button>
            {syncMsg && <div className="text-[11.5px] text-ink-soft">{syncMsg}</div>}
          </div>
        </div>

        <div className="flex gap-1 bg-raised border border-line rounded-[9px] p-1 w-fit">
          {filters.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`text-[13.5px] font-semibold px-3.5 py-2 rounded-md ${filter === f.key ? "bg-ink text-white" : "text-ink-soft"}`}>
              {f.label} <span className="opacity-60">{counts[f.key]}</span>
            </button>
          ))}
        </div>

        {error && <div className="text-[12.5px] text-miss bg-miss-tint rounded-lg px-3 py-2.5">{error}</div>}

        <div className="bg-raised border border-line rounded-[10px] flex-1 overflow-hidden flex flex-col">
          <div className="flex px-5 py-3 border-b border-line text-[11.5px] font-semibold text-ink-soft">
            <div className="w-[200px]">Caller</div>
            <div className="flex-1">Summary</div>
            <div className="w-20">Duration</div>
            <div className="w-[130px]">Lead</div>
            <div className="w-[110px] text-right">When</div>
          </div>
          <div className="overflow-y-auto flex-1">
            {calls === null && !error && <div className="p-6 text-[13px] text-ink-soft">Loading…</div>}
            {calls !== null && shown.length === 0 && (
              <div className="p-8 text-center text-[13.5px] text-ink-soft">No inbound calls {filter !== "all" ? "in this filter" : "yet"}.</div>
            )}
            {shown.map((c) => (
              <button key={c.id} onClick={() => setSelected(c)} className="w-full text-left flex items-center px-5 py-3.5 border-b border-line last:border-b-0 hover:bg-paper">
                <div className="w-[200px] pr-3">
                  <div className="text-[13.5px] font-semibold truncate">{c.caller_name || "Unknown caller"}</div>
                  <div className="text-xs text-ink-soft">{fmtPhone(c.caller_phone)}</div>
                </div>
                <div className="flex-1 min-w-0 text-[13px] text-ink-soft truncate pr-3">{c.summary || "—"}</div>
                <div className="w-20 text-[13px] text-ink-soft">{fmtDuration(c.duration_seconds)}</div>
                <div className="w-[130px]"><StatusPill label={LEAD_LABEL[c.lead_status as LeadStatus]} tone={LEAD_TONE[c.lead_status as LeadStatus]} /></div>
                <div className="w-[110px] text-right text-xs text-ink-soft">{fmtDate(c.created_at)} {fmtClock(c.created_at)}</div>
              </button>
            ))}
          </div>
        </div>
      </main>
      <CallDrawer call={selected} onClose={() => setSelected(null)} onUpdated={(u) => { setSelected(u); setCalls((cs) => (cs ?? []).map((c) => (c.id === u.id ? u : c))); }} />
    </div>
  );
}
