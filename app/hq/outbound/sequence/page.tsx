"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import OutboundShell, { EnrollmentPill, Notice, getJson, dayOnly, when } from "@/components/OutboundShell";

/** RANA HQ → Outbound → Sequence tracker: one row per enrollment with the date each step went out. */
const STEPS: [number, string][] = [[0, "WA intro"], [1, "Step 1"], [2, "Step 2"], [3, "Step 3"], [4, "Step 4"], [5, "Step 5"]];
const FILTERS: [string, string][] = [["all", "All"], ["active", "In sequence"], ["replied", "Replied"], ["demo_booked", "Demo booked"], ["disqualified", "Disqualified"], ["unsubscribed", "Unsubscribed"], ["bounced", "Bounced"], ["stopped", "Stopped"], ["error", "Error"]];

export default function SequencePage() {
  const router = useRouter();
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("status");
    if (s && FILTERS.some(([k]) => k === s)) setStatus(s);
    getJson("/api/hq/outbound/sequence").then((j) => setRows(j.rows)).catch((e) => setErr(e.message));
  }, []);
  const counts = useMemo(() => { const c: Record<string, number> = {}; (rows || []).forEach((r) => { c[r.status] = (c[r.status] || 0) + 1; }); return c; }, [rows]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows || []).filter((r) => (status === "all" || r.status === status) && (!t || [r.name, r.company, r.campaign].some((v) => String(v || "").toLowerCase().includes(t))));
  }, [rows, q, status]);

  return (
    <OutboundShell title="Sequence tracker" sub="WhatsApp intro, then up to five steps. Dates in amber went out in dry run. Click a row to open the lead.">
      <Notice err={err} onClear={() => setErr("")} />
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search lead, company, campaign…" className="border border-line rounded-lg px-3 py-2 text-[13px] bg-raised w-full sm:w-[280px]" data-testid="seq-search" />
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.filter(([k]) => k === "all" || counts[k] || status === k).map(([k, l]) => (
            <button key={k} onClick={() => setStatus(k)} className={`rounded-full border px-3 py-1 text-[12px] font-semibold ${status === k ? "bg-ink text-paper border-ink" : "border-line text-ink-soft"}`}>{l} <span className="opacity-70">{k === "all" ? rows?.length || 0 : counts[k] || 0}</span></button>
          ))}
        </div>
      </div>
      {!rows ? <div className="text-[13px] text-ink-soft">{err ? "" : "Loading…"}</div> : !shown.length ? (
        <div className="border border-line rounded-xl bg-raised p-6 text-[13px] text-ink-soft text-center">{rows.length ? "No enrollments match." : "No one is enrolled yet. Leads appear here once the engine imports them from the master sheet and starts the sequence."}</div>
      ) : (
        <div className="border border-line rounded-xl bg-raised overflow-x-auto" data-testid="seq-table">
          <table className="w-full text-[12.5px] min-w-[860px]">
            <thead>
              <tr className="text-left text-ink-soft border-b border-line">
                <th className="px-3 py-2 font-semibold">Lead</th>
                {STEPS.map(([n, l]) => <th key={n} className="px-2 py-2 font-semibold whitespace-nowrap">{l}</th>)}
                <th className="px-2 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold whitespace-nowrap">Next due</th>
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, 1000).map((r) => (
                <tr key={r.id} onClick={() => router.push(`/hq/outbound/leads/${r.leadId}`)} className="border-b border-line last:border-0 hover:bg-sunken cursor-pointer" data-testid="seq-row">
                  <td className="px-3 py-2 max-w-[240px]">
                    <div className="font-semibold truncate">{r.name || "Unnamed lead"}</div>
                    <div className="text-[11.5px] text-ink-soft truncate">{[r.company, r.campaign].filter(Boolean).join(" · ") || "—"}</div>
                  </td>
                  {STEPS.map(([n]) => {
                    const s = r.steps?.[n];
                    return <td key={n} className={`px-2 py-2 whitespace-nowrap tabular-nums ${s ? (s.dry ? "text-hot" : "") : "text-ink-soft/50"}`} title={s ? `${when(s.at)}${s.dry ? " (dry run)" : ""}` : ""}>{s ? dayOnly(s.at) : "—"}</td>;
                  })}
                  <td className="px-2 py-2"><EnrollmentPill status={r.status} /></td>
                  <td className="px-3 py-2 whitespace-nowrap text-ink-soft">{r.status === "active" && r.nextSendAt ? <span className={Date.parse(r.nextSendAt) < Date.now() ? "text-hot font-semibold" : ""}>{when(r.nextSendAt)}</span> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length > 1000 && <div className="px-3 py-2 text-[12px] text-ink-soft">Showing the first 1,000 — search to narrow.</div>}
        </div>
      )}
    </OutboundShell>
  );
}
