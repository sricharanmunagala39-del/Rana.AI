"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { inr } from "@/lib/money";

const LEVEL: Record<string, string> = { red: "border-miss/30 bg-miss-tint", orange: "border-hot/40 bg-hot/10", info: "border-line bg-white" };
const DOT: Record<string, string> = { red: "bg-miss", orange: "bg-hot", info: "bg-ink-soft/50" };
export const BAND: Record<string, string> = { good: "bg-signal-tint text-signal", watch: "bg-hot/15 text-hot", risk: "bg-miss-tint text-miss" };

export function Spark({ data, w = 84, h = 22 }: { data: number[]; w?: number; h?: number }) {
  const max = Math.max(1, ...data);
  const pts = data.map((v, i) => `${(i / Math.max(1, data.length - 1)) * w},${h - (v / max) * (h - 2) - 1}`).join(" ");
  return <svg width={w} height={h} className="text-signal" aria-hidden><polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" /></svg>;
}

/** RANA HQ command centre: alerts, live strip, money, growth, search, Ask HQ, platform health. */
export default function HqOverview({ onData, onOpenClient, onApprove }: { onData?: (d: any) => void; onOpenClient?: (id: string) => void; onApprove?: (id: string) => void }) {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[] | null>(null);
  const [ask, setAsk] = useState("");
  const [answer, setAnswer] = useState<{ q: string; a?: string; err?: string } | null>(null);
  const [asking, setAsking] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const load = () => fetch("/api/hq/overview").then(async (r) => { const j = await r.json(); if (!r.ok || !Array.isArray(j.alerts) || !j.live) throw new Error(j.error || "Couldn't load the command centre."); setD(j); onData?.(j); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); const t = setInterval(load, 60_000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (q.trim().length < 2) { setResults(null); return; }
    const t = setTimeout(() => fetch(`/api/hq/search?q=${encodeURIComponent(q.trim())}`).then((r) => r.json()).then((j) => setResults(j.results || [])).catch(() => {}), 300);
    return () => clearTimeout(t);
  }, [q]);

  async function askHq(question: string) {
    setAsking(true); setAnswer({ q: question });
    try {
      const r = await fetch("/api/hq/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) });
      const j = await r.json();
      setAnswer(r.ok ? { q: question, a: j.answer } : { q: question, err: j.error });
    } finally { setAsking(false); }
  }

  if (err) return <div className="text-[13px] text-miss">{err}</div>;
  if (!d) return <div className="text-[13px] text-ink-soft" data-testid="hq-overview-loading">Loading command centre…</div>;
  const L = d.live, G = d.growth, M = d.money, P = d.platform;
  const alerts = showAll ? d.alerts : d.alerts.slice(0, 6);

  return (
    <div className="flex flex-col gap-4" data-testid="hq-overview">
      {/* Search + Ask HQ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="relative">
          <input id="hq-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search any client, person, phone number or invoice…" className="w-full border border-line rounded-xl bg-white px-4 py-2.5 text-[13.5px] outline-none focus:border-signal" />
          {results && (
            <div className="absolute z-20 mt-1 w-full bg-white border border-line rounded-xl shadow-lg max-h-[360px] overflow-y-auto" data-testid="search-results">
              {results.length === 0 ? <div className="px-4 py-3 text-[13px] text-ink-soft">Nothing found.</div> : results.map((r, i) => (
                <button key={i} onClick={() => { if (r.href) window.open(r.href, "_blank"); else onOpenClient?.(r.clientId); setQ(""); }} className="w-full text-left px-4 py-2 hover:bg-paper border-b border-line last:border-0">
                  <div className="text-[13px]"><span className="text-[10.5px] uppercase tracking-wide text-ink-soft mr-2">{r.type}</span><b>{r.title}</b></div>
                  <div className="text-[11.5px] text-ink-soft">{r.sub}</div>
                </button>
              ))}
            </div>
          )}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (ask.trim()) askHq(ask.trim()); }} className="flex gap-2">
          <input id="hq-ask" value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="Ask HQ: which clients might run out of minutes this week?" className="flex-1 border border-line rounded-xl bg-white px-4 py-2.5 text-[13.5px] outline-none focus:border-signal" />
          <button disabled={asking || !ask.trim()} className="bg-ink text-white rounded-xl px-4 text-[13px] font-semibold disabled:opacity-50" data-testid="hq-ask-btn">{asking ? "Thinking…" : "Ask"}</button>
        </form>
      </div>
      {answer && (
        <div className="border border-line rounded-xl bg-white px-5 py-4 text-[13.5px]" data-testid="hq-answer">
          <div className="flex justify-between gap-3"><div className="text-[11px] uppercase tracking-wide text-signal font-semibold">Ask HQ · {answer.q}</div><button onClick={() => setAnswer(null)} className="text-ink-soft">×</button></div>
          {!answer.a && !answer.err && <div className="text-ink-soft mt-1">Reading your data…</div>}
          {answer.err && <div className="text-miss mt-1">{answer.err}</div>}
          {answer.a && <div className="mt-1 whitespace-pre-wrap leading-relaxed">{answer.a}</div>}
        </div>
      )}

      {/* Alerts */}
      <div className="flex flex-col gap-2" data-testid="hq-alerts">
        <div className="flex items-center justify-between">
          <div className="text-[15px] font-semibold">Needs you today {d.alerts.length ? <span className="text-ink-soft font-normal">· {d.alerts.filter((a: any) => a.level === "red").length} urgent, {d.alerts.length} total</span> : null}</div>
          {d.alerts.length > 6 && <button onClick={() => setShowAll(!showAll)} className="text-[12px] text-signal font-semibold">{showAll ? "Show fewer" : `Show all ${d.alerts.length}`}</button>}
        </div>
        {d.alerts.length === 0 ? <div className="border border-line rounded-xl bg-white px-5 py-4 text-[13px] text-ink-soft">All clear — nothing needs you right now.</div> : alerts.map((a: any, i: number) => (
          <div key={i} className={`border rounded-xl px-4 py-2.5 text-[13px] flex items-center gap-3 ${LEVEL[a.level]}`}>
            <span className={`w-2 h-2 rounded-full shrink-0 ${DOT[a.level]}`} />
            <div className="flex-1">{a.client && <button onClick={() => a.clientId && onOpenClient?.(a.clientId)} className="font-semibold underline decoration-line mr-1">{a.client}:</button>}{a.text}</div>
            {a.action?.href && <Link href={a.action.href} className="text-[12px] font-semibold text-signal shrink-0">{a.action.label} →</Link>}
            {a.action?.op === "approve" && a.clientId && <button onClick={() => onApprove?.(a.clientId)} className="bg-signal text-white rounded-lg px-3 py-1 text-[12px] font-semibold shrink-0" data-testid="approve-signup">Approve</button>}
          </div>
        ))}
      </div>

      {/* Live + money + growth */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3" data-testid="hq-live">
        {[
          ["Calls today", L.callsToday.toLocaleString("en-IN"), `${L.connectedToday} connected${L.answerRateToday !== null ? ` · ${L.answerRateToday}%` : ""}`],
          ["Minutes today", Math.round(L.minutesToday).toLocaleString("en-IN"), `${L.hotToday} hot/warm leads`],
          ["Campaigns running", String(L.runningCampaigns), `${L.scheduledCampaigns} scheduled`],
          ...(M ? [["Plan revenue / month", inr(M.mrr), `${inr(M.collectedMonth)} collected this month`], ["Sarvam credits", M.sarvam?.tracked ? inr(M.sarvam.balance) : "Not tracked", M.sarvam?.tracked ? `${M.sarvam.daysLeft ?? "—"} days left · ~${inr(M.sarvam.forecast30)}/30d` : "Enter it on Money"]] : []),
          ["Clients", String(G.clients), `${G.paying} paying · ${G.trials} trial${G.pending ? ` · ${G.pending} waiting` : ""}`],
        ].map(([k, v, sub]) => (
          <div key={k} className="border border-line rounded-xl bg-white px-4 py-3">
            <div className="text-[11.5px] text-ink-soft">{k}</div>
            <div className="text-[20px] font-display font-semibold tabular-nums">{v}</div>
            <div className="text-[11px] text-ink-soft">{sub}</div>
          </div>
        ))}
      </div>

      {/* Health + platform */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2 border border-line rounded-xl bg-white p-4" data-testid="hq-health">
          <div className="flex items-center justify-between mb-2"><div className="text-[14px] font-semibold">Client health</div><div className="text-[11.5px] text-ink-soft">{G.atRisk} at risk · trial → paid {G.trialConversion}% · {G.new30} new in 30 days</div></div>
          <div className="flex flex-col">
            {d.clients.slice(0, 8).map((c: any) => (
              <button key={c.id} onClick={() => onOpenClient?.(c.id)} className="flex items-center gap-3 py-1.5 border-b border-line last:border-0 text-left hover:bg-paper rounded">
                <span className={`text-[11.5px] font-bold rounded-md px-2 py-0.5 w-[44px] text-center ${BAND[c.health.band]}`}>{c.health.score}</span>
                <span className="text-[13px] font-semibold w-[190px] truncate">{c.name}</span>
                <Spark data={c.trend} />
                <span className="text-[11.5px] text-ink-soft flex-1 truncate">{c.health.why.length ? c.health.why.join(" · ") : "healthy"}</span>
                <span className="text-[11.5px] tabular-nums text-ink-soft w-[110px] text-right">{c.wallet ? inr(c.wallet.balance) + " bal" : c.usage ? `${Math.round(c.usage.used)}/${c.usage.included} min` : ""}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="border border-line rounded-xl bg-white p-4 text-[12.5px] flex flex-col gap-1.5" data-testid="hq-platform">
          <div className="text-[14px] font-semibold mb-1">Platform health</div>
          {P.crons.map((c: any) => (
            <div key={c.job} className="flex justify-between"><span className="text-ink-soft">Daily {c.job}</span><span className={c.last ? (c.last.ok ? "text-signal font-semibold" : "text-miss font-semibold") : "text-ink-soft"}>{c.last ? `${c.last.ok ? "OK" : "FAILED"} · ${new Date(c.last.ran_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : "not run yet"}</span></div>
          ))}
          <div className="flex justify-between"><span className="text-ink-soft">Calls last hour</span><span>{P.callsLastHour} · {P.failedLastHour} failed</span></div>
          <div className="flex justify-between"><span className="text-ink-soft">Razorpay notices</span><span className={P.razorpay.problems ? "text-miss font-semibold" : "text-signal font-semibold"}>{P.razorpay.problems ? `${P.razorpay.problems} problem(s)` : `OK · ${P.razorpay.recent.length} recent`}</span></div>
          <div className="flex justify-between"><span className="text-ink-soft">Email</span><span className={P.emailConfigured ? "text-signal font-semibold" : "text-hot font-semibold"}>{P.emailConfigured ? `On${P.emailFailures24h ? ` · ${P.emailFailures24h} failed` : ""}` : "Off — add RESEND_API_KEY"}</span></div>
          <div className="flex justify-between"><span className="text-ink-soft">Sarvam agent check</span><span>{P.sarvamCheck ? `${P.sarvamCheck.ok ? "OK" : "check"} · ${new Date(P.sarvamCheck.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : "—"}</span></div>
          <div className="flex gap-3 mt-2 pt-2 border-t border-line text-[12px] font-semibold"><Link href="/hq/money" className="text-signal">₹ Money</Link><Link href="/hq/team" className="text-signal">Team &amp; security</Link></div>
        </div>
      </div>
    </div>
  );
}
