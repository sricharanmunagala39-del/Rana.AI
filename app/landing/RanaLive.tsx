"use client";
// Website voice experiences: "Talk to Rana" (RANA's own AI sales assistant) and Instant demos (you play the customer,
// Rana plays the business). Live voice runs on R1 via /api/public/talk/*; "Watch a sample" needs no microphone.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SarvamVoiceCall } from "@/lib/sarvam-voice-client";
import { SCENARIOS, TALK_LANGS, DEMO_LANGS, scenarioOf, type DemoKey, type TalkLang } from "./talkContent";
import type { Market } from "./markets";
import type { DemoPrefill } from "./DemoForm";

export type LiveMode = "talk" | "demo";
type Line = { role: "agent" | "user"; text: string };
type Step = "pick" | "ready" | "connecting" | "live" | "summing" | "done" | "sample" | "error";

const LANG_FOR_FORM: Record<string, string> = { en: "English", hi: "Hindi", te: "Telugu", ta: "Tamil", kn: "Kannada" };

function Mic({ className = "" }: { className?: string }) {
  return <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>;
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
  const [left, setLeft] = useState(0);
  const [muted, setMuted] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<any>(null);
  const [talkId, setTalkId] = useState<string | null>(null);
  const call = useRef<SarvamVoiceCall | null>(null);
  const sess = useRef<{ id: string; secret: string } | null>(null);
  const linesRef = useRef<Line[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);
  const tick = useRef<any>(null);
  const sampleAlive = useRef(false);
  const s = scenarioOf(scenario);

  // Reset whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    setStep(mode === "demo" && !startScenario ? "pick" : "ready"); setScenario(startScenario || "qualify");
    setLines([]); linesRef.current = []; setResult(null); setErr(""); setMuted(false); setTalkId(null);
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open, mode, startScenario]);
  useEffect(() => { boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight, behavior: "smooth" }); }, [lines]);
  useEffect(() => () => { hangUp(true); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function push(l: Line) {
    const prev = linesRef.current[linesRef.current.length - 1];
    // Streaming text can arrive in pieces: merge consecutive agent chunks into one bubble.
    if (prev && prev.role === l.role && l.role === "agent" && !/[.?!।॥]$/.test(prev.text)) linesRef.current = [...linesRef.current.slice(0, -1), { ...prev, text: `${prev.text} ${l.text}`.trim() }];
    else linesRef.current = [...linesRef.current, l];
    setLines(linesRef.current);
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
    setResult(r); setStep("done");
  }

  function hangUp(silent = false) {
    clearInterval(tick.current);
    sampleAlive.current = false;
    const c = call.current; call.current = null;
    if (c) { try { c.stop(); } catch {} if (silent) report(); }
  }

  async function begin() {
    setErr(""); setLines([]); linesRef.current = []; setResult(null); setStep("connecting");
    try {
      const r = await fetch("/api/public/talk/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: mode, scenario: mode === "demo" ? scenario : null, lang, market: market.key }) });
      const session = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(session.error || "Rana couldn't pick up just now.");
      sess.current = { id: session.talkId, secret: session.secret }; setTalkId(session.talkId);
      const c = new SarvamVoiceCall((e) => {
        if (e.type === "live") { setStep("live"); setLeft(session.maxSeconds); tick.current = setInterval(() => setLeft((v) => Math.max(0, v - 1)), 1000); }
        else if (e.type === "transcript") push({ role: e.role, text: e.text });
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

  async function playSample() {
    setStep("sample"); setLines([]); linesRef.current = []; sampleAlive.current = true;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    for (const l of s.sample) {
      if (!sampleAlive.current) return;
      push({ role: l.who === "ai" ? "agent" : "user", text: l.text });
      await sleep(reduce ? 50 : 900 + l.text.length * 28);
    }
    if (sampleAlive.current) { setResult({ outcome: s.outcome, sample: true }); setStep("done"); }
  }

  const close = () => { hangUp(true); onClose(); };
  const book = () => {
    const r = result || {};
    const note = mode === "talk"
      ? [r.business && `Business: ${r.business}`, r.calls && `Calls: ${r.calls}`, r.pain && `Pain: ${r.pain}`].filter(Boolean).join(" · ")
      : `Tried the ${s.title} demo on the website.`;
    onBookDemo({ name: r.name || undefined, company: r.company || undefined, phone: r.phone || undefined, email: r.email || undefined, message: note || undefined, languages: [LANG_FOR_FORM[lang]].filter(Boolean), talkId: talkId || undefined });
  };
  if (!open) return null;

  const mm = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  const title = mode === "talk" ? "Talk to Rana" : step === "pick" ? "Try an instant demo" : s.title;
  const chip = (on: boolean) => `rounded-full border px-3 py-1.5 text-[12.5px] transition-colors ${on ? "border-signal/60 bg-signal/10 text-signal font-semibold" : "border-white/10 text-ink-soft hover:text-ink hover:border-white/25"}`;

  return (
    <div className="fixed inset-0 z-[80] flex items-start sm:items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm overflow-y-auto" onMouseDown={(e) => { if (e.target === e.currentTarget && step !== "live" && step !== "connecting") close(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="live-title" className="card card-hi dialog-solid w-full max-w-[720px] my-6 p-6 sm:p-8 relative animate-rise" data-testid="rana-live">
        <button onClick={close} className="absolute top-4 right-5 text-[28px] leading-none text-ink-soft hover:text-ink" aria-label="Close">×</button>
        <div className="eyebrow">{mode === "talk" ? "// LIVE · VOICE" : "// INSTANT DEMO"}</div>
        <h2 id="live-title" className="font-display text-[26px] sm:text-[30px] font-semibold tracking-tight mt-1.5 pr-8">{title}</h2>

        {/* ---------- Pick a demo ---------- */}
        {step === "pick" && (
          <>
            <p className="text-ink-soft text-[14.5px] mt-2">Pick a call. You play the customer, Rana plays the business — live, in about 90 seconds.</p>
            <div className="grid sm:grid-cols-2 gap-2.5 mt-5" data-testid="demo-picker">
              {SCENARIOS.map((x) => (
                <button key={x.key} type="button" onClick={() => { setScenario(x.key); setStep("ready"); }} data-testid={`scenario-${x.key}`}
                  className="text-left rounded-xl border border-white/10 hover:border-signal/50 bg-white/[.02] hover:bg-signal/5 p-4 transition-colors">
                  <div className="text-[15px] font-semibold"><span className="mr-2" aria-hidden>{x.icon}</span>{x.title}</div>
                  <div className="text-[13px] text-ink-soft mt-1 leading-snug">{x.line}</div>
                </button>
              ))}
            </div>
          </>
        )}

        {/* ---------- Brief + language + start ---------- */}
        {(step === "ready" || step === "error") && (
          <>
            {mode === "talk" ? (
              <p className="text-ink-soft text-[14.5px] mt-2 leading-relaxed">Rana is RANA AI&apos;s own AI employee. Tell her about your business — she&apos;ll ask a few questions, show how an AI employee would handle <i>your</i> calls, and hand you a lead card at the end, exactly like your team would get.</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2.5 mt-4 text-[13.5px]" data-testid="demo-brief">
                <div className="rounded-xl border border-white/10 bg-white/[.02] p-4"><div className="font-mono text-[10.5px] text-signal">RANA PLAYS</div><div className="font-semibold mt-1">{s.business}</div><div className="text-ink-soft mt-1">{s.ranaPlays}</div></div>
                <div className="rounded-xl border border-white/10 bg-white/[.02] p-4"><div className="font-mono text-[10.5px] text-violet">YOU PLAY</div><div className="text-ink-soft mt-1">{s.youPlay}</div>
                  <div className="font-mono text-[10.5px] text-ink-soft mt-3">TRY SAYING</div><ul className="mt-1 flex flex-col gap-0.5">{s.tryThis.map((t) => <li key={t}>“{t}”</li>)}</ul></div>
              </div>
            )}
            {langs.length > 1 && (
              <div className="mt-5">
                <div className="text-[12px] font-semibold text-ink-soft mb-2">Talk in</div>
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
            <p className="text-[11.5px] text-ink-soft/80 mt-4">Uses your microphone. {mode === "talk" ? "Up to 3 minutes" : "About 90 seconds"}. The conversation is recorded so our team can follow up — see our <Link href="/legal/privacy" className="underline">privacy policy</Link>.</p>
          </>
        )}

        {/* ---------- Connecting / live / sample ---------- */}
        {(step === "connecting" || step === "live" || step === "sample" || step === "summing") && (
          <div className="mt-5">
            <div className="flex items-center justify-between gap-3 font-mono text-[11.5px] text-ink-soft">
              <span className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${step === "live" ? "bg-signal live-dot" : "bg-ink-soft/50"}`} />
                {step === "connecting" ? "CONNECTING…" : step === "sample" ? "SAMPLE CALL · NO MIC NEEDED" : step === "summing" ? "WRAPPING UP THE CALL…" : muted ? "LIVE · YOU'RE MUTED" : "LIVE · SPEAK NATURALLY"}</span>
              {step === "live" && <span data-testid="live-timer">{mm} left</span>}
            </div>
            <div className="wave flex items-end gap-[3px] h-10 my-4" aria-hidden style={{ opacity: step === "live" || step === "sample" ? 1 : 0.3 }}>
              {Array.from({ length: 48 }, (_, i) => <i key={i} style={{ animationDelay: `${(i % 12) * 0.08}s` }} />)}
            </div>
            <div ref={boxRef} className="rounded-xl border border-white/10 bg-black/20 p-4 h-[260px] overflow-y-auto flex flex-col gap-3" data-testid="live-transcript" aria-live="polite">
              {!lines.length && <div className="text-ink-soft text-[13.5px] m-auto text-center">{step === "connecting" ? "Allow the microphone if your browser asks. Rana will say hello first." : "Listening…"}</div>}
              {lines.map((l, i) => (
                <div key={i} className={`max-w-[85%] ${l.role === "agent" ? "self-start" : "self-end text-right"}`}>
                  <div className={`font-mono text-[10px] mb-0.5 ${l.role === "agent" ? "text-signal" : "text-ink-soft"}`}>{l.role === "agent" ? (mode === "demo" ? `RANA · ${s.business.split(" — ")[0].toUpperCase()}` : "RANA") : "YOU"}</div>
                  <div className={`inline-block rounded-2xl px-3.5 py-2 text-[14px] leading-snug ${l.role === "agent" ? "bg-white/[.06]" : "bg-signal/15"}`}>{l.text}</div>
                </div>
              ))}
            </div>
            {err && step === "live" && <div className="text-[12.5px] text-hot mt-2">{err}</div>}
            <div className="flex flex-wrap gap-3 mt-4">
              {step === "live" && <button type="button" onClick={() => { const c = call.current; if (!c) return; if (muted) c.unmute(); else c.mute(); setMuted(!muted); }} className="btn-ghost rounded-full px-5 py-2.5 text-[13.5px] font-medium" data-testid="live-mute">{muted ? "Unmute" : "Mute"}</button>}
              {(step === "live" || step === "connecting") && <button type="button" onClick={() => { const c = call.current; if (c) c.stop(); else { setStep("ready"); } }} className="rounded-full px-5 py-2.5 text-[13.5px] font-semibold bg-miss/80 hover:bg-miss text-white" data-testid="live-end">End call</button>}
              {step === "sample" && <button type="button" onClick={() => { sampleAlive.current = false; setStep("ready"); }} className="btn-ghost rounded-full px-5 py-2.5 text-[13.5px]">Stop</button>}
            </div>
          </div>
        )}

        {/* ---------- After the call: what your team would get ---------- */}
        {step === "done" && (
          <div className="mt-4" data-testid="live-done">
            {mode === "talk" ? <TalkCard r={result} /> : <DemoCard r={result} scenarioTitle={s.title} />}
            <div className="mt-6 rounded-2xl border border-signal/30 bg-signal/[.06] p-5">
              <div className="font-display text-[20px] font-semibold">Want Rana to do this for your business?</div>
              <p className="text-ink-soft text-[13.5px] mt-1">A 20-minute call: we set her up with your scripts, prices and languages — and she starts taking your calls.</p>
              <div className="flex flex-wrap gap-3 mt-4">
                <button type="button" onClick={book} className="btn-glow rounded-full px-6 py-3 text-[14px] font-semibold" data-testid="live-book">Book a demo</button>
                <Link href="/signup" className="btn-ghost rounded-full px-5 py-3 text-[14px] font-medium">Start free — 14 days</Link>
                {mode === "demo" && <button type="button" onClick={() => setStep("pick")} className="text-[13.5px] text-ink-soft hover:text-ink px-2" data-testid="live-another">Try another demo →</button>}
                {mode === "talk" && <button type="button" onClick={() => { setStep("ready"); setLines([]); linesRef.current = []; }} className="text-[13.5px] text-ink-soft hover:text-ink px-2">Talk again</button>}
              </div>
            </div>
          </div>
        )}
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
    <div className="rounded-2xl border border-white/10 bg-white/[.02] p-5" data-testid="lead-card">
      <div className="flex items-center justify-between gap-3">
        <div className="font-mono text-[10.5px] text-signal">THE LEAD CARD YOUR TEAM WOULD GET</div>
        {r.interest && <span className={`text-[11px] font-mono font-semibold uppercase rounded-full border px-2.5 py-0.5 ${tone}`}>{r.interest} lead</span>}
      </div>
      {r.summary && <p className="text-[14.5px] mt-3 leading-relaxed">{r.summary}</p>}
      <div className="mt-3">
        <Field k="Name" v={r.name} /><Field k="Company" v={r.company} /><Field k="Business" v={r.business} /><Field k="City" v={r.city} />
        <Field k="Calls" v={r.calls} /><Field k="Languages" v={r.languages} /><Field k="Main problem" v={r.pain} /><Field k="Next step" v={r.next_step} />
      </div>
      <div className="text-[11.5px] text-ink-soft mt-3">Every call RANA takes ends like this: a summary, the details and a hot / warm / cold score — sent to your dashboard, WhatsApp, Slack or email.</div>
    </div>
  );
}

function DemoCard({ r, scenarioTitle }: { r: any; scenarioTitle: string }) {
  if (!r) return <p className="text-ink-soft text-[14px]">That was quick! Try it again and play along a little longer — or book a demo and we&apos;ll run it on your own business.</p>;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[.02] p-5" data-testid="demo-outcome">
      <div className="font-mono text-[10.5px] text-signal">{r.sample ? "SAMPLE CALL · " : ""}WHAT YOUR TEAM SEES AFTER THIS {scenarioTitle.toUpperCase()} CALL</div>
      {r.outcome && <div className="mt-3 inline-block text-[12px] font-mono text-hot border border-hot/60 bg-hot/10 rounded px-2.5 py-1">{r.outcome}</div>}
      {r.summary && <p className="text-[14.5px] mt-3 leading-relaxed">{r.summary}</p>}
      {Array.isArray(r.fields) && r.fields.length > 0 && <div className="mt-3">{r.fields.slice(0, 5).map((f: any) => <Field key={f.label} k={f.label} v={f.value} />)}</div>}
      <div className="text-[11.5px] text-ink-soft mt-3">Recorded, transcribed and scored automatically — the next step lands with the right person on your team.</div>
    </div>
  );
}
