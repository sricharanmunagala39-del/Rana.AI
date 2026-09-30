"use client";
// RANA HQ · Reel studio: turns the website sample calls into scroll-stopping 9:16 / 1:1 / 16:9 videos —
// real R1 voices for both sides, the voice core pulsing with the audio, captions, and the CRM card filling live.
// "Record" captures just the frame (Chrome) with its sound and downloads a .webm for Instagram / LinkedIn / ads.
// Preparing voices also switches on the real-voice sample calls on the website (same saved audio).
import { useEffect, useRef, useState } from "react";
import Sidebar from "@/components/Sidebar";
import RanaCore, { type CoreMode } from "@/components/RanaCore";
import { SCENARIOS, SAMPLE_VOICES, sampleText, type DemoKey } from "@/app/landing/talkContent";
import type { VoiceLevels } from "@/lib/voice/meter";

const HOOK: Record<DemoKey, string> = {
  qualify: "A lead enquired 2 minutes ago. Watch this AI call and qualify them.",
  sales: "“Your fees are too high.” Watch this AI handle the objection.",
  support: "An upset customer calls at 11 PM. No one's on duty. Watch.",
  booking: "An AI receptionist books a patient — in under a minute.",
  followup: "A gym trial went cold. Watch the AI bring him back.",
};
const FORMATS = { reel: { w: 1080, h: 1920, label: "9:16 Reel / Story" }, square: { w: 1080, h: 1080, label: "1:1 Post" }, wide: { w: 1920, h: 1080, label: "16:9 LinkedIn / YouTube" } } as const;
type Fmt = keyof typeof FORMATS;
const url = (voice: string, text: string) => `/api/voices/preview?engine=sarvam&voice=${voice}&lang=en&text=${encodeURIComponent(sampleText(text))}`;

