"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import OutboundShell, { Notice, Pill, getJson, istDay } from "@/components/OutboundShell";

/** RANA HQ → Outbound → Scheduled: forecast of upcoming outreach emails per sending day, from leadflow_email_schedule. */
export default function ScheduledPage() {
  const [days, setDays] = useState<any[] | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => { getJson("/api/hq/outbound/schedule").then((j) => setDays(j.days)).catch((e) => setErr(e.message)); }, []);
  const total = (days || []).reduce((n, d) => n + d.total, 0);
  const first = (days || []).reduce((n, d) => n + d.first, 0);

  return (
    <OutboundShell title="Scheduled emails" sub="Forecast for the next 45 days, Mon–Fri 10:00–18:00 IST, within the daily email limit. Follow-ups due go before new first emails.">
      <Notice err={err} onClear={() => setErr("")} />
      <div className="border border-hot/40 bg-hot-tint text-hot rounded-xl px-4 py-2.5 text-[12.5px]" data-testid="schedule-forecast-note">
        <span className="font-semibold">Forecast, not a promise.</span> Replies, bounces and unsubscribes stop a lead's sequence early, so later follow-ups drop off; new leads join the end of the queue.
      </div>
      {!days ? <div className="text-[13px] text-ink-soft">{err ? "" : "Loading…"}</div> : !days.length ? (
        <div className="border border-line rounded-xl bg-raised p-6 text-[13px] text-ink-soft text-center">Nothing scheduled. Emails appear here once leads are in an active sequence.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Box label="Emails scheduled" value={total} />
            <Box label="First emails" value={first} />
            <Box label="Follow-ups" value={total - first} />
            <Box label="Sending days" value={days.length} sub={`${istDay(days[0].day)} → ${istDay(days[days.length - 1].day)}`} />
          </div>
          <div className="border border-line rounded-xl bg-raised overflow-x-auto" data-testid="schedule-table">
            <table className="w-full text-[12.5px] min-w-[560px]">
              <thead>
                <tr className="text-left text-ink-soft border-b border-line">
                  <th className="px-3 py-2 font-semibold">Day</th>
                  <th className="px-3 py-2 font-semibold text-right">Total</th>
                  <th className="px-3 py-2 font-semibold text-right">First emails</th>
                  <th className="px-3 py-2 font-semibold text-right">Follow-ups</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {days.map((d) => (
                  <DayRows key={d.day} d={d} open={!!open[d.day]} toggle={() => setOpen((o) => ({ ...o, [d.day]: !o[d.day] }))} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </OutboundShell>
  );
}

function Box({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="border border-line rounded-xl bg-raised px-4 py-3">
      <div className="text-[11.5px] text-ink-soft">{label}</div>
      <div className="text-[22px] font-display font-semibold tabular-nums">{value.toLocaleString("en-IN")}</div>
      {sub && <div className="text-[11px] text-ink-soft">{sub}</div>}
    </div>
  );
}

function DayRows({ d, open, toggle }: { d: any; open: boolean; toggle: () => void }) {
  return (
    <>
      <tr onClick={toggle} className="border-b border-line hover:bg-sunken cursor-pointer" data-testid="schedule-day">
        <td className="px-3 py-2 font-semibold whitespace-nowrap">{istDay(d.day, true)}</td>
        <td className="px-3 py-2 text-right tabular-nums font-semibold">{d.total}</td>
        <td className="px-3 py-2 text-right tabular-nums">{d.first}</td>
        <td className="px-3 py-2 text-right tabular-nums">{d.followups}</td>
        <td className="px-3 py-2 text-right text-ink-soft whitespace-nowrap">{open ? "Hide ▴" : "Show ▾"}</td>
      </tr>
      {open && (
        <tr className="border-b border-line bg-paper">
          <td colSpan={5} className="px-3 py-2">
            <div className="overflow-x-auto">
              <table className="w-full text-[12px] min-w-[860px]" data-testid="schedule-emails">
                <thead>
                  <tr className="text-left text-ink-soft">
                    <th className="px-2 py-1.5 font-semibold">Company</th>
                    <th className="px-2 py-1.5 font-semibold">Lead</th>
                    <th className="px-2 py-1.5 font-semibold">Email</th>
                    <th className="px-2 py-1.5 font-semibold">Step</th>
                    <th className="px-2 py-1.5 font-semibold">Subject</th>
                    <th className="px-2 py-1.5 font-semibold">Country</th>
                  </tr>
                </thead>
                <tbody>
                  {d.emails.map((e: any) => (
                    <tr key={`${e.lead_id}-${e.step_no}`} className="border-t border-line">
                      <td className="px-2 py-1.5 max-w-[200px] truncate"><Link href={`/hq/outbound/leads/${e.lead_id}`} className="font-semibold hover:text-signal">{e.company || "—"}</Link></td>
                      <td className="px-2 py-1.5 max-w-[160px] truncate">{e.lead_name || "—"}</td>
                      <td className="px-2 py-1.5 max-w-[220px] truncate text-ink-soft">{e.email || "—"}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{e.step_no === 1 ? <Pill tone="bg-signal-tint text-signal">First email</Pill> : <Pill>Step {e.step_no}</Pill>}</td>
                      <td className="px-2 py-1.5 max-w-[320px] truncate" title={e.subject || ""}>{e.subject || "—"}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap text-ink-soft">{e.country || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
