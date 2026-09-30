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
import { SCENARIOS, TALK_LANGS, DEMO_LANGS, scenarioOf, type DemoKey, type TalkLang } from "./talkContent";
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

//@@RANA_SPLIT@@
