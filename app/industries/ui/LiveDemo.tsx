"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SarvamVoiceCall } from "@/lib/sarvam-voice-client";
import { ElevenVoiceCall } from "@/lib/eleven-voice-client";
import RanaCore from "@/components/RanaCore";
import type { Industry, UseCase } from "../types";
import type { SiteProfile } from "@/lib/siteProfile";
import type { TalkLang } from "@/app/landing/talkContent";
import { greetingFor } from "@/lib/industryDemo";
import { cleanFirstName } from "@/lib/callStyle";

type Line = { role: "agent" | "user"; text: string };
type Step = "ready" | "connecting" | "live" | "summing" | "done" | "error";
export const DEMO_LANG_OPTIONS: [string, string][] = [["en", "English"], ["hi", "हिन्दी"], ["te", "తెలుగు"], ["ta", "தமிழ்"]];

/** "Try live demo": the visitor talks to Rana, who plays this business's AI employee for this one use case. */
export default function LiveDemo({ ind, uc, profile, lang, onBuild }: { ind: Industry; uc: UseCase; profile: SiteProfile | null; lang: string; onBuild: () => void }) {
  const [step, setStep] = useState<Step>("ready");
  const [lines, setLines] = useState<Line[]>([]);
  const [err, setErr] = useState("");
  const [left, setLeft] = useState(0);
  const [result, setResult] = useState<any>(null);
  const [name, setName] = useState("");
  const call = useRef<SarvamVoiceCall | ElevenVoiceCall | null>(null);
  const sess = useRef<{ id: string; secret: string } | null>(null);
  const linesRef = useRef<Line[]>([]);
  const tick = useRef<any>(0);
  const box = useRef<HTMLDivElement>(null);
  const biz = profile?.company || ind.biz;
  const out = uc.dir === "out";
  const opening = greetingFor(uc, biz, (["en", "hi", "te", "ta", "kn"].includes(lang) ? lang : "en") as TalkLang, out ? cleanFirstName(name) : "");

  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" }); }, [lines]);
  // Changing the use case, website or language ends any call in progress.
  useEffect(() => { hang(); setStep("ready"); setLines([]); setResult(null); setErr(""); }, [uc.key, profile?.url, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => hang(), []); // eslint-disable-line react-hooks/exhaustive-deps

  function push(l: Line) {
    const prev = linesRef.current[linesRef.current.length - 1];
    if (prev && prev.role === "agent" && l.role === "agent" && !/[.?!।]$/.test(prev.text)) linesRef.current = [...linesRef.current.slice(0, -1), { ...prev, text: `${prev.text} ${l.text}` }];
    else linesRef.current = [...linesRef.current, l];
    setLines(linesRef.current);
  }
  async function report() {
    const x = sess.current; sess.current = null; if (!x) return null;
    try {
      const r = await fetch("/api/public/talk/end", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ talkId: x.id, secret: x.secret, transcript: linesRef.current }), keepalive: true });
      return (await r.json().catch(() => ({})))?.result || null;
    } catch { return null; }
  }
  function hang() {
    clearInterval(tick.current);
    const c = call.current; call.current = null;
    if (c) { try { c.stop(); } catch {} report(); }
  }
  async function ended() {
    clearInterval(tick.current); call.current = null; setStep("summing");
    setResult(await report()); setStep("done");
  }
  async function start() {
    setErr(""); setLines([]); linesRef.current = []; setResult(null); setStep("connecting");
    try {
      const r = await fetch("/api/public/talk/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "usecase", industry: ind.slug, useCase: uc.key, profile, lang, market: "in", name: out ? cleanFirstName(name) : "" }) });
      const session = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(session.error || "Rana couldn't pick up just now.");
      sess.current = { id: session.talkId, secret: session.secret };
      const c = new (session.engine === "elevenlabs" ? ElevenVoiceCall : SarvamVoiceCall)((e: any) => {
        if (e.type === "live") { setStep("live"); setLeft(session.maxSeconds); tick.current = setInterval(() => setLeft((v) => Math.max(0, v - 1)), 1000); }
        else if (e.type === "transcript") push({ role: e.role, text: e.text });
        else if (e.type === "ended") ended();
        else if (e.type === "error") setErr(e.message);
      });
      call.current = c;
      await c.startWith(session, { limitMessage: null });
    } catch (e: any) {
      const msg = String(e?.message || e);
      clearInterval(tick.current); call.current = null; if (sess.current) report();
      setErr(/Permission|NotAllowed|denied/i.test(msg) ? "Your browser blocked the microphone. Allow it in the address bar and try again — or watch the sample." : msg);
      setStep("error");
    }
  }
  const levels = () => call.current?.levels() || { agent: 0, user: 0 };
  const mmss = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;

  return (
    <div className="flex flex-col h-full" data-testid="live-demo">
      {(step === "ready" || step === "error") && (
        <div className="flex flex-col gap-4">
          <div className="grid sm:grid-cols-2 gap-3 text-[13.5px]">
            <div className="rounded-xl border border-white/10 bg-white/[.03] p-3.5"><div className="text-[10.5px] font-mono text-ink-soft mb-1">YOU PLAY</div>{uc.who[0].toUpperCase() + uc.who.slice(1)}</div>
            <div className="rounded-xl border border-signal/25 bg-signal/[.06] p-3.5"><div className="text-[10.5px] font-mono text-signal mb-1">RANA PLAYS</div>The AI employee of <b>{biz}</b>{uc.dir === "out" ? ", calling you" : ", answering your call"}</div>
          </div>
          {out && (
            <label className="flex flex-col gap-1.5 text-[13px]">
              <span className="text-[10.5px] font-mono text-ink-soft">YOUR FIRST NAME <span className="text-ink-soft/70">— so Rana can call you by name</span></span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="e.g. Rahul" autoComplete="given-name" className="rounded-xl border border-white/10 bg-white/[.04] px-3 py-2.5 text-[14px] outline-none focus:border-signal/70 max-w-[260px]" data-testid="live-name" />
            </label>
          )}
          <div className={`rounded-xl border p-3.5 ${out ? "border-violet/30 bg-violet/[.06]" : "border-signal/25 bg-signal/[.05]"}`} data-testid="live-opening">
            <div className={`text-[10.5px] font-mono mb-1.5 ${out ? "text-violet" : "text-signal"}`}>{out ? "OUTBOUND · RANA'S FIRST THREE SECONDS" : "INBOUND · RANA ANSWERS"}</div>
            <div className="text-[14.5px] leading-snug">&ldquo;{opening}&rdquo;</div>
            <div className="text-[12px] text-ink-soft mt-2">{out ? "Your name, who's calling and why it matters to you — then she asks for permission." : "Then she listens. You lead; she answers, helps and books."}</div>
          </div>
          <div className="rounded-xl border border-white/10 p-3.5 text-[13.5px]">
            <div className="text-[10.5px] font-mono text-ink-soft mb-2">{out ? "THEN RANA WILL ASK THINGS LIKE" : "IF IT HELPS YOU, RANA MAY ASK"}</div>
            <ul className="flex flex-col gap-1.5">{uc.asks.slice(0, 5).map((a) => <li key={a} className="flex gap-2"><span className="text-signal">›</span>{a}</li>)}</ul>
            <div className="text-[12px] text-ink-soft mt-3">Answer naturally — or interrupt, change your mind, ask your own questions. Rana adapts.</div>
          </div>
          {err && <div className="text-[13px] text-miss" role="alert">{err}</div>}
          <button type="button" onClick={start} className="btn-glow rounded-full px-6 py-3 text-[15px] font-semibold self-start flex items-center gap-2" data-testid="live-start">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
            Start live demo · 3 min
          </button>
          <p className="text-[11.5px] text-ink-soft/80">Uses your microphone. The conversation is recorded so our team can follow up — see our <Link href="/legal/privacy" className="underline">privacy policy</Link>.</p>
        </div>
      )}
      {(step === "connecting" || step === "live" || step === "summing") && (
        <div className="grid sm:grid-cols-[200px_1fr] gap-4 items-start">
          <div className="flex flex-col items-center gap-2">
            <RanaCore size={190} mode="auto" levels={levels} hud={false} />
            <div className="font-mono text-[11px] text-ink-soft">{step === "connecting" ? "CONNECTING…" : step === "summing" ? "SAVING THE CALL…" : `LIVE · ${mmss} LEFT`}</div>
            {step === "live" && <button type="button" onClick={() => { const c = call.current; if (c) c.stop(); }} className="btn-ghost rounded-full px-4 py-1.5 text-[13px]" data-testid="live-hangup">End call</button>}
          </div>
          <div ref={box} className="flex flex-col gap-2.5 max-h-[340px] overflow-y-auto pr-1 min-h-[200px]" aria-live="polite">
            {lines.length === 0 && <div className="text-[13px] text-ink-soft">{step === "connecting" ? "Allow the microphone if your browser asks." : "Rana is speaking…"}</div>}
            {lines.map((l, i) => (
              <div key={i} className={`max-w-[90%] ${l.role === "agent" ? "self-start" : "self-end text-right"}`}>
                <div className={`text-[10.5px] font-mono mb-0.5 ${l.role === "agent" ? "text-signal" : "text-ink-soft"}`}>{l.role === "agent" ? "RANA" : "YOU"}</div>
                <div className={`rounded-2xl px-3 py-2 text-[13.5px] leading-snug ${l.role === "agent" ? "bg-signal/10 border border-signal/20" : "bg-white/[.05] border border-white/10"}`}>{l.text}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {step === "done" && (
        <div className="flex flex-col gap-3" data-testid="live-result">
          <div className="rounded-xl border border-hot/50 bg-hot/10 p-4">
            <div className="text-[10.5px] font-mono text-ink-soft">WHAT YOUR TEAM WOULD SEE AFTER THIS CALL</div>
            <div className="font-mono text-[13px] text-hot mt-1">{result?.outcome || "Call saved with recording and transcript"}</div>
            {Array.isArray(result?.fields) && result.fields.length > 0 && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-3 text-[13px]">{result.fields.slice(0, 6).map((f: any, i: number) => <div key={i}><span className="text-ink-soft">{f.label}: </span>{f.value}</div>)}</div>
            )}
            {result?.summary && <div className="text-[13px] text-ink-soft mt-3">{result.summary}</div>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onBuild} className="btn-glow rounded-full px-5 py-2.5 text-[14px] font-semibold">Build this for my business →</button>
            <button type="button" onClick={() => setStep("ready")} className="btn-ghost rounded-full px-5 py-2.5 text-[14px]">Try again</button>
          </div>
        </div>
      )}
    </div>
  );
}
