"use client";
// RANA HQ · Command centre: every client's calls, website conversations and alerts on one live screen,
// with "Ask HQ" by voice. Refreshes every 10 s; the core ripples whenever something new comes in.
import { useCallback, useEffect, useRef, useState } from "react";
import Sidebar from "@/components/Sidebar";
import RanaCore, { CORE_LABEL, type CoreMode } from "@/components/RanaCore";
import AskRana, { type AskState } from "@/components/AskRana";

const inr = (n: number) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
const dur = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`);
const HOT = new Set(["hot", "ready_to_close"]);

function Tile({ label, value, sub, tone = "" }: { label: string; value: string | number; sub?: string; tone?: string }) {
  return (
    <div className="hud-panel px-4 py-3.5">
      <div className="hud-label">{label}</div>
      <div className={`font-display ${String(value).length > 8 ? "text-[21px]" : "text-[26px]"} font-semibold leading-tight mt-1 tabular-nums truncate ${tone}`}>{value}</div>
      {sub && <div className="text-[11.5px] text-ink-soft">{sub}</div>}
    </div>
  );
}

export default function HqCommand() {
  const [ov, setOv] = useState<any>(null);
  const [pulse, setPulse] = useState<any>(null);
  const [err, setErr] = useState("");
  const [ask, setAsk] = useState<AskState>("idle");
  const [ripple, setRipple] = useState(0);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const seen = useRef<Set<string> | null>(null);
  const tickN = useRef(0);

  const load = useCallback(async () => {
    try {
      const want = tickN.current++ % 3 === 0; // the heavy overview every 30 s, the pulse every 10 s
      const [p, o] = await Promise.all([
        fetch("/api/hq/pulse", { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status === 403 ? "HQ access only." : "Couldn't load")))),
        want ? fetch("/api/hq/overview", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)) : Promise.resolve(undefined),
      ]);
      const ids = [...(p.calls || []).map((c: any) => c.id), ...(p.web?.talks || []).map((t: any) => t.id)];
      if (seen.current) {
        const added = ids.filter((id) => !seen.current!.has(id));
        if (added.length) { setRipple((x) => x + 1); setFresh(new Set(added)); setTimeout(() => setFresh(new Set()), 7000); }
      }
      seen.current = new Set(ids);
      setPulse(p); if (o) setOv(o); setErr("");
    } catch (e: any) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); const i = setInterval(() => document.visibilityState === "visible" && load(), 10000); return () => clearInterval(i); }, [load]);

  const L = ov?.live, G = ov?.growth, M = ov?.money;
  const red = (ov?.alerts || []).filter((a: any) => a.level === "red").length;
  const webLive = pulse?.web?.live || 0;
  const coreMode: CoreMode = ask !== "idle" ? (ask as CoreMode) : red ? "alert" : webLive || L?.runningCampaigns || L?.callsLastHour ? "speaking" : "idle";
  const state = ask !== "idle" ? CORE_LABEL[ask] : red ? `${red} RED ALERT${red > 1 ? "S" : ""}` : webLive ? `${webLive} VISITOR${webLive > 1 ? "S" : ""} TALKING NOW` : L?.runningCampaigns ? `${L.runningCampaigns} CAMPAIGN${L.runningCampaigns > 1 ? "S" : ""} LIVE` : "ALL SYSTEMS NOMINAL";

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar active="hq-command" />
      <main className="flex-1 min-w-0 hud-stage" data-testid="hq-command">
        <div className="hud-scan" aria-hidden />
        <header className="relative flex flex-wrap items-center justify-between gap-3 px-5 sm:px-7 py-4 border-b border-white/[.06]">
          <div className="flex items-center gap-3">
            <span className={`w-2.5 h-2.5 rounded-full ${red ? "bg-hot" : "bg-signal"} live-dot`} />
            <div><div className="font-mono text-[12px] tracking-[0.2em] font-semibold">RANA HQ · COMMAND CENTRE</div><div className="text-[12px] text-ink-soft">Every client, every call, every website visitor — live.</div></div>
          </div>
          <div className="flex items-center gap-4 text-[12px] text-ink-soft font-mono">{pulse && <span>SYNC {time(pulse.now)}</span>}{err && <span className="text-hot">{err}</span>}<a href="/hq" className="hover:text-ink">CLIENTS →</a></div>
        </header>

        <div className="relative grid grid-cols-[minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_400px] gap-5 p-5 sm:p-7">
          {/* Left: numbers + alerts */}
          <div className="flex flex-col gap-4 order-2 xl:order-1">
            <div className="grid grid-cols-2 gap-3">
              <Tile label="Calls today" value={L ? L.callsToday.toLocaleString("en-IN") : "…"} sub={L ? `${L.answerRateToday ?? 0}% answered` : undefined} />
              <Tile label="Minutes" value={L ? Math.round(L.minutesToday).toLocaleString("en-IN") : "…"} sub={L ? `${L.callsLastHour} calls last hour` : undefined} />
              <Tile label="Hot leads" value={L ? L.hotToday : "…"} tone={L?.hotToday ? "text-hot" : ""} />
              <Tile label="Campaigns" value={L ? L.runningCampaigns : "…"} sub={L ? `${L.scheduledCampaigns} scheduled` : undefined} />
              <Tile label="Clients" value={G ? G.clients : "…"} sub={G ? `${G.paying} paying · ${G.trials} trials` : undefined} />
              <Tile label="MRR" value={M ? inr(M.mrr) : ov && !M ? "—" : "…"} sub={M ? `${inr(M.collectedMonth)} collected` : ov && !M ? "hidden for your role" : undefined} />
            </div>
            <div className="hud-panel p-4" data-testid="hq-alerts">
              <div className="flex items-center justify-between"><span className="hud-label">Alerts</span><span className={`hud-label ${red ? "!text-hot" : "!text-signal"}`}>{(ov?.alerts || []).length || "CLEAR"}</span></div>
              {!ov && <div className="text-[12.5px] text-ink-soft mt-2">Loading…</div>}
              {ov && !(ov.alerts || []).length && <div className="text-[12.5px] text-ink-soft mt-2">Nothing needs you right now.</div>}
              <div className="flex flex-col gap-2 mt-2 max-h-[320px] overflow-y-auto pr-1">
                {(ov?.alerts || []).slice(0, 12).map((a: any, i: number) => (
                  <div key={i} className={`rounded-lg border px-3 py-2 text-[12.5px] leading-snug ${a.level === "red" ? "border-hot/50 bg-hot/10" : a.level === "orange" ? "border-warm/40 bg-warm/[.06]" : "border-white/10 bg-white/[.02]"}`}>
                    {a.client && <b>{a.client}: </b>}{a.text}
                    {a.action && <a href={a.action.href} className="block mt-1 text-signal font-semibold" target={a.action.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">{a.action.label} →</a>}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Center */}
          <div className="flex flex-col items-center order-1 xl:order-2">
            <RanaCore size={400} mode={coreMode} pulse={ripple} className="max-w-[78vw]" />
            <div className={`hud-state -mt-1 ${red && ask === "idle" ? "!text-hot" : ""}`} data-testid="hq-core-state">{state}</div>
            <div className="text-[12.5px] text-ink-soft mt-1.5">{pulse ? `${pulse.web.today} website conversation${pulse.web.today === 1 ? "" : "s"} · ${(pulse.demos || []).length} new demo request${(pulse.demos || []).length === 1 ? "" : "s"} (24 h)` : "Connecting…"}</div>
            <div className="w-full max-w-[640px] mt-6">
              <AskRana endpoint="/api/hq/ask" onState={setAsk} placeholder="Ask HQ — clients, usage, money, alerts…"
                suggestions={["Which clients need attention today?", "How many minutes did we use today?", "Who is close to running out of minutes?", "What's our MRR?"]} />
            </div>
            {(pulse?.demos || []).length > 0 && (
              <div className="hud-panel p-4 w-full max-w-[640px] mt-4">
                <div className="flex items-center justify-between"><span className="hud-label">New demo requests</span><a href="/hq/demos" className="hud-label !text-signal">OPEN →</a></div>
                <div className="flex flex-wrap gap-2 mt-2">{pulse.demos.map((d: any) => <span key={d.id} className="rounded-full border border-hot/40 bg-hot/10 text-hot text-[12px] px-3 py-1">★ {d.company || d.name || "Demo"} · {time(d.created_at)}</span>)}</div>
              </div>
            )}
          </div>

          {/* Right: streams */}
          <div className="flex flex-col gap-4 order-3">
            <section className="hud-panel p-4" data-testid="hq-web">
              <div className="flex items-center justify-between mb-2"><span className="hud-label">Website · Talk to Rana</span><span className="hud-label !text-signal">{webLive ? `${webLive} LIVE` : `${pulse?.web?.today || 0} TODAY`}</span></div>
              <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
                {pulse && !pulse.web.talks.length && <div className="text-[12.5px] text-ink-soft py-4 text-center">No website conversations in the last 24 hours.</div>}
                {(pulse?.web?.talks || []).map((t: any) => (
                  <div key={t.id} className={`rounded-xl border px-3 py-2 hud-pop ${fresh.has(t.id) ? "border-signal/60 bg-signal/[.08]" : t.open ? "border-violet/50 bg-violet/[.06]" : "border-white/[.07] bg-white/[.02]"}`}>
                    <div className="flex items-center justify-between gap-2 text-[12.5px]">
                      <span className="font-semibold truncate">{t.open ? "● " : ""}{t.who || (t.kind === "talk" ? "Visitor" : `Demo · ${t.scenario}`)}</span>
                      <span className={`shrink-0 font-mono text-[10px] tracking-wider rounded border px-1.5 py-0.5 ${t.interest === "hot" ? "text-hot border-hot/40 bg-hot/10" : t.booked ? "text-signal border-signal/40 bg-signal/10" : "text-ink-soft border-white/10"}`}>{t.booked ? "BOOKED" : t.open ? "LIVE" : (t.interest || t.kind).toUpperCase()}</span>
                    </div>
                    {t.outcome && <div className="text-[11.5px] text-ink-soft mt-0.5 line-clamp-2">{t.outcome}</div>}
                    <div className="font-mono text-[10.5px] text-ink-soft/70 mt-0.5">{time(t.at)} · {t.lang} · {t.market} · {t.seconds ? dur(t.seconds) : "—"}</div>
                  </div>
                ))}
              </div>
            </section>
            <section className="hud-panel p-4" data-testid="hq-calls">
              <div className="flex items-center justify-between mb-2"><span className="hud-label">Client calls · 24 h</span><span className="hud-label !text-signal">{pulse?.calls?.length || 0}</span></div>
              <div className="flex flex-col gap-2 max-h-[420px] overflow-y-auto pr-1">
                {pulse && !pulse.calls.length && <div className="text-[12.5px] text-ink-soft py-4 text-center">No client calls in the last 24 hours.</div>}
                {(pulse?.calls || []).map((c: any) => (
                  <div key={c.id} className={`rounded-xl border px-3 py-2 hud-pop ${fresh.has(c.id) ? "border-signal/60 bg-signal/[.08]" : "border-white/[.07] bg-white/[.02]"}`}>
                    <div className="flex items-center justify-between gap-2 text-[12.5px]">
                      <span className="truncate"><span className="text-ink-soft">{c.direction === "inbound" ? "↙" : "↗"} </span><b>{c.client}</b><span className="text-ink-soft"> · {c.name || "caller"}</span></span>
                      <span className={`shrink-0 font-mono text-[10px] tracking-wider rounded border px-1.5 py-0.5 ${HOT.has(c.lead) ? "text-hot border-hot/40 bg-hot/10" : "text-ink-soft border-white/10"}`}>{String(c.lead || "new").replace(/_/g, " ").toUpperCase()}</span>
                    </div>
                    {c.summary && <div className="text-[11.5px] text-ink-soft mt-0.5 line-clamp-2">{c.summary}</div>}
                    <div className="font-mono text-[10.5px] text-ink-soft/70 mt-0.5">{time(c.at)} · {c.seconds ? dur(c.seconds) : "not connected"}</div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
