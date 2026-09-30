"use client";
// Website voice experiences: "Talk to Rana" (RANA's own AI sales assistant) and Instant demos (you play the customer,
// Rana plays the business) — in a full-screen HUD: the voice core pulses with the real voices, the transcript types
// live, and a CRM card fills in DURING the call (/api/public/talk/peek). Live voice runs on R1 via /api/public/talk/*;
// "Watch a sample" needs no microphone and plays in real R1 voices when the audio is ready (/api/public/sample-audio).
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { SarvamVoiceCall } from "@/lib/sarvam-voice-client";
import RanaCore, { CORE_LABEL, type CoreMode } from "@/components/RanaCore";
import { SCENARIOS, TALK_LANGS, DEMO_LANGS, TALK_MAX_S, scenarioOf, type DemoKey, type TalkLang } from "./talkContent";
import type { Market } from "./markets";
import type { DemoPrefill } from "./DemoForm";
import type { VoiceLevels } from "@/lib/voice/meter";

export type LiveMode = "talk" | "demo";
type Line = { role: "agent" | "user"; text: string; typing?: boolean };
type Step = "pick" | "ready" | "connecting" | "live" | "summing" | "done" | "sample" | "error";
type Peek = { fields: any; score: number; tag?: string; interest?: string };

const LANG_FOR_FORM: Record<string, string> = { en: "English", hi: "Hindi", te: "Telugu", ta: "Tamil", kn: "Kannada" };
const TALK_FIELDS: [string, string][] = [["business", "Business"], ["city", "City"], ["calls", "Call volume"], ["pain", "Main problem"], ["languages", "Languages"], ["name", "Name"]];

function Mic({ className = "" }: { className?: string }) {
  return <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>;
}

/** Tiny UI blips (Web Audio) — only after the visitor pressed a button, very quiet. */
function useBlip() {
  const ctx = useRef<AudioContext | null>(null);
  return {
    arm() { try { ctx.current = ctx.current || new (window.AudioContext || (window as any).webkitAudioContext)(); } catch {} },
    play(f = 880, d = 0.07) {
      const c = ctx.current; if (!c) return;
      try { const o = c.createOscillator(), g = c.createGain(); o.frequency.value = f; o.type = "sine"; g.gain.setValueAtTime(0.025, c.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + d); o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + d); } catch {}
    },
    close() { try { ctx.current?.close(); } catch {} ctx.current = null; },
  };
}

