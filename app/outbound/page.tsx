"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import StatusPill, { PillTone } from "@/components/StatusPill";
import { Campaign, CampaignStats, getCampaigns, updateCampaign } from "@/lib/storage";

type Tab = "active" | "scheduled" | "completed";

type Row = {
  key: string;
  name: string;
  meta: string;
  status: string;
  tone: PillTone;
  progressPct: string;
  progressLabel: string;
  connected: string;
  connectRate: string;
  avgDuration: string;
  isLive: boolean;
};

/* ---------- demo rows (replace once Sarvam live data flows) ---------- */
const demoByTab: Record<Tab, Row[]> = {
  active: [
    {
      key: "d1", name: "NEET PG Reactivation — Sept batch",
      meta: "500 contacts · Mon–Fri, 9am–6pm", status: "Active", tone: "signal",
      progressPct: "68%", progressLabel: "340 of 500 called",
      connected: "208", connectRate: "61%", avgDuration: "2m 14s", isLive: false,
    },
    {
      key: "d2", name: "Vizag ASC — Drop-off follow-up",
      meta: "140 contacts · Mon–Sat, 10am–7pm", status: "Active", tone: "signal",
      progressPct: "22%", progressLabel: "31 of 140 called",
      connected: "17", connectRate: "55%", avgDuration: "1m 48s", isLive: false,
    },
  ],
  scheduled: [
    {
      key: "d3", name: "Vijayawada INDRA — New batch launch",
      meta: "260 contacts · Starts tomorrow, 9:00am", status: "Scheduled", tone: "warm",
      progressPct: "0%", progressLabel: "Not started",
      connected: "—", connectRate: "—", avgDuration: "—", isLive: false,
    },
  ],
  completed: [
    {
      key: "d4", name: "August Inquiry Re-engagement",
      meta: "812 contacts · Completed 4 Sept", status: "Completed", tone: "neutral",
      progressPct: "100%", progressLabel: "812 of 812 called",
      connected: "471", connectRate: "58%", avgDuration: "2m 05s", isLive: false,
    },
    {
      key: "d5", name: "Hyderabad ASC — Fee reminder",
      meta: "95 contacts · Completed 28 Aug", status: "Completed", tone: "neutral",
      progressPct: "100%", progressLabel: "95 of 95 called",
      connected: "61", connectRate: "64%", avgDuration: "1m 52s", isLive: false,
    },
  ],
};

