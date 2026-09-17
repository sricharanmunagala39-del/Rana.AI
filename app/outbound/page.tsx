"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import StatusPill, { PillTone } from "@/components/StatusPill";
import { Campaign, getCampaigns } from "@/lib/storage";

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
  hot: string;
  rate: string;
};

const demoByTab: Record<Tab, Row[]> = {
  active: [
    { key: "d1", name: "NEET PG Reactivation — Sept batch", meta: "500 contacts · Mon–Fri, 9am–6pm", status: "Active", tone: "signal", progressPct: "68%", progressLabel: "340 of 500 called", connected: "208", hot: "31", rate: "2 / sec" },
    { key: "d2", name: "Vizag ASC — Drop-off follow-up", meta: "140 contacts · Mon–Sat, 10am–7pm", status: "Active", tone: "signal", progressPct: "22%", progressLabel: "31 of 140 called", connected: "17", hot: "4", rate: "1.5 / sec" },
  ],
  scheduled: [
    { key: "d3", name: "Vijayawada INDRA — New batch launch", meta: "260 contacts · Starts tomorrow, 9:00am", status: "Scheduled", tone: "warm", progressPct: "0%", progressLabel: "Not started", connected: "—", hot: "—", rate: "2 / sec" },
  ],
  completed: [
    { key: "d4", name: "August Inquiry Re-engagement", meta: "812 contacts · Completed 4 Sept", status: "Completed", tone: "neutral", progressPct: "100%", progressLabel: "812 of 812 called", connected: "471", hot: "94", rate: "2 / sec" },
    { key: "d5", name: "Hyderabad ASC — Fee reminder", meta: "95 contacts · Completed 28 Aug", status: "Completed", tone: "neutral", progressPct: "100%", progressLabel: "95 of 95 called", connected: "61", hot: "9", rate: "1 / sec" },
    { key: "d6", name: "Q2 Doctor Outreach", meta: "430 contacts · Completed 19 Aug", status: "Completed", tone: "neutral", progressPct: "100%", progressLabel: "430 of 430 called", connected: "260", hot: "38", rate: "2 / sec" },
    { key: "d7", name: "Vizag ASC — Trial class push", meta: "180 contacts · Completed 11 Aug", status: "Completed", tone: "neutral", progressPct: "100%", progressLabel: "180 of 180 called", connected: "112", hot: "15", rate: "1.5 / sec" },
  ],
};

function campaignToRow(c: Campaign): Row {
  return {
    key: c.id,
    name: c.name,
    meta: `${c.fileName || "Contact list"} (${c.fileSizeLabel || "—"}) · ${c.scriptLabel} · ${c.days.join(", ")}, ${c.windowStart}–${c.windowEnd}`,
    status: "Scheduled",
    tone: "warm",
    progressPct: "0%",
    progressLabel: `Starts ${c.startDate || "soon"}`,
    connected: "—",
    hot: "—",
    rate: c.dialRate,
  };
}

export default function OutboundPage() {
  const [tab, setTab] = useState<Tab>("active");
  const [liveCampaigns, setLiveCampaigns] = useState<Campaign[]>([]);

  useEffect(() => {
    setLiveCampaigns(getCampaigns());
  }, []);

  const rowsByTab: Record<Tab, Row[]> = {
    active: demoByTab.active,
    scheduled: [...liveCampaigns.map(campaignToRow), ...demoByTab.scheduled],
    completed: demoByTab.completed,
  };

  const tabCounts: Record<Tab, number> = {
    active: rowsByTab.active.length,
    scheduled: rowsByTab.scheduled.length,
    completed: rowsByTab.completed.length,
  };

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar active="outbound" />

      <main className="flex-1 box-border p-11 flex flex-col gap-5.5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display text-[26px] font-semibold m-0">Outbound</h1>
            <div className="text-[13px] text-ink-soft mt-1">Call your lead lists automatically</div>
          </div>
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

        <div className="overflow-y-auto flex-1 flex flex-col gap-3">
          {rowsByTab[tab].map((c) => (
            <div key={c.key} className="bg-raised border border-line rounded-[10px] px-5.5 py-5 flex flex-col gap-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[15px] font-semibold">{c.name}</div>
                  <div className="text-[12.5px] text-ink-soft mt-0.5">{c.meta}</div>
                </div>
                <StatusPill label={c.status} tone={c.tone} />
              </div>
              <div className="flex items-center gap-5">
                <div className="flex-1 h-1.5 rounded bg-[#E9EBE5] overflow-hidden">
                  <div className="h-full bg-signal rounded" style={{ width: c.progressPct }} />
                </div>
                <span className="text-[12.5px] text-ink-soft whitespace-nowrap">{c.progressLabel}</span>
              </div>
              <div className="flex gap-7">
                <div>
                  <div className="text-[11.5px] text-ink-soft">Connected</div>
                  <div className="text-[15px] font-semibold mt-0.5">{c.connected}</div>
                </div>
                <div>
                  <div className="text-[11.5px] text-ink-soft">Hot leads</div>
                  <div className="text-[15px] font-semibold mt-0.5 text-hot">{c.hot}</div>
                </div>
                <div>
                  <div className="text-[11.5px] text-ink-soft">Dial rate</div>
                  <div className="text-[15px] font-semibold mt-0.5">{c.rate}</div>
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
