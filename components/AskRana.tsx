"use client";
import { useEffect, useRef, useState } from "react";

/**
 * "Ask Rana" — a command bar you can type into or talk to (browser speech recognition where available).
 * Answers come from `endpoint` ({ question } → { answer }) and can be read aloud. Reports its state so a
 * RanaCore can listen / think / speak along with it.
 */
export type AskState = "idle" | "listening" | "thinking" | "speaking";
export default function AskRana({ endpoint, suggestions, placeholder = "Ask Rana anything about your calls…", onState, compact = false }: {
  endpoint: string; suggestions: string[]; placeholder?: string; onState?: (s: AskState) => void; compact?: boolean;
}) {
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState("");
  const [asked, setAsked] = useState("");
  const [err, setErr] = useState("");
  const [state, setStateRaw] = useState<AskState>("idle");
  const [voice, setVoice] = useState(true);
  const [canListen, setCanListen] = useState(false);
  const rec = useRef<any>(null);
  const setState = (s: AskState) => { setStateRaw(s); onState?.(s); };

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setCanListen(!!SR);
    try { const v = localStorage.getItem("rana_ask_voice"); if (v === "0") setVoice(false); } catch {}
    return () => { try { rec.current?.abort(); } catch {} try { window.speechSynthesis?.cancel(); } catch {} };
  }, []);

  function speak(text: string) {
    const synth = window.speechSynthesis;
    if (!voice || !synth) { setState("idle"); return; }
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/[*_#>•]/g, "").replace(/\n+/g, ". ").slice(0, 900));
      const vs = synth.getVoices();
      const pick = vs.find((v) => /en-IN/i.test(v.lang) && /female|heera|veena|neerja|google/i.test(v.name)) || vs.find((v) => /en-IN/i.test(v.lang)) || vs.find((v) => /^en/i.test(v.lang));
      if (pick) u.voice = pick;
      u.rate = 1.03; u.pitch = 1.05;
      u.onend = () => setState("idle"); u.onerror = () => setState("idle");
      setState("speaking");
      synth.speak(u);
    } catch { setState("idle"); }
  }

  async function ask(question: string) {
    const text = question.trim();
    if (text.length < 3 || state === "thinking") return;
    try { window.speechSynthesis?.cancel(); } catch {}
    setErr(""); setAsked(text); setAnswer(""); setQ(""); setState("thinking");
    try {
      const r = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: text }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Couldn't answer just now.");
      // Type the answer out, then read it aloud.
      const words = String(d.answer || "").split(/(\s+)/);
      let out = "";
      for (let i = 0; i < words.length; i++) { out += words[i]; if (i % 3 === 0) { setAnswer(out); await new Promise((res) => setTimeout(res, 16)); } }
      setAnswer(out);
      speak(out);
    } catch (e: any) { setErr(e.message); setState("idle"); }
  }

  function listen() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    if (state === "listening") { try { rec.current?.stop(); } catch {} return; }
    try { window.speechSynthesis?.cancel(); } catch {}
    const r = new SR(); rec.current = r;
    r.lang = "en-IN"; r.interimResults = true; r.maxAlternatives = 1;
    let final = "";
    r.onresult = (e: any) => { let t = ""; for (let i = 0; i < e.results.length; i++) { t += e.results[i][0].transcript; if (e.results[i].isFinal) final = t; } setQ(t); };
    r.onerror = () => setState("idle");
    r.onend = () => { if (final.trim()) ask(final); else setState("idle"); };
    setState("listening");
    try { r.start(); } catch { setState("idle"); }
  }

  const toggleVoice = () => { const v = !voice; setVoice(v); if (!v) { try { window.speechSynthesis?.cancel(); } catch {} if (state === "speaking") setState("idle"); } try { localStorage.setItem("rana_ask_voice", v ? "1" : "0"); } catch {} };

  return (
    <div className="hud-panel p-3.5" data-testid="ask-rana">
      <form onSubmit={(e) => { e.preventDefault(); ask(q); }} className="flex items-center gap-2">
        <span className="hud-label !text-signal shrink-0 hidden sm:inline">ASK RANA ›</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={state === "listening" ? "Listening…" : placeholder} aria-label="Ask Rana"
          className="flex-1 min-w-0 bg-transparent outline-none text-[14px] placeholder:text-white/30 text-ink py-1.5" data-testid="ask-input" />
        {canListen && (
          <button type="button" onClick={listen} className={`w-9 h-9 rounded-full grid place-items-center border ${state === "listening" ? "border-violet/60 text-violet bg-violet/10 live-dot" : "border-white/15 text-ink-soft hover:text-ink"}`} aria-label="Speak your question" title="Speak your question">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
          </button>
        )}
        <button type="button" onClick={toggleVoice} className={`w-9 h-9 rounded-full grid place-items-center border ${voice ? "border-signal/40 text-signal" : "border-white/15 text-ink-soft"}`} aria-label={voice ? "Voice replies on" : "Voice replies off"} title={voice ? "Rana reads answers aloud" : "Answers are silent"}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 5 6 9H2v6h4l5 4V5z" />{voice ? <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" /> : <path d="m23 9-6 6M17 9l6 6" />}</svg>
        </button>
        <button type="submit" disabled={q.trim().length < 3 || state === "thinking"} className="rounded-full bg-signal text-on-accent px-4 h-9 text-[13px] font-semibold disabled:opacity-40" data-testid="ask-go">Ask</button>
      </form>
      {!asked && !compact && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {suggestions.map((s) => <button key={s} type="button" onClick={() => ask(s)} className="rounded-full border border-white/10 hover:border-signal/40 hover:text-ink text-ink-soft text-[12px] px-3 py-1">{s}</button>)}
        </div>
      )}
      {(asked || err) && (
        <div className="mt-3 border-t border-white/[.07] pt-3 text-[13.5px] leading-relaxed" aria-live="polite" data-testid="ask-answer">
          {asked && <div className="text-ink-soft text-[12.5px] mb-1.5">› {asked}</div>}
          {state === "thinking" && <div className="font-mono text-[12px] text-signal">▸ Checking your calls<span className="hud-caret" /></div>}
          {answer && <div className="whitespace-pre-line">{answer}</div>}
          {err && <div className="text-hot">{err}</div>}
        </div>
      )}
    </div>
  );
}
