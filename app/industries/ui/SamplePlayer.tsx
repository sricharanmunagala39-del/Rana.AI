"use client";
import { useEffect, useRef, useState } from "react";
import { fill, type UseCase } from "../types";

/** "Watch sample": a real-style call typed out line by line, ending in the CRM tag the business would see. */
export default function SamplePlayer({ uc, biz, them, onTryLive }: { uc: UseCase; biz: string; them: string; onTryLive: () => void }) {
  const [shown, setShown] = useState<{ who: "ai" | "them"; text: string }[]>([]);
  const [typing, setTyping] = useState("");
  const [done, setDone] = useState(false);
  const [round, setRound] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const lines = uc.sample.map(([who, text]) => ({ who, text: fill(text, biz) }));
  useEffect(() => {
    let alive = true;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    setShown([]); setTyping(""); setDone(false);
    (async () => {
      await sleep(250);
      for (const l of lines) {
        if (!alive) return;
        if (!reduce) for (let i = 1; i <= l.text.length && alive; i += 2) { setTyping(l.text.slice(0, i)); await sleep(18); }
        if (!alive) return;
        setTyping(""); setShown((x) => [...x, l]); await sleep(reduce ? 60 : 650);
      }
      if (alive) setDone(true);
    })();
    return () => { alive = false; };
  }, [uc.key, biz, round]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" }); }, [shown, typing, done]);
  const next = lines[shown.length];
  const label = (w: "ai" | "them") => (w === "ai" ? `RANA · ${biz.toUpperCase()}` : them.toUpperCase());
  return (
    <div className="flex flex-col h-full" data-testid="sample-player">
      <div className="flex items-center justify-between text-[11px] font-mono text-ink-soft mb-3">
        <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-signal live-dot" />SAMPLE CALL · {uc.dir === "out" ? "OUTBOUND" : "INBOUND"}</span>
        <button type="button" onClick={() => setRound((r) => r + 1)} className="hover:text-ink">↻ Replay</button>
      </div>
      <div ref={box} className="flex flex-col gap-3 min-h-[260px] max-h-[380px] overflow-y-auto pr-1">
        {shown.map((l, i) => (
          <div key={i} className={`max-w-[88%] ${l.who === "ai" ? "self-start" : "self-end text-right"}`}>
            <div className={`text-[10.5px] font-mono mb-1 ${l.who === "ai" ? "text-signal" : "text-ink-soft"}`}>{label(l.who)}</div>
            <div className={`rounded-2xl px-3.5 py-2.5 text-[14px] leading-snug ${l.who === "ai" ? "bg-signal/10 border border-signal/20" : "bg-white/[.05] border border-white/10"}`}>{l.text}</div>
          </div>
        ))}
        {typing && next && (
          <div className={`max-w-[88%] ${next.who === "ai" ? "self-start" : "self-end text-right"}`}>
            <div className={`text-[10.5px] font-mono mb-1 ${next.who === "ai" ? "text-signal" : "text-ink-soft"}`}>{label(next.who)}</div>
            <div className={`rounded-2xl px-3.5 py-2.5 text-[14px] leading-snug caret ${next.who === "ai" ? "bg-signal/10 border border-signal/20" : "bg-white/[.05] border border-white/10"}`}>{typing}</div>
          </div>
        )}
      </div>
      <div className={`mt-4 rounded-xl border p-3.5 transition-opacity ${done ? "opacity-100 border-hot/50 bg-hot/10" : "opacity-40 border-white/10"}`} data-testid="sample-outcome">
        <div className="text-[10.5px] font-mono text-ink-soft">SAVED TO YOUR CRM AFTER THE CALL</div>
        <div className="font-mono text-[12.5px] text-hot mt-1">{done ? uc.outcome : "Listening…"}</div>
      </div>
      {done && <button type="button" onClick={onTryLive} className="btn-glow rounded-full px-5 py-2.5 text-[14px] font-semibold mt-4 self-start" data-testid="sample-try-live">Now try it live →</button>}
    </div>
  );
}
