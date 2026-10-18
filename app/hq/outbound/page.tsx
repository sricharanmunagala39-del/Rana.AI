"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import OutboundShell, { ModeBadge, Notice, btn, runEngine, getJson, ago } from "@/components/OutboundShell";

/** RANA HQ → Outbound (LeadFlow) overview: where every lead is, today's sends vs caps, modes and engine health. */
const BOXES: [string, string, string][] = [
  ["active", "In sequence", "text-signal"], ["replied", "Replied", "text-violet"], ["demo_booked", "Demos booked", "text-signal"],
  ["disqualified", "Disqualified", ""], ["unsubscribed", "Unsubscribed", ""],
];

export default function OutboundOverview() {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const load = () => getJson("/api/hq/outbound").then(setD).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  async function act(action: "tick" | "sheet_sync") {
    setBusy(action); setErr(""); setMsg("");
    try {
      const r = await runEngine({ action });
      setMsg(action === "tick" ? `Engine ran${r?.summary ? `: ${typeof r.summary === "string" ? r.summary : JSON.stringify(r.summary)}` : "."}` : `Sheet synced${r?.added != null ? `: ${r.added} new lead${r.added === 1 ? "" : "s"}` : "."}`);
      load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(""); }
  }

  return (
    <OutboundShell title="Outbound" sub="LeadFlow: personal 4-email + WhatsApp sequence, Mon–Fri 10:00–18:00 IST. Priya answers WhatsApp and books demos."
      actions={d?.canAct && <>
        <button onClick={() => act("sheet_sync")} disabled={!!busy} className={btn} data-testid="outbound-sync">{busy === "sheet_sync" ? "Syncing…" : "↻ Sync sheet"}</button>
        <button onClick={() => act("tick")} disabled={!!busy} className={btn} data-testid="outbound-tick">{busy === "tick" ? "Running…" : "▶ Run engine now"}</button>
      </>}>
      <Notice err={err} msg={msg} onClear={() => { setErr(""); setMsg(""); }} />
      {!d ? <div className="text-[13px] text-ink-soft">{err ? "" : "Loading…"}</div> : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <ModeBadge channel="Email" live={d.emailLive} />
            <ModeBadge channel="WhatsApp" live={d.waLive} />
            {d.ramp && <span className="text-[12px] text-ink-soft">Warm-up ramp on</span>}
            {d.liveSince && <span className="text-[12px] text-ink-soft">· live since {new Date(d.liveSince).toLocaleDateString("en-IN")}</span>}
            <Link href="/hq/outbound/settings" className="text-[12.5px] text-signal font-semibold ml-auto">Settings →</Link>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3" data-testid="outbound-counts">
            {BOXES.map(([k, l, tone]) => (
              <Link key={k} href={`/hq/outbound/sequence?status=${k}`} className="border border-line rounded-xl bg-raised px-4 py-3 hover:border-signal/60">
                <div className="text-[11.5px] text-ink-soft">{l}</div>
                <div className={`text-[22px] font-display font-semibold tabular-nums ${d.enrollments[k] ? tone : ""}`}>{d.enrollments[k] || 0}</div>
              </Link>
            ))}
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
            <SentBox label="Emails today" t={d.email} live={d.emailLive} />
            <SentBox label="WhatsApps today" t={d.whatsapp} live={d.waLive} />
            <Link href="/hq/outbound/replies" className={`border rounded-xl bg-raised px-4 py-3 hover:border-signal/60 ${d.pendingReplies ? "border-hot/60" : "border-line"}`} data-testid="outbound-pending">
              <div className="text-[11.5px] text-ink-soft">Replies awaiting approval</div>
              <div className={`text-[22px] font-display font-semibold tabular-nums ${d.pendingReplies ? "text-hot" : ""}`}>{d.pendingReplies}</div>
              <div className="text-[11px] text-ink-soft">{d.pendingReplies ? "review the drafts →" : "nothing waiting"}</div>
            </Link>
            <Link href="/hq/outbound/whatsapp" className={`border rounded-xl bg-raised px-4 py-3 hover:border-signal/60 ${d.unreadMessages ? "border-signal/60" : "border-line"}`} data-testid="outbound-unread">
              <div className="text-[11.5px] text-ink-soft">Unread WhatsApp</div>
              <div className={`text-[22px] font-display font-semibold tabular-nums ${d.unreadMessages ? "text-signal" : ""}`}>{d.unreadMessages}</div>
              <div className="text-[11px] text-ink-soft">{d.unreadChats ? `in ${d.unreadChats} chat${d.unreadChats === 1 ? "" : "s"} →` : "all read"}</div>
            </Link>
          </div>

          <div className="border border-line rounded-xl bg-raised p-4 flex flex-col gap-2" data-testid="outbound-health">
            <div className="text-[13px] font-semibold">Engine health</div>
            {!d.health.length ? (
              <div className="text-[12.5px] text-ink-soft">No engine runs recorded yet. Once the leadflow-engine function is deployed and scheduled, each job's last run shows here.</div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {d.health.map((r: any) => {
                  const stale = Date.now() - Date.parse(r.ran_at) > 3 * 3600_000;
                  return (
                    <div key={r.job} className="rounded-lg border border-line bg-paper px-3 py-2 text-[12.5px]">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${!r.ok ? "bg-miss" : stale ? "bg-hot" : "bg-signal"}`} />
                        <span className="font-semibold font-mono">{r.job}</span>
                        <span className="ml-auto text-ink-soft">{ago(r.ran_at)}</span>
                      </div>
                      <div className={`mt-0.5 truncate ${r.ok ? "text-ink-soft" : "text-miss"}`} title={detailText(r.detail)}>{r.ok ? (detailText(r.detail) || "OK") : (detailText(r.detail) || "Failed")}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </OutboundShell>
  );
}

function detailText(d: any): string {
  if (!d) return "";
  if (typeof d === "string") return d;
  if (d.error) return String(d.error);
  return Object.entries(d).filter(([, v]) => typeof v !== "object").map(([k, v]) => `${k}: ${v}`).join(" · ");
}

function SentBox({ label, t, live }: { label: string; t: any; live: boolean }) {
  const done = live ? t.sent : t.sent + t.dryRun;
  const pct = t.cap ? Math.min(100, (done / t.cap) * 100) : 0;
  return (
    <div className="border border-line rounded-xl bg-raised px-4 py-3">
      <div className="text-[11.5px] text-ink-soft">{label}</div>
      <div className="text-[22px] font-display font-semibold tabular-nums">{done}<span className="text-[13px] text-ink-soft font-normal"> / {t.cap || "—"}</span></div>
      <div className="h-1 rounded-full bg-line mt-1 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-signal to-violet" style={{ width: `${pct}%` }} /></div>
      <div className="text-[11px] text-ink-soft mt-1">{[t.sent && `${t.sent} sent`, t.dryRun && `${t.dryRun} dry run`, t.failed && `${t.failed} failed`].filter(Boolean).join(" · ") || "none yet today"}</div>
    </div>
  );
}