/** Bars that follow a level getter at 60 fps without re-rendering React. */
function LevelBars({ get, n = 28, className = "" }: { get: () => number; n?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const g = useRef(get); g.current = get;
  useEffect(() => {
    let raf = 0, t = 0;
    const tick = () => {
      t += 0.2; const v = g.current(); const kids = ref.current?.children;
      if (kids) for (let i = 0; i < kids.length; i++) (kids[i] as HTMLElement).style.height = `${Math.max(10, v * (40 + 60 * Math.abs(Math.sin(i * 0.9 + t))))}%`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <div ref={ref} className={`flex items-center gap-[3px] h-7 ${className}`} aria-hidden>{Array.from({ length: n }, (_, i) => <i key={i} className="flex-1 rounded-sm bg-signal/80" style={{ height: "10%", transition: "height .08s" }} />)}</div>;
}

export default function RanaLive({ open, mode, scenario: startScenario, market, onClose, onBookDemo }: {
  open: boolean; mode: LiveMode; scenario?: DemoKey | null; market: Market; onClose: () => void; onBookDemo: (p: DemoPrefill) => void;
}) {
  const india = market.key === "in";
  const langs = (mode === "talk" ? TALK_LANGS : TALK_LANGS.filter((l) => DEMO_LANGS.includes(l.code))).filter((l) => india || l.code === "en" || l.code === "hi");
  const [step, setStep] = useState<Step>(mode === "demo" && !startScenario ? "pick" : "ready");
  const [scenario, setScenario] = useState<DemoKey>(startScenario || "qualify");
  const [lang, setLang] = useState<TalkLang>("en");
  const [lines, setLines] = useState<Line[]>([]);
  const [boot, setBoot] = useState<string[]>([]);
  const [left, setLeft] = useState(0);
  const [muted, setMuted] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<any>(null);
  const [talkId, setTalkId] = useState<string | null>(null);
  const [peek, setPeek] = useState<Peek | null>(null);
  const [coreMode, setCoreMode] = useState<string>("idle");
  const [sampleMode, setSampleMode] = useState<CoreMode>("idle");
  const [latency, setLatency] = useState<number | null>(null);
  const [spoken, setSpoken] = useState<string>("");
  const call = useRef<SarvamVoiceCall | null>(null);
  const sess = useRef<{ id: string; secret: string } | null>(null);
  const linesRef = useRef<Line[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);
  const tick = useRef<any>(null);
  const sampleAlive = useRef(false);
  const sampleLv = useRef<VoiceLevels>({ agent: 0, user: 0 });
  const sampleAudio = useRef<{ ctx: AudioContext | null; an: AnalyserNode | null; el: HTMLAudioElement | null }>({ ctx: null, an: null, el: null });
  const peekState = useRef({ busy: false, users: 0, at: 0 });
  const userAt = useRef(0);
  const blip = useBlip();
  const s = scenarioOf(scenario);

  // Reset whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    setStep(mode === "demo" && !startScenario ? "pick" : "ready"); setScenario(startScenario || "qualify");
    resetCall();
    document.body.style.overflow = "hidden";
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !call.current) close(); };
    window.addEventListener("keydown", esc);
    return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", esc); };
  }, [open, mode, startScenario]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight, behavior: "smooth" }); }, [lines, boot]);
  useEffect(() => () => { hangUp(true); stopSampleAudio(); blip.close(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function resetCall() {
    setLines([]); linesRef.current = []; setResult(null); setErr(""); setMuted(false); setTalkId(null);
    setPeek(null); setBoot([]); setLatency(null); setSpoken(""); peekState.current = { busy: false, users: 0, at: 0 };
  }

  function push(l: Line) {
    const prev = linesRef.current[linesRef.current.length - 1];
    if (l.role === "user") userAt.current = performance.now();
    else if (userAt.current && (!prev || prev.role === "user")) { setLatency(Math.round(performance.now() - userAt.current)); userAt.current = 0; }
    // Streaming text can arrive in pieces: merge consecutive agent chunks into one bubble.
    if (prev && prev.role === l.role && l.role === "agent" && !/[.?!।॥]$/.test(prev.text)) linesRef.current = [...linesRef.current.slice(0, -1), { ...prev, text: `${prev.text} ${l.text}`.trim() }];
    else linesRef.current = [...linesRef.current, l];
    setLines(linesRef.current);
    maybePeek();
  }

  // Live CRM card: after each thing the visitor says, ask the server what it knows so far (capped server-side).
  async function maybePeek() {
    const x = sess.current, st = peekState.current;
    if (!x || st.busy) return;
    const users = linesRef.current.filter((l) => l.role === "user").length;
    if (users <= st.users || Date.now() - st.at < 5000) return;
    st.busy = true; st.users = users; st.at = Date.now();
    try {
      const r = await fetch("/api/public/talk/peek", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ talkId: x.id, secret: x.secret, transcript: linesRef.current }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && !d.skip && d.fields) { setPeek(d); blip.play(1320, 0.05); }
    } catch {} finally { st.busy = false; }
  }

  async function report() {
    const x = sess.current; sess.current = null;
    if (!x) return null;
    const body = JSON.stringify({ talkId: x.id, secret: x.secret, transcript: linesRef.current });
    try {
      const r = await fetch("/api/public/talk/end", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
      return (await r.json().catch(() => ({})))?.result || null;
    } catch { return null; }
  }

  async function ended() {
    clearInterval(tick.current);
    call.current = null;
    setStep("summing");
    const r = await report();
    setResult(r); setStep("done"); blip.play(660, 0.12);
  }

  function hangUp(silent = false) {
    clearInterval(tick.current);
    sampleAlive.current = false;
    const c = call.current; call.current = null;
    if (c) { try { c.stop(); } catch {} if (silent) report(); }
  }

  async function begin() {
    blip.arm(); resetCall(); setStep("connecting");
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const bootLines = ["Securing a private line", "Voice engine R1 · online", `Language · ${LANG_FOR_FORM[lang] || "English"}`, mode === "demo" ? `Loading ${s.business.split(" — ")[0]}` : "Rana is joining"];
    (async () => { for (const b of bootLines) { setBoot((x) => [...x, b]); blip.play(990, 0.03); await sleep(380); } })();
    try {
      const r = await fetch("/api/public/talk/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: mode, scenario: mode === "demo" ? scenario : null, lang, market: market.key }) });
      const session = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(session.error || "Rana couldn't pick up just now.");
      sess.current = { id: session.talkId, secret: session.secret }; setTalkId(session.talkId);
      const c = new SarvamVoiceCall((e) => {
        if (e.type === "live") { setStep("live"); blip.play(1180, 0.09); setLeft(session.maxSeconds); tick.current = setInterval(() => setLeft((v) => Math.max(0, v - 1)), 1000); }
        else if (e.type === "transcript") push({ role: e.role, text: e.text });
        else if (e.type === "language") setSpoken(e.language);
        else if (e.type === "ended") ended();
        else if (e.type === "error") setErr(e.message);
      });
      call.current = c;
      await c.startWith(session, { limitMessage: null });
    } catch (e: any) {
      const msg = String(e?.message || e);
      clearInterval(tick.current); call.current = null;
      if (sess.current) report();
      setErr(/Permission|NotAllowed|denied/i.test(msg) ? "Your browser blocked the microphone. Allow it in the address bar and try again — or watch a sample call." : msg);
      setStep("error");
    }
  }

  function stopSampleAudio() {
    const a = sampleAudio.current;
    try { a.el?.pause(); } catch {}
    try { a.ctx?.close(); } catch {}
    sampleAudio.current = { ctx: null, an: null, el: null };
    sampleLv.current = { agent: 0, user: 0 };
  }

  /** Sample call: real R1 voices when saved, otherwise typed. The CRM card fills as the call goes. */
  async function playSample() {
    blip.arm(); resetCall(); setStep("sample"); sampleAlive.current = true;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    let ctx: AudioContext | null = null;
    try { ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); } catch {}
    sampleAudio.current.ctx = ctx;
    // Fetch each line's audio up front (in parallel); missing audio just means typed-only.
    const blobs = await Promise.all(s.sample.map((_, i) => fetch(`/api/public/sample-audio?s=${s.key}&i=${i}`).then((r) => (r.ok ? r.blob() : null)).catch(() => null)));
    const total = s.card.length;
    for (let i = 0; i < s.sample.length; i++) {
      if (!sampleAlive.current) return;
      const l = s.sample[i], who = l.who === "ai" ? "agent" : "user";
      setSampleMode(who === "agent" ? "speaking" : "listening");
      const words = l.text.split(" ");
      let dur = reduce ? 200 : 700 + l.text.length * 45;
      let el: HTMLAudioElement | null = null;
      if (blobs[i] && ctx) {
        el = new Audio(URL.createObjectURL(blobs[i]!));
        try {
          const src = ctx.createMediaElementSource(el); const an = ctx.createAnalyser(); an.fftSize = 512;
          src.connect(an); an.connect(ctx.destination);
          sampleAudio.current = { ctx, an, el };
          await el.play();
          dur = (isFinite(el.duration) && el.duration > 0 ? el.duration : dur / 1000) * 1000;
        } catch { el = null; }
      }
      linesRef.current = [...linesRef.current, { role: who, text: "", typing: true }]; setLines(linesRef.current);
      const per = Math.max(40, (dur * 0.92) / words.length);
      for (let w = 0; w < words.length; w++) {
        if (!sampleAlive.current) return;
        const cur = linesRef.current[linesRef.current.length - 1];
        linesRef.current = [...linesRef.current.slice(0, -1), { ...cur, text: `${cur.text} ${words[w]}`.trim() }]; setLines(linesRef.current);
        await sleep(per);
      }
      if (el) await new Promise<void>((r) => { if (el!.ended) return r(); el!.onended = () => r(); setTimeout(r, 1500); });
      const cur = linesRef.current[linesRef.current.length - 1];
      linesRef.current = [...linesRef.current.slice(0, -1), { ...cur, typing: false }]; setLines(linesRef.current);
      const shown = s.card.filter((c) => c.at <= i);
      if (shown.length !== s.card.filter((c) => c.at <= i - 1).length) blip.play(1320, 0.05);
      setPeek({ fields: shown.map((c) => ({ label: c.label, value: c.value })), score: Math.round(18 + (78 * shown.length) / Math.max(1, total)), tag: shown.length >= total ? s.outcome.split(" · ")[0] : "QUALIFYING" });
      setSampleMode("thinking");
      await sleep(reduce ? 50 : 420);
    }
    stopSampleAudio();
    if (sampleAlive.current) { setSampleMode("idle"); setResult({ outcome: s.outcome, sample: true }); setStep("done"); blip.play(660, 0.12); }
  }

  // Levels for the core: the live call, or the sample's audio element (who is talking decides the colour).
  const getLevels = (): VoiceLevels => {
    if (call.current) return call.current.levels();
    const a = sampleAudio.current;
    if (a.an) {
      const buf = new Uint8Array(a.an.fftSize); a.an.getByteTimeDomainData(buf);
      let sum = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
      const lv = Math.min(1, Math.sqrt(sum / buf.length) * 4.5);
      return sampleMode === "listening" ? { agent: 0, user: lv } : { agent: lv, user: 0 };
    }
    return { agent: 0, user: 0 };
  };
  const barLevel = () => { const l = getLevels(); const v = Math.max(l.agent, l.user); return v || (step === "sample" && sampleMode !== "thinking" ? 0.35 : step === "live" ? 0.06 : 0.03); };

  const close = () => { hangUp(true); stopSampleAudio(); onClose(); };
  const book = () => {
    const r = result || {};
    const note = mode === "talk"
      ? [r.business && `Business: ${r.business}`, r.calls && `Calls: ${r.calls}`, r.pain && `Pain: ${r.pain}`].filter(Boolean).join(" · ")
      : `Tried the ${s.title} demo on the website.`;
    onBookDemo({ name: r.name || undefined, company: r.company || undefined, phone: r.phone || undefined, email: r.email || undefined, message: note || undefined, languages: [LANG_FOR_FORM[lang]].filter(Boolean), talkId: talkId || undefined });
  };
  if (!open) return null;

  const inCall = step === "connecting" || step === "live" || step === "sample" || step === "summing" || step === "done";
  const mm = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  const title = mode === "talk" ? "Talk to Rana" : step === "pick" ? "Try an instant demo" : s.title;
  const chip = (on: boolean) => `rounded-full border px-3 py-1.5 font-mono text-[11.5px] tracking-wider transition-colors ${on ? "border-signal/60 bg-signal/10 text-signal shadow-[0_0_14px_-4px_rgb(45_225_194)]" : "border-white/10 text-ink-soft hover:text-ink hover:border-white/25"}`;
  const coreModeProp: CoreMode = step === "live" ? "auto" : step === "sample" ? sampleMode : step === "connecting" || step === "summing" ? "thinking" : "idle";
  const stateText = step === "connecting" ? "CONNECTING" : step === "summing" ? "WRAPPING UP" : step === "done" ? (mode === "talk" ? "LEAD CARD READY" : "CALL COMPLETE") : step === "live" && muted ? "MUTED" : CORE_LABEL[coreMode] || "STANDBY";
  const subText = step === "connecting" ? "Allow the microphone if your browser asks." : step === "live" ? (coreMode === "speaking" ? "Rana is talking — interrupt any time." : "Go ahead, Rana is listening…") : step === "sample" ? "Sample call · no microphone needed" : step === "summing" ? "Writing up what your team would get…" : step === "done" ? "Here's what your team would see." : "";
  const agentTag = mode === "demo" ? `RANA · ${s.business.split(" — ")[0].toUpperCase()}` : "RANA";

  return createPortal(
    <div className="fixed inset-0 z-[120] hud-stage overflow-y-auto overflow-x-hidden" data-testid="rana-live" role="dialog" aria-modal="true" aria-labelledby="live-title">
      <div className="hud-scan" aria-hidden />
      {/* ---------- Top bar ---------- */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 sm:px-6 py-3.5 bg-[#070a10]/70 backdrop-blur">
        <div className="flex items-center gap-2.5 font-mono text-[12px] tracking-[0.18em] font-semibold">
          <span className={`w-2 h-2 rounded-full ${step === "live" ? "bg-signal live-dot" : "bg-signal/60"}`} />
          <span id="live-title">{mode === "talk" ? "RANA · LIVE" : "RANA · INSTANT DEMO"}</span>
          {inCall && <span className="hidden sm:inline text-ink-soft font-normal tracking-[0.12em]">/ {title.toUpperCase()}</span>}
        </div>
        <div className="flex items-center gap-2">
          {inCall && langs.length > 1 && <div className="hidden md:flex gap-1.5" aria-label="Language">{langs.map((l) => <span key={l.code} className={chip(l.code === lang || (!!spoken && LANG_FOR_FORM[l.code]?.toLowerCase() === spoken.toLowerCase().split(/[-\s]/)[0]))}>{l.label}</span>)}</div>}
          <button onClick={close} className="w-9 h-9 rounded-full border border-white/10 text-ink-soft hover:text-ink hover:border-white/30 text-[20px] leading-none" aria-label="Close" data-testid="live-close">×</button>
        </div>
      </div>

      {/* ---------- Pick a demo / brief ---------- */}
      {!inCall && (
        <div className="relative max-w-[980px] mx-auto px-4 sm:px-6 pb-12 grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[340px_1fr] gap-8 items-center min-h-[calc(100vh-70px)]">
          <div className="flex flex-col items-center">
            <RanaCore size={320} mode={step === "error" ? "alert" : "idle"} className="max-w-[78vw]" onClick={step === "pick" ? undefined : begin} label={mode === "talk" ? "Start talking to Rana" : "Start the live demo"}>
              {step !== "pick" && <span className="flex flex-col items-center gap-2 font-mono text-[11px] tracking-[0.2em] text-ink"><Mic className="w-7 h-7 text-signal drop-shadow-[0_0_8px_rgb(45_225_194)]" />TAP TO TALK</span>}
            </RanaCore>
            <div className="hud-state mt-3">{step === "error" ? "CHECK MIC" : "STANDBY"}</div>
          </div>
          <div>
            <div className="hud-label">{mode === "talk" ? "// Live voice · no sign-up" : "// Instant demo · ~90 seconds"}</div>
            <h2 className="font-display text-[30px] sm:text-[38px] font-semibold tracking-tight mt-1.5">{title}</h2>
            {step === "pick" && (
              <>
                <p className="text-ink-soft text-[15px] mt-2">Pick a call. You play the customer, Rana plays the business — live.</p>
                <div className="grid sm:grid-cols-2 gap-2.5 mt-5" data-testid="demo-picker">
                  {SCENARIOS.map((x) => (
                    <button key={x.key} type="button" onClick={() => { setScenario(x.key); setStep("ready"); }} data-testid={`scenario-${x.key}`}
                      className="hud-panel text-left p-4 hover:border-signal/50 hover:bg-signal/5 transition-colors">
                      <div className="text-[15px] font-semibold"><span className="mr-2" aria-hidden>{x.icon}</span>{x.title}</div>
                      <div className="text-[13px] text-ink-soft mt-1 leading-snug">{x.line}</div>
                    </button>
                  ))}
                </div>
              </>
            )}
            {(step === "ready" || step === "error") && (
              <>
                {mode === "talk" ? (
                  <p className="text-ink-soft text-[15px] mt-2 leading-relaxed max-w-[560px]">Rana is RANA AI&apos;s own AI employee. Tell her about your business — she&apos;ll ask a few questions, show how an AI employee would handle <i>your</i> calls, and build your lead card <b className="text-ink">live while you talk</b>.</p>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-2.5 mt-4 text-[13.5px]" data-testid="demo-brief">
                    <div className="hud-panel p-4"><div className="hud-label !text-signal">Rana plays</div><div className="font-semibold mt-1">{s.business}</div><div className="text-ink-soft mt-1">{s.ranaPlays}</div></div>
                    <div className="hud-panel p-4"><div className="hud-label !text-violet">You play</div><div className="text-ink-soft mt-1">{s.youPlay}</div>
                      <div className="hud-label mt-3">Try saying</div><ul className="mt-1 flex flex-col gap-0.5">{s.tryThis.map((t) => <li key={t}>“{t}”</li>)}</ul></div>
                  </div>
                )}
                {langs.length > 1 && (
                  <div className="mt-5">
                    <div className="hud-label mb-2">Talk in</div>
                    <div className="flex flex-wrap gap-2" role="group" aria-label="Language">
                      {langs.map((l) => <button key={l.code} type="button" onClick={() => setLang(l.code)} className={chip(lang === l.code)} data-testid={`lang-${l.code}`}>{l.label}</button>)}
                    </div>
                    {mode === "talk" && india && <div className="text-[11.5px] text-ink-soft mt-2">Speak any of 11 Indian languages — Rana follows you if you switch.</div>}
                  </div>
                )}
                {step === "error" && err && <div className="mt-5 rounded-xl border border-hot/40 bg-hot/10 text-hot px-4 py-3 text-[13.5px]" data-testid="live-error">{err}</div>}
                <div className="flex flex-wrap gap-3 mt-6">
                  <button type="button" onClick={begin} className="btn-glow rounded-full px-6 py-3 text-[14.5px] font-semibold flex items-center gap-2" data-testid="live-start"><Mic />{mode === "talk" ? "Start talking" : "Start live demo"}</button>
                  {mode === "demo" && <button type="button" onClick={playSample} className="btn-ghost rounded-full px-5 py-3 text-[14px] font-medium" data-testid="live-sample">▶ Watch a sample call</button>}
                  {mode === "demo" && <button type="button" onClick={() => setStep("pick")} className="text-[13.5px] text-ink-soft hover:text-ink px-2">← Other demos</button>}
                </div>
                <p className="text-[11.5px] text-ink-soft/80 mt-4">Uses your microphone. {mode === "talk" ? `Up to ${Math.round(TALK_MAX_S / 60)} minutes` : "About 90 seconds"}. The conversation is recorded so our team can follow up — see our <Link href="/legal/privacy" className="underline">privacy policy</Link>.</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* ---------- The call: transcript | core | live lead card ---------- */}
      {inCall && (
        <div className="relative max-w-[1320px] mx-auto px-4 sm:px-6 pb-10 grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(260px,1fr)_minmax(320px,1.2fr)_minmax(280px,1fr)] gap-5 lg:gap-6 items-center lg:min-h-[calc(100vh-70px)]">
          {/* Core */}
          <div className="flex flex-col items-center lg:order-2">
            <RanaCore size={420} mode={coreModeProp} levels={getLevels} onMode={setCoreMode} className="max-w-[80vw]" />
            <div className="hud-state mt-1" data-testid="live-state">{stateText}</div>
            <div className="text-ink-soft text-[13px] mt-2 text-center min-h-[20px]">{subText}</div>
            {(step === "live" || step === "connecting" || step === "sample") && (
              <div className="flex items-center gap-3 mt-5 flex-wrap justify-center">
                <LevelBars get={barLevel} className="w-[150px]" />
                {step === "live" && <span className="font-mono text-[12.5px] text-ink-soft min-w-[70px] text-center" data-testid="live-timer">{mm} left</span>}
                {step === "live" && <button type="button" onClick={() => { const c = call.current; if (!c) return; if (muted) c.unmute(); else c.mute(); setMuted(!muted); }} className={`w-11 h-11 rounded-full border grid place-items-center ${muted ? "border-hot/50 text-hot bg-hot/10" : "border-white/15 text-ink bg-white/[.04] hover:border-white/30"}`} aria-label={muted ? "Unmute" : "Mute"} data-testid="live-mute"><Mic /></button>}
                {(step === "live" || step === "connecting") && <button type="button" onClick={() => { const c = call.current; if (c) c.stop(); else { setStep("ready"); } }} className="rounded-full px-5 h-11 text-[13.5px] font-semibold bg-miss/80 hover:bg-miss text-white" data-testid="live-end">End call</button>}
                {step === "sample" && <button type="button" onClick={() => { sampleAlive.current = false; stopSampleAudio(); setStep("ready"); }} className="btn-ghost rounded-full px-5 h-11 text-[13.5px]">Stop</button>}
              </div>
            )}
            {err && step === "live" && <div className="text-[12.5px] text-hot mt-2">{err}</div>}
            {step === "done" && (
              <div className="mt-5 hud-panel p-5 w-full max-w-[460px] text-center" data-testid="live-done">
                <div className="font-display text-[20px] font-semibold">Want Rana to do this for your business?</div>
                <p className="text-ink-soft text-[13.5px] mt-1">A 20-minute call: we set her up with your scripts, prices and languages — and she starts taking your calls.</p>
                <div className="flex flex-wrap gap-3 mt-4 justify-center">
                  <button type="button" onClick={book} className="btn-glow hud-cta-ready rounded-full px-6 py-3 text-[14px] font-semibold" data-testid="live-book">Book a demo</button>
                  <Link href="/signup" className="btn-ghost rounded-full px-5 py-3 text-[14px] font-medium">Start free — 14 days</Link>
                </div>
                <div className="mt-3">
                  {mode === "demo" && <button type="button" onClick={() => { resetCall(); setStep("pick"); }} className="text-[13px] text-ink-soft hover:text-ink px-2" data-testid="live-another">Try another demo →</button>}
                  {mode === "talk" && <button type="button" onClick={() => { resetCall(); setStep("ready"); }} className="text-[13px] text-ink-soft hover:text-ink px-2">Talk again</button>}
                </div>
              </div>
            )}
          </div>

          {/* Transcript */}
          <section className="hud-panel p-4 lg:order-1 flex flex-col">
            <div className="flex items-center justify-between mb-3"><span className="hud-label">Transcript</span><span className="hud-label !text-signal" data-testid="live-latency">{latency ? `RESPONSE ${(latency / 1000).toFixed(1)} s` : step === "sample" ? "SAMPLE" : "— —"}</span></div>
            <div ref={boxRef} className="h-[260px] lg:h-[430px] overflow-y-auto flex flex-col gap-2.5 pr-1" data-testid="live-transcript" aria-live="polite">
              {boot.length > 0 && !lines.length && boot.map((b, i) => <div key={i} className="font-mono text-[12px] text-signal/80 hud-pop">▸ {b}{i === boot.length - 1 && step === "connecting" && <span className="hud-caret" />}</div>)}
              {!lines.length && !boot.length && <div className="text-ink-soft text-[13.5px] m-auto text-center max-w-[220px]">{step === "sample" ? "Starting the sample call…" : "What you both say shows up here as you speak."}</div>}
              {lines.map((l, i) => (
                <div key={i} className={`max-w-[92%] rounded-xl px-3 py-2 text-[13.5px] leading-snug hud-pop ${l.role === "agent" ? "self-start bg-signal/[.08] border border-signal/25" : "self-end bg-violet/[.08] border border-violet/25"}`}>
                  <div className={`font-mono text-[10px] tracking-[0.12em] mb-1 ${l.role === "agent" ? "text-signal" : "text-violet"}`}>{l.role === "agent" ? agentTag : "YOU"}</div>
                  {l.text}{l.typing && <span className="hud-caret" />}
                </div>
              ))}
            </div>
          </section>

          {/* Live lead card */}
          <section className="hud-panel p-4 lg:order-3" data-testid="live-card">
            <div className="flex items-center justify-between mb-2"><span className="hud-label">{mode === "talk" ? "Live lead card" : "Live CRM card"}</span>
              <span className="hud-label !text-signal">{step === "done" ? "READY" : peek ? "BUILDING" : "WAITING"}</span></div>
            {step === "done" ? (mode === "talk" ? <TalkCard r={result} /> : <DemoCard r={result} scenarioTitle={s.title} />) : <LiveCard mode={mode} peek={peek} />}
          </section>
        </div>
      )}
    </div>,
    document.body,
  );
}

/** The card while the call is happening: fields light up as Rana learns them, the score climbs. */
function LiveCard({ mode, peek }: { mode: LiveMode; peek: Peek | null }) {
  const seen = useRef<Record<string, string>>({});
  const rows: [string, string | null][] = mode === "talk"
    ? TALK_FIELDS.map(([k, label]) => [label, peek?.fields?.[k] || null])
    : [...(Array.isArray(peek?.fields) ? peek!.fields : []).map((f: any) => [f.label, f.value] as [string, string]), ...Array.from({ length: Math.max(0, 4 - (Array.isArray(peek?.fields) ? peek!.fields.length : 0)) }, () => ["· · ·", null] as [string, null])];
  const fresh = (k: string, v: string | null) => { if (!v) return false; const was = seen.current[k]; seen.current[k] = v; return was !== v; };
  const score = peek?.score || 0;
  const hot = mode === "talk" ? peek?.interest === "hot" || score >= 75 : score >= 75;
  const tag = mode === "talk" ? (peek ? (hot ? "HOT LEAD" : peek.interest === "cold" ? "COLD" : "QUALIFYING") : "SCORING…") : peek?.tag || "SCORING…";
  return (
    <div>
      {rows.map(([k, v], i) => (
        <div key={`${k}-${i}`} className="flex justify-between gap-3 py-2.5 border-b border-white/[.07] text-[13px]">
          <span className="text-ink-soft shrink-0">{k}</span>
          <b className={`text-right font-semibold ${v ? (fresh(k, v) ? "hud-new" : "") : "text-white/20 font-mono tracking-[0.2em]"}`}>{v || "· · ·"}</b>
        </div>
      ))}
      <div className="flex items-center gap-4 mt-4">
        <div className="hud-gauge w-[72px] h-[72px] shrink-0" style={{ ["--p" as any]: score }}><span className="font-mono text-[18px] font-bold" data-testid="live-score">{score}</span></div>
        <div>
          <span className={`inline-block font-mono text-[11px] tracking-[0.16em] font-bold rounded-md px-2.5 py-1.5 ${hot ? "bg-hot/15 text-hot shadow-[0_0_16px_-6px_rgb(245_179_86)]" : "bg-white/[.06] text-ink-soft"}`}>{tag}</span>
          <div className="text-[12px] text-ink-soft mt-2 leading-snug">{peek ? "Updated live from what you say." : "Rana scores the lead while you talk."}</div>
        </div>
      </div>
    </div>
  );
}

function Field({ k, v }: { k: string; v?: any }) {
  if (!v || (Array.isArray(v) && !v.length)) return null;
  return <div className="flex gap-3 py-1.5 border-b border-white/[.06] last:border-0 text-[13.5px]"><span className="w-[110px] shrink-0 text-ink-soft">{k}</span><span className="font-medium">{Array.isArray(v) ? v.join(", ") : String(v)}</span></div>;
}

function TalkCard({ r }: { r: any }) {
  if (!r) return <p className="text-ink-soft text-[14px]">Rana didn&apos;t catch enough to fill a lead card this time — no problem. Book a demo and we&apos;ll show you everything for your business.</p>;
  const tone = r.interest === "hot" ? "text-hot bg-hot/10 border-hot/40" : r.interest === "warm" ? "text-warm bg-warm/10 border-warm/40" : "text-ink-soft bg-white/5 border-white/15";
  return (
    <div data-testid="lead-card">
      <div className="flex items-center justify-between gap-3">
        <div className="hud-label !text-signal">The lead card your team gets</div>
        {r.interest && <span className={`text-[11px] font-mono font-semibold uppercase rounded-full border px-2.5 py-0.5 ${tone}`}>{r.interest} lead</span>}
      </div>
      {r.summary && <p className="text-[14px] mt-3 leading-relaxed">{r.summary}</p>}
      <div className="mt-3">
        <Field k="Name" v={r.name} /><Field k="Company" v={r.company} /><Field k="Business" v={r.business} /><Field k="City" v={r.city} />
        <Field k="Calls" v={r.calls} /><Field k="Languages" v={r.languages} /><Field k="Main problem" v={r.pain} /><Field k="Next step" v={r.next_step} />
      </div>
      <div className="text-[11.5px] text-ink-soft mt-3">Every call RANA takes ends like this — sent to your dashboard, WhatsApp, Slack or email.</div>
    </div>
  );
}

function DemoCard({ r, scenarioTitle }: { r: any; scenarioTitle: string }) {
  if (!r) return <p className="text-ink-soft text-[14px]">That was quick! Try it again and play along a little longer — or book a demo and we&apos;ll run it on your own business.</p>;
  return (
    <div data-testid="demo-outcome">
      <div className="hud-label !text-signal">{r.sample ? "Sample · " : ""}After this {scenarioTitle.toLowerCase()} call</div>
      {r.outcome && <div className="mt-3 inline-block text-[12px] font-mono text-hot border border-hot/60 bg-hot/10 rounded px-2.5 py-1 shadow-[0_0_16px_-6px_rgb(245_179_86)]">{r.outcome}</div>}
      {r.summary && <p className="text-[14px] mt-3 leading-relaxed">{r.summary}</p>}
      {Array.isArray(r.fields) && r.fields.length > 0 && <div className="mt-3">{r.fields.slice(0, 5).map((f: any) => <Field key={f.label} k={f.label} v={f.value} />)}</div>}
      <div className="text-[11.5px] text-ink-soft mt-3">Recorded, transcribed and scored automatically — the next step lands with the right person on your team.</div>
    </div>
  );
}