/* ---------- helpers ---------- */
function fmtDuration(secs: number): string {
  if (!secs) return "—";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function campaignToRow(c: Campaign): Row {
  const statusMap: Record<Campaign["status"], { label: string; tone: PillTone }> = {
    Scheduled: { label: "Scheduled",  tone: "warm" },
    Active:    { label: "Active",     tone: "signal" },
    Launching: { label: "Launching…", tone: "warm" },
    Error:     { label: "Error",      tone: "miss" },
  };
  const { label: statusLabel, tone } = statusMap[c.status] ?? { label: c.status, tone: "neutral" as PillTone };
  const idHint    = c.sarvamCampaignId ? ` · ID: ${c.sarvamCampaignId.slice(0, 8)}…` : "";
  const errorHint = c.sarvamError ? ` · ${c.sarvamError.slice(0, 60)}` : "";

  const st = c.stats;
  return {
    key: c.id,
    name: c.name,
    meta: `${c.contactCountLabel} · ${c.scriptLabel} · ${c.days.join(", ")}, ${c.windowStart}–${c.windowEnd}${idHint}${errorHint}`,
    status: statusLabel,
    tone,
    progressPct: st ? `${Math.min(100, Math.round((st.total / parseInt(c.contactCountLabel)) * 100))}%` : "0%",
    progressLabel: st ? `${st.total} attempts · ${st.connected} connected` : `Starts ${c.startDate || "soon"}`,
    connected: st ? String(st.connected) : "—",
    connectRate: st ? `${st.connectRate}%` : "—",
    avgDuration: st ? fmtDuration(st.avgDuration) : "—",
    isLive: !!c.sarvamCampaignId,
  };
}

/* ------------------------------------------------------------------ */
export default function OutboundPage() {
  const [tab, setTab] = useState<Tab>("scheduled");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* load from localStorage on mount */
  useEffect(() => {
    setCampaigns(getCampaigns());
  }, []);

  /* fetch stats for all campaigns that have a sarvamCampaignId */
  async function fetchStats(camp: Campaign[]): Promise<void> {
    const withId = camp.filter(c => c.sarvamCampaignId);
    if (!withId.length) return;

    await Promise.all(withId.map(async (c) => {
      try {
        const r = await fetch(`/api/campaign-stats?campaignId=${encodeURIComponent(c.sarvamCampaignId!)}`);
        if (!r.ok) return;
        const stats: CampaignStats = await r.json();
        updateCampaign(c.id, { stats });
      } catch {
        // silently ignore per-campaign fetch failures
      }
    }));

    /* re-read from localStorage after all updates */
    setCampaigns(getCampaigns());
  }

  /* manual refresh */
  async function handleRefresh() {
    setRefreshing(true);
    await fetchStats(campaigns);
    setRefreshing(false);
  }

  /* auto-poll every 2 min */
  useEffect(() => {
    if (campaigns.length === 0) return;
    fetchStats(campaigns); // immediate on load
    pollRef.current = setInterval(() => fetchStats(getCampaigns()), 2 * 60 * 1000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaigns.length]);

  const liveRows  = campaigns.map(campaignToRow);
  const rowsByTab: Record<Tab, Row[]> = {
    active:    [...demoByTab.active, ...liveRows.filter(r => r.status === "Active")],
    scheduled: [...liveRows.filter(r => r.status !== "Active" && r.status !== "Completed"), ...demoByTab.scheduled],
    completed: demoByTab.completed,
  };

  const tabCounts: Record<Tab, number> = {
    active:    rowsByTab.active.length,
    scheduled: rowsByTab.scheduled.length,
    completed: rowsByTab.completed.length,
  };

  const hasLive = campaigns.some(c => !!c.sarvamCampaignId);

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar active="outbound" />

      <main className="flex-1 box-border p-11 flex flex-col gap-5.5">
        {/* header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display text-[26px] font-semibold m-0">Outbound</h1>
            <div className="text-[13px] text-ink-soft mt-1">Call your lead lists automatically</div>
          </div>
          <div className="flex items-center gap-3">
            {hasLive && (
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="text-[13px] text-ink-soft border border-line rounded-lg px-3.5 py-2 flex items-center gap-1.5 hover:bg-raised disabled:opacity-50"
              >
                <svg
                  width="13" height="13" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"
                  className={refreshing ? "animate-spin" : ""}
                >
                  <path d="M23 4v6h-6" />
                  <path d="M1 20v-6h6" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
                {refreshing ? "Refreshing…" : "Refresh stats"}
              </button>
            )}
            <Link
              href="/outbound/new"
              className="bg-ink text-white rounded-lg px-4.5 py-2.5 text-[13.5px] font-semibold flex items-center gap-2"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Start a campaign
            </Link>
          </div>
        </div>

        {/* tabs */}
        <div className="flex gap-1 bg-raised border border-line rounded-[9px] p-1 w-fit">
          {(["active", "scheduled", "completed"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-[13.5px] font-semibold px-3.5 py-2 rounded-md capitalize ${
                tab === t ? "bg-ink text-white" : "text-ink-soft"
              }`}
            >
              {t} <span className="opacity-60">{tabCounts[t]}</span>
            </button>
          ))}
        </div>

        {/* campaign cards */}
        <div className="overflow-y-auto flex-1 flex flex-col gap-3">
          {rowsByTab[tab].map((c) => (
            <div key={c.key} className="bg-raised border border-line rounded-[10px] px-5.5 py-5 flex flex-col gap-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="text-[15px] font-semibold">{c.name}</div>
                    {c.isLive && (
                      <span className="text-[10px] font-semibold text-signal bg-signal-tint rounded px-1.5 py-0.5 leading-none">
                        LIVE
                      </span>
                    )}
                  </div>
                  <div className="text-[12.5px] text-ink-soft mt-0.5">{c.meta}</div>
                </div>
                <StatusPill label={c.status} tone={c.tone} />
              </div>

              {/* progress bar */}
              <div className="flex items-center gap-5">
                <div className="flex-1 h-1.5 rounded bg-[#E9EBE5] overflow-hidden">
                  <div className="h-full bg-signal rounded" style={{ width: c.progressPct }} />
                </div>
                <span className="text-[12.5px] text-ink-soft whitespace-nowrap">{c.progressLabel}</span>
              </div>

              {/* stats */}
              <div className="flex gap-7">
                <div>
                  <div className="text-[11.5px] text-ink-soft">Connected</div>
                  <div className="text-[15px] font-semibold mt-0.5">{c.connected}</div>
                </div>
                <div>
                  <div className="text-[11.5px] text-ink-soft">Connect rate</div>
                  <div className="text-[15px] font-semibold mt-0.5 text-signal">{c.connectRate}</div>
                </div>
                <div>
                  <div className="text-[11.5px] text-ink-soft">Avg duration</div>
                  <div className="text-[15px] font-semibold mt-0.5">{c.avgDuration}</div>
                </div>
              </div>
            </div>
          ))}
          {rowsByTab[tab].length === 0 && (
            <div className="text-center text-[13px] text-ink-soft py-10">No campaigns here yet.</div>
          )}
        </div>
      </main>
    </div>
  );
}
