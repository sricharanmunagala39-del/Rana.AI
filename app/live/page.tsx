"use client";
// Mission control: a live, futuristic view of your AI employees at work — today's numbers, running campaigns,
// every call the moment it finishes (with a replay), and "Ask Rana" by voice or text.
import { useCallback, useEffect, useRef, useState } from "react";
import Sidebar from "@/components/Sidebar";
import RanaCore, { CORE_LABEL, type CoreMode } from "@/components/RanaCore";
import AskRana, { type AskState } from "@/components/AskRana";

type Feed = { id: string; direction: string; name: string | null; phone: string | null; seconds: number; lead: string; reason: string | null; summary: string | null; at: string; connected: string | null };
const LEAD: Record<string, { label: string; cls: string }> = {
  ready_to_close: { label: "READY TO CLOSE", cls: "text-hot bg-hot/15 border-hot/40" }, hot: { label: "HOT", cls: "text-hot bg-hot/15 border-hot/40" },
  warm: { label: "WARM", cls: "text-warm bg-warm/10 border-warm/30" }, cold: { label: "COLD", cls: "text-ink-soft bg-white/5 border-white/10" },
  not_interested: { label: "NOT INTERESTED", cls: "text-ink-soft bg-white/5 border-white/10" }, no_answer: { label: "NO ANSWER", cls: "text-ink-soft/70 bg-white/[.03] border-white/10" },
  new: { label: "NEW", cls: "text-signal bg-signal/10 border-signal/30" },
};
const who = (f: { name: string | null; phone: string | null }) => f.name || (f.phone ? `•••• ${String(f.phone).slice(-4)}` : "Unknown caller");
const dur = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`);
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

function CountUp({ v, suffix = "" }: { v: number; suffix?: string }) {
  const [n, setN] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const a = from.current, st = performance.now(); let raf = 0;
    const f = (t: number) => { const k = Math.min(1, (t - st) / 900); const x = a + (v - a) * (1 - Math.pow(1 - k, 3)); setN(x); if (k < 1) raf = requestAnimationFrame(f); else from.current = v; };
    raf = requestAnimationFrame(f); return () => cancelAnimationFrame(raf);
  }, [v]);
  return <>{Number.isInteger(v) ? Math.round(n).toLocaleString("en-IN") : n.toFixed(1)}{suffix}</>;
}

function Clock() {
  const [t, setT] = useState<string>("");
  useEffect(() => { const f = () => setT(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Asia/Kolkata" })); f(); const i = setInterval(f, 1000); return () => clearInterval(i); }, []);
  return <span className="font-mono tabular-nums">{t} IST</span>;
}

export default function LivePage() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  const [ask, setAsk] = useState<AskState>("idle");
  const [pulse, setPulse] = useState(0);
  const [fresh, setFresh] = useState<Record<string, boolean>>({});
  const [replay, setReplay] = useState<any>(null);
  const seen = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/live", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Couldn't load");
      const ids: string[] = (d.feed || []).map((f: Feed) => f.id);
      if (seen.current) {
        const added = ids.filter((id) => !seen.current!.has(id));
        if (added.length) { setPulse((p) => p + 1); setFresh((x) => ({ ...x, ...Object.fromEntries(added.map((id) => [id, true])) })); setTimeout(() => setFresh((x) => { const y = { ...x }; added.forEach((id) => delete y[id]); return y; }), 6000); }
      }
      seen.current = new Set(ids);
      setData(d); setErr("");
    } catch (e: any) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); const i = setInterval(() => { if (document.visibilityState === "visible") load(); }, 10000); return () => clearInterval(i); }, [load]);

  const k = data?.kpis;
  const running = (data?.campaigns || []).filter((c: any) => c.status === "running");
  const busy = running.length > 0 || (data?.lastHour || 0) > 0;
  const coreMode: CoreMode = ask === "listening" ? "listening" : ask === "thinking" ? "thinking" : ask === "speaking" ? "speaking" : busy ? "speaking" : "idle";
  const state = ask !== "idle" ? CORE_LABEL[coreMode] : running.length ? `${running.length} CAMPAIGN${running.length > 1 ? "S" : ""} DIALLING` : data?.lastHour ? "ON CALLS" : "STANDBY";
  const tiles: [string, number, string, string?][] = k ? [
    ["Calls today", k.total, ""], ["Connected", k.connected, "", `${k.connectRate}%`], ["Talk time", Math.round(k.talkSeconds / 60), " min"], ["Hot leads", k.hot, "", k.readyToClose ? `${k.readyToClose} ready to close` : undefined],
  ] : [];

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar active="live" />
      <main className="flex-1 min-w-0 hud-stage" data-testid="live-page">
        <div className="hud-scan" aria-hidden />
        <header className="relative flex flex-wrap items-center justify-between gap-3 px-5 sm:px-7 py-4 border-b border-white/[.06]">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-signal live-dot" />
            <div>
              <div className="font-mono text-[12px] tracking-[0.2em] font-semibold">MISSION CONTROL</div>
              <div className="text-[12px] text-ink-soft">Your AI employees, live. Calls appear here the moment they finish.</div>
            </div>
          </div>
          <div className="flex items-center gap-4 text-[12px] text-ink-soft"><Clock /><button onClick={load} className="font-mono tracking-wider hover:text-ink">↻ SYNC</button></div>
        </header>

        <div className="relative grid grid-cols-[minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_380px] gap-5 p-5 sm:p-7">
          {/* Left: numbers + campaigns */}
          <div className="flex flex-col gap-4 xl:order-1 order-2">
            <div className="grid grid-cols-2 xl:grid-cols-1 gap-3">
              {tiles.map(([label, v, suf, sub]) => (
                <div key={label} className="hud-panel px-4 py-3.5" data-testid={`kpi-${label.split(" ")[0].toLowerCase()}`}>
                  <div className="hud-label">{label}</div>
                  <div className={`font-display text-[30px] font-semibold leading-tight mt-1 ${label === "Hot leads" && v > 0 ? "text-hot" : ""}`}><CountUp v={v} suffix={suf} /></div>
                  {sub && <div className="text-[11.5px] text-ink-soft">{sub}</div>}
                </div>
              ))}
              {!k && !err && Array.from({ length: 4 }, (_, i) => <div key={i} className="hud-panel h-[86px] animate-pulse" />)}
            </div>
            <div className="hud-panel p-4">
              <div className="flex items-center justify-between"><span className="hud-label">Campaigns</span><span className="hud-label !text-signal">{running.length ? "LIVE" : "IDLE"}</span></div>
              {(data?.campaigns || []).length === 0 && <div className="text-[12.5px] text-ink-soft mt-2">No campaign running. <a href="/outbound/new" className="text-signal font-semibold">Start one →</a></div>}
              {(data?.campaigns || []).map((c: any) => {
                const p = c.total ? Math.round((c.done / c.total) * 100) : 0;
                return (
                  <div key={c.id} className="mt-3">
                    <div className="flex justify-between text-[12.5px]"><a href={`/outbound/${c.id}`} className="font-semibold truncate hover:text-signal">{c.name}</a><span className="font-mono text-ink-soft shrink-0 ml-2">{c.status === "scheduled" ? "SCHEDULED" : `${c.done}/${c.total}`}</span></div>
                    <div className="h-1.5 rounded-full bg-white/[.06] mt-1.5 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-signal to-violet transition-all duration-1000" style={{ width: `${p}%`, boxShadow: "0 0 12px rgb(45 225 194 / .6)" }} /></div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Center: the core + Ask Rana */}
          <div className="flex flex-col items-center xl:order-2 order-1">
            <RanaCore size={400} mode={replay ? replay.mode : coreMode} pulse={pulse} className="max-w-[78vw]" />
            <div className="hud-state -mt-1" data-testid="live-core-state">{replay ? "REPLAYING A CALL" : state}</div>
            <div className="text-[12.5px] text-ink-soft mt-1.5 text-center">{data ? `${data.lastHour} call${data.lastHour === 1 ? "" : "s"} in the last hour` : "Connecting…"}{err && <span className="text-hot"> · {err}</span>}</div>
            <div className="w-full max-w-[640px] mt-6">
              <AskRana endpoint="/api/live/ask" onState={setAsk}
                suggestions={["How many hot leads today?", "Who should I call back first?", "Why did calls not connect?", "Summarise this week"]} />
            </div>
          </div>

          {/* Right: live feed */}
          <section className="hud-panel p-4 xl:order-3 order-3 flex flex-col min-h-[320px]">
            <div className="flex items-center justify-between mb-2"><span className="hud-label">Live feed · today</span><span className="hud-label !text-signal">{data?.feed?.length || 0} CALLS</span></div>
            <div className="flex flex-col gap-2 overflow-y-auto xl:max-h-[calc(100vh-190px)] pr-1" data-testid="live-feed">
              {data && !data.feed?.length && <div className="text-ink-soft text-[13px] m-auto text-center py-10 max-w-[240px]">No calls yet today. When your employee finishes a call it lands here — with a replay.</div>}
              {(data?.feed || []).map((f: Feed) => {
                const L = LEAD[f.lead] || LEAD.new;
                return (
                  <button key={f.id} onClick={() => setReplay({ id: f.id, mode: "thinking" as CoreMode })} className={`text-left rounded-xl border px-3 py-2.5 transition-colors hud-pop ${fresh[f.id] ? "border-signal/60 bg-signal/[.08] shadow-[0_0_24px_-10px_rgb(45_225_194)]" : "border-white/[.07] hover:border-white/20 bg-white/[.02]"}`} data-testid="feed-item">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-semibold truncate"><span className="text-ink-soft mr-1.5">{f.direction === "inbound" ? "↙" : "↗"}</span>{who(f)}</span>
                      <span className={`shrink-0 font-mono text-[10px] tracking-wider border rounded px-1.5 py-0.5 ${L.cls}`}>{L.label}</span>
                    </div>
                    <div className="text-[12px] text-ink-soft mt-1 line-clamp-2">{f.summary || f.reason || (f.seconds ? "Call finished." : "Didn't connect.")}</div>
                    <div className="font-mono text-[10.5px] text-ink-soft/70 mt-1">{time(f.at)} · {f.seconds ? dur(f.seconds) : "—"}{fresh[f.id] ? <span className="text-signal"> · JUST IN</span> : ""}</div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
        {replay && <Replay id={replay.id} onMode={(m) => setReplay((r: any) => (r ? { ...r, mode: m } : r))} onClose={() => setReplay(null)} />}
      </main>
    </div>
  );
}

/** Replays a finished call: the transcript types out turn by turn while the core speaks / listens. */
function Replay({ id, onMode, onClose }: { id: string; onMode: (m: CoreMode) => void; onClose: () => void }) {
  const [call, setCall] = useState<any>(null);
  const [shown, setShown] = useState<{ role: string; text: string }[]>([]);
  const [err, setErr] = useState("");
  const alive = useRef(true);
  const box = useRef<HTMLDivElement>(null);
  const onModeRef = useRef(onMode); onModeRef.current = onMode;

  const run = useCallback(async (c: any) => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    setShown([]);
    const turns = (c.transcript || []).filter((t: any) => t?.text);
    for (const t of turns) {
      if (!alive.current) return;
      onModeRef.current(t.role === "agent" ? "speaking" : "listening");
      const words = String(t.text).split(" ");
      setShown((s) => [...s, { role: t.role, text: "" }]);
      for (let w = 0; w < words.length; w += 2) {
        if (!alive.current) return;
        setShown((s) => { const last = s[s.length - 1]; return [...s.slice(0, -1), { ...last, text: words.slice(0, w + 2).join(" ") }]; });
        await sleep(55);
      }
      onModeRef.current("thinking");
      await sleep(260);
    }
    onModeRef.current("idle");
  }, []);

  useEffect(() => {
    alive.current = true;
    fetch(`/api/live?call=${id}`).then((r) => r.json().then((d) => ({ ok: r.ok, d }))).then(({ ok, d }) => {
      if (!ok) throw new Error(d.error || "Couldn't open the call");
      setCall(d.call); run(d.call);
    }).catch((e) => setErr(e.message));
    return () => { alive.current = false; };
  }, [id, run]);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight }); }, [shown]);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);

  const L = call ? LEAD[call.lead_status] || LEAD.new : null;
  return (
    <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex justify-end" onMouseDown={(e) => e.target === e.currentTarget && onClose()} data-testid="replay">
      <div className="w-full max-w-[520px] h-full hud-stage border-l border-white/10 flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[.07]">
          <div><div className="hud-label !text-signal">Call replay</div><div className="font-semibold text-[15px] mt-0.5">{call ? who({ name: call.caller_name, phone: call.caller_phone }) : "Loading…"}</div></div>
          <button onClick={onClose} className="w-9 h-9 rounded-full border border-white/10 text-[20px] text-ink-soft hover:text-ink" aria-label="Close">×</button>
        </div>
        {err && <div className="p-5 text-hot text-[13px]">{err}</div>}
        {call && (
          <div className="p-5 flex flex-col gap-4 overflow-y-auto">
            <div className="hud-panel p-4">
              <div className="flex items-center justify-between gap-2"><span className="hud-label">Outcome</span>{L && <span className={`font-mono text-[10.5px] tracking-wider border rounded px-2 py-0.5 ${L.cls}`}>{L.label}</span>}</div>
              {call.summary && <p className="text-[13.5px] mt-2 leading-relaxed">{call.summary}</p>}
              <div className="font-mono text-[11px] text-ink-soft mt-2">{time(call.created_at)} · {call.duration_seconds ? dur(call.duration_seconds) : "not connected"} · {call.direction}</div>
              {call.lead_reason && <div className="text-[12px] text-ink-soft mt-1">Why: {call.lead_reason}</div>}
              {call.recording_url && <audio controls src={call.recording_url} className="w-full h-9 mt-3" />}
            </div>
            <div ref={box} className="flex flex-col gap-2 max-h-[52vh] overflow-y-auto pr-1">
              {!shown.length && !(call.transcript || []).length && <div className="text-ink-soft text-[13px]">No transcript for this call.</div>}
              {shown.map((t, i) => (
                <div key={i} className={`max-w-[90%] rounded-xl px-3 py-2 text-[13px] leading-snug ${t.role === "agent" ? "self-start bg-signal/[.08] border border-signal/25" : "self-end bg-violet/[.08] border border-violet/25"}`}>
                  <div className={`font-mono text-[10px] tracking-[0.12em] mb-1 ${t.role === "agent" ? "text-signal" : "text-violet"}`}>{t.role === "agent" ? "YOUR EMPLOYEE" : "CUSTOMER"}</div>{t.text}
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => run(call)} className="btn-ghost rounded-full px-4 py-2 text-[12.5px] font-semibold">↺ Replay</button>
              <a href="/reports" className="text-[12.5px] text-signal font-semibold self-center">Open in Leads &amp; Reports →</a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