export default function ReelStudio() {
  const [hq, setHq] = useState<boolean | null>(null);
  const [key, setKey] = useState<DemoKey>("qualify");
  const [fmt, setFmt] = useState<Fmt>("reel");
  const [ready, setReady] = useState<Record<string, number>>({});
  const [prep, setPrep] = useState("");
  const [phase, setPhase] = useState<"idle" | "hook" | "call" | "end">("idle");
  const [line, setLine] = useState(-1);
  const [words, setWords] = useState("");
  const [mode, setMode] = useState<CoreMode>("idle");
  const [rec, setRec] = useState<"off" | "on" | "saving">("off");
  const [msg, setMsg] = useState("");
  const blobs = useRef<Record<string, Blob[]>>({});
  const an = useRef<AnalyserNode | null>(null);
  const actx = useRef<AudioContext | null>(null);
  const who = useRef<"ai" | "caller">("ai");
  const alive = useRef(false);
  const frame = useRef<HTMLDivElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const s = SCENARIOS.find((x) => x.key === key)!;
  const F = FORMATS[fmt];

  // While recording, the frame fills the window so the video is as sharp as the screen allows.
  const [vp, setVp] = useState({ w: 1440, h: 900 });
  useEffect(() => { const f = () => setVp({ w: window.innerWidth, h: window.innerHeight }); f(); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);
  useEffect(() => { fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)).then((c) => setHq(!!c?.hq)).catch(() => setHq(false)); }, []);

  async function prepare(k: DemoKey = key) {
    const sc = SCENARIOS.find((x) => x.key === k)!; const v = SAMPLE_VOICES[k];
    setPrep(`Preparing voices for ${sc.title}…`);
    const out: Blob[] = [];
    for (let i = 0; i < sc.sample.length; i++) {
      const l = sc.sample[i];
      const r = await fetch(url(l.who === "ai" ? v.ai : v.caller, l.text));
      if (!r.ok) { setPrep(`Couldn't make line ${i + 1}: ${(await r.json().catch(() => ({}))).error || r.status}`); return null; }
      out.push(await r.blob()); setReady((x) => ({ ...x, [k]: i + 1 }));
    }
    blobs.current[k] = out; setPrep(""); return out;
  }

  const levels = (): VoiceLevels => {
    const a = an.current; if (!a) return { agent: 0, user: 0 };
    const b = new Uint8Array(a.fftSize); a.getByteTimeDomainData(b);
    let sum = 0; for (let i = 0; i < b.length; i++) { const v = (b[i] - 128) / 128; sum += v * v; }
    const lv = Math.min(1, Math.sqrt(sum / b.length) * 4.5);
    return who.current === "ai" ? { agent: lv, user: 0 } : { agent: 0, user: lv };
  };

  async function play() {
    const list = blobs.current[key] || (await prepare(key));
    if (!list) return;
    alive.current = true;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    try { actx.current?.close(); } catch {}
    const ctx = new AudioContext(); actx.current = ctx;
    setLine(-1); setWords(""); setMode("idle"); setPhase("hook"); await sleep(2600);
    setPhase("call");
    for (let i = 0; i < s.sample.length; i++) {
      if (!alive.current) return;
      const l = s.sample[i]; who.current = l.who;
      setLine(i); setWords(""); setMode(l.who === "ai" ? "speaking" : "listening");
      const el = new Audio(URL.createObjectURL(list[i]));
      const src = ctx.createMediaElementSource(el); const a = ctx.createAnalyser(); a.fftSize = 512; src.connect(a); a.connect(ctx.destination); an.current = a;
      await el.play().catch(() => {});
      const d = (isFinite(el.duration) && el.duration > 0 ? el.duration : 3) * 1000;
      const ws = l.text.split(" ");
      for (let w = 0; w < ws.length && alive.current; w++) { setWords(ws.slice(0, w + 1).join(" ")); await sleep((d * 0.9) / ws.length); }
      await new Promise<void>((r) => { if (el.ended) return r(); el.onended = () => r(); setTimeout(r, 1500); });
      an.current = null; setMode("thinking"); await sleep(320);
    }
    setMode("idle"); setPhase("end"); await sleep(3200);
    if (recorder.current?.state === "recording") recorder.current.stop();
    alive.current = false;
  }
  function stop() { alive.current = false; setPhase("idle"); setMode("idle"); try { actx.current?.close(); } catch {} if (recorder.current?.state === "recording") recorder.current.stop(); }

  async function record() {
    setMsg("");
    if (!blobs.current[key] && !(await prepare(key))) return;
    try {
      const stream: MediaStream = await (navigator.mediaDevices as any).getDisplayMedia({ video: { frameRate: 30 }, audio: true, preferCurrentTab: true, selfBrowserSurface: "include" } as any);
      const [track] = stream.getVideoTracks();
      // Crop to just the frame where the browser supports it (Chrome's Region Capture).
      try { const CT = (window as any).CropTarget; if (CT && frame.current && (track as any).cropTo) await (track as any).cropTo(await CT.fromElement(frame.current)); } catch {}
      const mime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m)) || "";
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8_000_000 } : undefined); recorder.current = mr;
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop()); setRec("saving");
        const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(chunks, { type: "video/webm" })); a.download = `rana-${key}-${fmt}.webm`; a.click();
        setRec("off"); setMsg("Saved. Tip: when Chrome asks, choose “This tab” and turn on “Also share tab audio”.");
      };
      if (!stream.getAudioTracks().length) setMsg("No sound captured — next time turn on “Also share tab audio”.");
      mr.start(250); setRec("on");
      await new Promise((r) => setTimeout(r, 400));
      play();
    } catch (e: any) { setRec("off"); setMsg(e?.name === "NotAllowedError" ? "Recording was cancelled." : `Recording isn't supported here: ${e?.message || e}`); }
  }

  if (hq === false) return <div className="flex min-h-screen bg-paper"><Sidebar active="hq-reel" /><div className="flex-1 grid place-items-center text-ink-soft text-[13px]">Reel studio is for RANA HQ.</div></div>;

  const shown = s.card.filter((c) => c.at <= line);
  const score = Math.round(18 + (78 * shown.length) / Math.max(1, s.card.length));
  // Preview scale: fit the frame into ~620px tall / the column width.
  const big = rec === "on";
  const scale = big ? Math.min((vp.h - 16) / F.h, (vp.w - 16) / F.w) : Math.min(620 / F.h, (fmt === "wide" ? 760 : 520) / F.w);
  const vertical = fmt === "reel";

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar active="hq-reel" />
      <main className="flex-1 min-w-0 hud-stage" data-testid="reel-studio">
        <header className="relative flex flex-wrap items-center justify-between gap-3 px-5 sm:px-7 py-4 border-b border-white/[.06]">
          <div><div className="font-mono text-[12px] tracking-[0.2em] font-semibold">REEL STUDIO</div><div className="text-[12px] text-ink-soft">Real voices, live core, captions and the CRM card — recorded straight to video.</div></div>
        </header>
        <div className="relative grid grid-cols-[minmax(0,1fr)] xl:grid-cols-[340px_1fr] gap-6 p-5 sm:p-7">
          <div className="flex flex-col gap-4">
            <div className="hud-panel p-4">
              <div className="hud-label mb-2">Call</div>
              <div className="flex flex-col gap-1.5">
                {SCENARIOS.map((x) => (
                  <button key={x.key} onClick={() => { stop(); setKey(x.key); }} className={`text-left rounded-lg border px-3 py-2 text-[13px] ${key === x.key ? "border-signal/60 bg-signal/10" : "border-white/10 hover:border-white/25"}`} data-testid={`reel-${x.key}`}>
                    <span className="mr-2">{x.icon}</span>{x.title}<span className="float-right font-mono text-[10.5px] text-ink-soft">{ready[x.key] === x.sample.length || blobs.current[x.key] ? "VOICED" : ready[x.key] ? `${ready[x.key]}/${x.sample.length}` : ""}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="hud-panel p-4">
              <div className="hud-label mb-2">Format</div>
              <div className="flex flex-col gap-1.5">{(Object.keys(FORMATS) as Fmt[]).map((f) => <button key={f} onClick={() => setFmt(f)} className={`text-left rounded-lg border px-3 py-2 text-[13px] ${fmt === f ? "border-signal/60 bg-signal/10" : "border-white/10 hover:border-white/25"}`}>{FORMATS[f].label}</button>)}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => (phase === "idle" || phase === "end" ? play() : stop())} className="btn-glow rounded-full px-5 py-2.5 text-[13.5px] font-semibold" data-testid="reel-play">{phase === "idle" || phase === "end" ? "▶ Play" : "■ Stop"}</button>
              <button onClick={record} disabled={rec !== "off"} className="btn-ghost rounded-full px-5 py-2.5 text-[13.5px] font-semibold disabled:opacity-50" data-testid="reel-record">{rec === "on" ? "● Recording…" : "● Record video"}</button>
              <button onClick={async () => { for (const x of SCENARIOS) if (!blobs.current[x.key]) await prepare(x.key); setMsg("All five sample calls now play in real voices on the website too."); }} className="text-[12.5px] text-ink-soft hover:text-ink px-2">Voice all 5</button>
            </div>
            {(prep || msg) && <div className="text-[12.5px] text-ink-soft">{prep || msg}</div>}
            <div className="text-[11.5px] text-ink-soft/80 leading-relaxed">Voices are made once and saved (no repeat cost). Recording works best in Chrome: pick “This tab” and turn on tab audio. Upload the .webm to Instagram, or convert it to .mp4 in CapCut / any converter.</div>
          </div>

          {/* The frame */}
          <div className="flex justify-center">
            <div style={{ width: F.w * scale, height: F.h * scale }} className={big ? "fixed z-[200] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" : "relative"}>
              <div ref={frame} className="absolute top-0 left-0 origin-top-left hud-stage rounded-[28px] overflow-hidden border border-white/10" style={{ width: F.w, height: F.h, transform: `scale(${scale})` }} data-testid="reel-frame">
                <div className="hud-scan" aria-hidden style={{ height: 380 }} />
                <div className="absolute top-[4%] left-0 right-0 flex items-center justify-center gap-4 font-mono tracking-[0.3em] font-semibold" style={{ fontSize: 30 }}>
                  <span className="w-5 h-5 rounded-full bg-signal live-dot" />RANA AI
                </div>
                {phase === "hook" || phase === "idle" ? (
                  <div className="absolute inset-x-[7%] top-[13%] text-center font-display font-semibold leading-[1.08] hud-pop" style={{ fontSize: vertical ? 78 : fmt === "square" ? 60 : 64 }}>{HOOK[key]}</div>
                ) : phase === "end" ? (
                  <div className="absolute inset-x-[7%] top-[12%] text-center hud-pop">
                    <div className="font-display font-semibold leading-tight" style={{ fontSize: vertical ? 84 : 66 }}>Your AI employee.<br /><span className="text-gradient">Answers back.</span></div>
                  </div>
                ) : (
                  <div className="absolute inset-x-[6%] top-[11%] text-center">
                    <div className="font-mono tracking-[0.2em]" style={{ fontSize: 26, color: s.sample[line]?.who === "ai" ? "rgb(45 225 194)" : "rgb(146 132 255)" }}>{s.sample[line]?.who === "ai" ? `RANA · ${s.business.split(" — ")[0].toUpperCase()}` : "CUSTOMER"}</div>
                    <div className="font-semibold leading-snug mt-4" style={{ fontSize: vertical ? 56 : fmt === "square" ? 36 : 42 }}>{words}<span className="hud-caret" style={{ width: 14, height: 44, verticalAlign: -6 }} /></div>
                  </div>
                )}
                <div className="absolute" style={vertical ? { top: "31%", left: "50%", width: 620, marginLeft: -310 } : fmt === "square" ? { top: "36%", left: "3%", width: 470 } : { top: "30%", left: "8%", width: 560 }}>
                  <RanaCore size="100%" mode={mode} levels={levels} dense />
                </div>
                {(phase === "call" || phase === "end") && (
                  <div className="absolute hud-panel p-8" style={vertical ? { left: "7%", right: "7%", bottom: "6%" } : fmt === "square" ? { right: "4%", top: "38%", width: 520 } : { right: "5%", top: "32%", width: 640 }}>
                    <div className="flex justify-between font-mono tracking-[0.16em] text-ink-soft" style={{ fontSize: 22 }}><span>LIVE CRM CARD</span><span className="text-signal">{phase === "end" ? "SENT TO TEAM" : "UPDATING"}</span></div>
                    {(fmt === "square" ? shown.slice(-3) : shown).map((c) => <div key={c.label} className="flex justify-between border-b border-white/[.08] py-3 hud-pop" style={{ fontSize: 30 }}><span className="text-ink-soft">{c.label}</span><b className="hud-new">{c.value}</b></div>)}
                    <div className="flex items-center gap-5 mt-5">
                      <div className="hud-gauge" style={{ width: 110, height: 110, ["--p" as any]: phase === "end" ? 96 : score }}><span className="font-mono font-bold" style={{ fontSize: 34 }}>{phase === "end" ? 96 : score}</span></div>
                      <span className="font-mono font-bold tracking-[0.14em] rounded-lg px-4 py-2 bg-hot/15 text-hot" style={{ fontSize: 26 }}>{phase === "end" ? s.outcome.split(" · ")[0] : "QUALIFYING"}</span>
                    </div>
                  </div>
                )}
                {phase === "end" && (
                  <div className="absolute left-0 right-0 text-center hud-pop" style={{ bottom: vertical ? "2.5%" : "6%", fontSize: 30 }}>
                    <span className="font-mono tracking-[0.2em] text-signal">RANAAI.IN · TALK TO RANA FREE</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
