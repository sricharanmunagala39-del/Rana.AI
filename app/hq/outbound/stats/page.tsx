"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import OutboundShell, { Notice, getJson, istDay, istMonth } from "@/components/OutboundShell";

/** RANA HQ → Outbound → Email stats: outreach emails sent per day (last 30 days) and per month, from leadflow_email_stats. */
const COLS: [string, string][] = [["sent", "Sent"], ["first_emails", "First emails"], ["followups", "Follow-ups"], ["opened", "Opened"], ["clicked", "Clicked"], ["bounced", "Bounced"], ["replies", "Replies"]];
const ZERO = { sent: 0, first_emails: 0, followups: 0, opened: 0, clicked: 0, bounced: 0, replies: 0 };
const n = (v: number) => (v || 0).toLocaleString("en-IN");

export default function EmailStatsPage() {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  useEffect(() => { getJson("/api/hq/outbound/stats").then(setD).catch((e) => setErr(e.message)); }, []);
  const today = d ? d.daily.find((r: any) => r.period === d.today) || { ...ZERO, period: d.today } : null;
  const total = d ? d.monthly.reduce((t: any, r: any) => { COLS.forEach(([k]) => { t[k] += r[k] || 0; }); return t; }, { ...ZERO }) : null;

  return (
    <OutboundShell title="Email stats" sub="Outreach emails actually sent (live, not dry run), counted by India-time day. Opens, clicks and bounces come from Resend events.">
      <Notice err={err} onClear={() => setErr("")} />
      {!d ? <div className="text-[13px] text-ink-soft">{err ? "" : "Loading…"}</div> : (
        <>
          <div className="border border-line rounded-xl bg-raised p-4 flex flex-col gap-3" data-testid="stats-today">
            <div className="text-[13px] font-semibold">Today · {istDay(d.today, true)}</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              {COLS.map(([k, l]) => (
                <div key={k}>
                  <div className="text-[11.5px] text-ink-soft">{l}</div>
                  <div className={`${k === "sent" ? "text-[30px] text-signal" : "text-[22px]"} font-display font-semibold tabular-nums`}>{n(today[k])}</div>
                </div>
              ))}
            </div>
            {!today.sent && <div className="text-[12px] text-ink-soft">No emails sent yet today. Sending runs Mon–Fri 10:00–18:00 IST; see what's queued on <Link href="/hq/outbound/scheduled" className="text-signal font-semibold">Scheduled →</Link></div>}
          </div>

          <StatTable title="Last 30 days" rows={d.daily} label={(r) => istDay(r.period, true)} empty="No emails sent in the last 30 days. Days appear here once the engine sends its first live emails." testid="stats-daily" />
          <StatTable title="By month" rows={d.monthly} label={(r) => istMonth(r.period)} total={d.monthly.length ? total : null} empty="No emails sent yet." testid="stats-monthly" />
        </>
      )}
    </OutboundShell>
  );
}

function StatTable({ title, rows, label, total, empty, testid }: { title: string; rows: any[]; label: (r: any) => string; total?: any; empty: string; testid: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[13px] font-semibold">{title}</div>
      {!rows.length ? (
        <div className="border border-line rounded-xl bg-raised p-6 text-[13px] text-ink-soft text-center" data-testid={`${testid}-empty`}>{empty}</div>
      ) : (
        <div className="border border-line rounded-xl bg-raised overflow-x-auto" data-testid={testid}>
          <table className="w-full text-[12.5px] min-w-[720px]">
            <thead>
              <tr className="text-left text-ink-soft border-b border-line">
                <th className="px-3 py-2 font-semibold">{title === "By month" ? "Month" : "Day"}</th>
                {COLS.map(([k, l]) => <th key={k} className="px-3 py-2 font-semibold text-right whitespace-nowrap">{l}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.period} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 font-semibold whitespace-nowrap">{label(r)}</td>
                  {COLS.map(([k]) => <td key={k} className={`px-3 py-2 text-right tabular-nums ${k === "sent" ? "font-semibold" : ""} ${k === "bounced" && r[k] ? "text-miss" : ""}`}>{n(r[k])}</td>)}
                </tr>
              ))}
              {total && (
                <tr className="border-t border-line bg-sunken">
                  <td className="px-3 py-2 font-semibold">All time</td>
                  {COLS.map(([k]) => <td key={k} className="px-3 py-2 text-right tabular-nums font-semibold">{n(total[k])}</td>)}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
