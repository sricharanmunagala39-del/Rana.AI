"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import StatusPill, { type PillTone } from "@/components/StatusPill";
import { fmtDate, fmtClock } from "@/lib/format";
import { CAMPAIGN_STATUS as STATUS } from "@/lib/campaignUi";

type Kpis = { dialled: number; connected: number; connectRate: number; dnp: number; hot: number; warm: number; followUps: number; talkSeconds: number };
type Campaign = { id: string; name: string; status: string; total_contacts: number; created_at: string; scheduled_at: string | null; from_number: string | null; last_error: string | null; kpis: Kpis };

const TABS = [{ k: "all", l: "All" }, { k: "running", l: "Running" }, { k: "scheduled", l: "Scheduled" }, { k: "done", l: "Finished" }];

export default function CampaignsPage() {
  const [rows, setRows] = useState<Campaign[] | null>(null);
  const [tab, setTab] = useState("all");
  const [error, setError] = useState("");

  async function load() {
    try {
      const res = await fetch("/api/campaigns", { cache: "no-store" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to load");
      setRows(d.campaigns); setError("");
    } catch (e: any) { setError(e.message); }
  }
  useEffect(() => {
    // Older dashboard links use /outbound?campaign=<id>; send them to the campaign page.
    const legacy = new URLSearchParams(window.location.search).get("campaign");
    if (legacy && legacy !== "__instant__") { window.location.replace(`/outbound/${encodeURIComponent(legacy)}`); return; }
    load(); const t = setInterval(load, 30000); return () => clearInterval(t);
  }, []);

  const shown = (rows || []).filter((c) => tab === "all" || (tab === "done" ? ["completed", "paused", "failed"].includes(c.status) : c.status === tab));

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar active="outbound" />
      <main className="flex-1 min-w-0 px-6 py-8 lg:px-10 flex flex-col gap-5">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-display text-[26px] font-semibold m-0">Outbound campaigns</h1>
            <div className="text-[13px] text-ink-soft mt-1">Every list your employees have called. Open one to see every number, what happened, and who to follow up.</div>
          </div>
          <Link href="/outbound/new" className="bg-signal text-on-accent rounded-lg px-4 py-2 text-[13px] font-semibold">+ New campaign</Link>
        </div>

        <div className="flex gap-1 bg-raised border border-line rounded-[9px] p-1 w-fit">
          {TABS.map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)} className={`text-[13px] font-semibold px-3.5 py-1.5 rounded-md ${tab === t.k ? "bg-ink text-paper" : "text-ink-soft"}`}>{t.l}</button>
          ))}
        </div>

        {error && <div className="text-[12.5px] text-miss bg-miss-tint rounded-lg px-3 py-2.5">{error}</div>}
        {rows === null && !error && <div className="text-[13px] text-ink-soft">Loading…</div>}
        {rows && shown.length === 0 && (
          <div className="border border-dashed border-line rounded-2xl bg-raised p-8 text-center text-[13.5px] text-ink-soft">
            No campaigns here yet. <Link href="/outbound/new" className="text-signal font-semibold">Create one</Link> — pick a tested employee, paste your list, launch.
          </div>
        )}

        <div className="flex flex-col gap-3">
          {shown.map((c) => {
            const st = STATUS[c.status] || { label: c.status, tone: "neutral" as PillTone };
            const pct = c.total_contacts ? Math.min(100, Math.round((c.kpis.dialled / c.total_contacts) * 100)) : 0;
            return (
              <Link key={c.id} href={`/outbound/${c.id}`} className="bg-raised border border-line rounded-[12px] px-5 py-4 hover:border-ink-soft grid grid-cols-1 lg:grid-cols-[1.4fr_1fr_1.6fr] gap-4 items-center">
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><span className="text-[15px] font-semibold truncate">{c.name}</span><StatusPill label={st.label} tone={st.tone} /></div>
                  <div className="text-[12px] text-ink-soft mt-0.5">
                    {c.status === "scheduled" && c.scheduled_at ? `Starts ${fmtDate(c.scheduled_at)} ${fmtClock(c.scheduled_at)}` : `Created ${fmtDate(c.created_at)}`}{c.from_number ? ` · from ${c.from_number}` : ""}
                  </div>
                  {c.last_error && <div className="text-[11.5px] text-miss mt-0.5 truncate">{c.last_error}</div>}
                </div>
                <div>
                  <div className="flex justify-between text-[11.5px] text-ink-soft mb-1"><span>{c.kpis.dialled.toLocaleString("en-IN")} of {c.total_contacts.toLocaleString("en-IN")} dialled</span><span>{pct}%</span></div>
                  <div className="h-[8px] bg-paper rounded-full overflow-hidden"><div className="h-full bg-signal rounded-full" style={{ width: `${pct}%` }} /></div>
                </div>
                <div className="grid grid-cols-5 gap-2 text-center">
                  {[["Lifted", `${c.kpis.connected}`, `${c.kpis.connectRate}%`], ["DNP", `${c.kpis.dnp}`, ""], ["Hot", `${c.kpis.hot}`, ""], ["Warm", `${c.kpis.warm}`, ""], ["Follow-up", `${c.kpis.followUps}`, ""]].map(([l, v, sub]) => (
                    <div key={l}><div className="text-[16px] font-display font-bold tabular-nums">{v}</div><div className="text-[10.5px] text-ink-soft">{l}{sub ? ` · ${sub}` : ""}</div></div>
                  ))}
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
