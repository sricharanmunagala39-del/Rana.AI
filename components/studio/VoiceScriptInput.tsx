// @ts-nocheck
"use client";
// Script by voice: record yourself explaining the call (or upload a recording of your best counsellor's call),
// and RANA writes it down so the AI can build the call plan from it.

import { useEffect, useRef, useState } from "react";
import { wavChunks, MAX_TOTAL_S } from "@/lib/speechChunks";
import { Spinner } from "./Editors";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default function VoiceScriptInput({ mode, language, onText }: { mode: "record" | "upload"; language: string; onText: (t: string) => void }) {
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [err, setErr] = useState("");
  const [level, setLevel] = useState(0);
  const rec = useRef<any>(null);
  const timer = useRef<any>(null);
  const stream = useRef<MediaStream | null>(null);
  const raf = useRef<any>(null);

  useEffect(() => () => { clearInterval(timer.current); cancelAnimationFrame(raf.current); stream.current?.getTracks().forEach((t) => t.stop()); }, []);

  async function transcribe(blob: Blob) {
    setErr("");
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      let decoded;
      try { decoded = await ctx.decodeAudioData(await blob.arrayBuffer()); }
      catch { throw new Error("Couldn't read that audio. Use MP3, WAV, M4A, OGG or WebM."); }
      finally { ctx.close?.(); }
      if (decoded.duration < 2) throw new Error("That recording is too short.");
      const chunks = wavChunks(decoded);
      setBusy({ done: 0, total: chunks.length });
      const parts: string[] = new Array(chunks.length).fill("");
      let done = 0;
      // Three at a time: fast, without flooding the speech service.
      const queue = chunks.map((c, i) => [c, i] as const);
      async function worker() {
        while (queue.length) {
          const [c, i] = queue.shift()!;
          const res = await fetch(`/api/studio/transcribe?lang=${encodeURIComponent(language || "auto")}`, { method: "POST", headers: { "Content-Type": "audio/wav" }, body: c });
          const d = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(d.error || "Couldn't turn the audio into text.");
          parts[i] = d.text || "";
          done++; setBusy({ done, total: chunks.length });
        }
      }
      await Promise.all([worker(), worker(), worker()]);
      const text = parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
      if (!text) throw new Error("No speech was found in that audio.");
      onText(text + (decoded.duration > MAX_TOTAL_S ? "\n(Only the first 15 minutes were used.)" : ""));
    } catch (e: any) { setErr(e.message || "Something went wrong."); }
    finally { setBusy(null); }
  }

  async function start() {
    setErr("");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      stream.current = s;
      const r = new MediaRecorder(s);
      const data: BlobPart[] = [];
      r.ondataavailable = (e) => e.data.size && data.push(e.data);
      r.onstop = () => { s.getTracks().forEach((t) => t.stop()); transcribe(new Blob(data, { type: r.mimeType || "audio/webm" })); };
      r.start(1000); rec.current = r;
      setRecording(true); setSecs(0);
      const t0 = Date.now();
      timer.current = setInterval(() => { const x = (Date.now() - t0) / 1000; setSecs(x); if (x >= MAX_TOTAL_S) stop(); }, 250);
      // Simple mic level meter so people can see it's hearing them.
      const ac = new AudioContext(); const an = ac.createAnalyser(); an.fftSize = 512;
      ac.createMediaStreamSource(s).connect(an);
      const buf = new Uint8Array(an.fftSize);
      const tick = () => { an.getByteTimeDomainData(buf); let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v - 128)); setLevel(m / 128); raf.current = requestAnimationFrame(tick); };
      tick();
    } catch { setErr("Couldn't use the microphone. Allow microphone access in your browser and try again."); }
  }
  function stop() {
    clearInterval(timer.current); cancelAnimationFrame(raf.current);
    setRecording(false);
    if (rec.current?.state === "recording") rec.current.stop();
  }

  return (
    <div className="border border-dashed border-line rounded-lg p-4 flex flex-col gap-3 bg-paper/50" data-testid={`voice-${mode}`}>
      {mode === "record" ? (
        <>
          <div className="text-[12.5px] text-ink-soft">Speak your call script the way you'd explain it to a new counsellor: how you greet, what you ask, what you offer, fees, and what you say when people object. Any language — Telugu, Hindi, English or mixed. Up to 15 minutes.</div>
          <div className="flex items-center gap-3">
            {!recording
              ? <button type="button" onClick={start} disabled={!!busy} data-testid="rec-start" className="bg-miss text-white rounded-full px-4 py-2 text-[13px] font-semibold disabled:opacity-40 flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-white" /> Start recording</button>
              : <button type="button" onClick={stop} data-testid="rec-stop" className="bg-ink text-paper rounded-full px-4 py-2 text-[13px] font-semibold flex items-center gap-2"><span className="w-2.5 h-2.5 bg-paper" /> Stop & write it down</button>}
            {recording && (
              <div className="flex items-center gap-2 text-[13px] font-mono">
                <span className="w-2 h-2 rounded-full bg-miss animate-pulse" />{fmt(secs)}
                <div className="w-24 h-1.5 bg-line rounded-full overflow-hidden"><div className="h-full bg-signal transition-all" style={{ width: `${Math.min(100, level * 140)}%` }} /></div>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="text-[12.5px] text-ink-soft">Upload a voice note or a recording of a good sales call (MP3, WAV, M4A, OGG, WebM — up to 15 minutes). RANA writes down what's said so the AI can turn it into your script.</div>
          <label className={`self-start bg-ink text-paper rounded-lg px-4 py-2 text-[13px] font-semibold cursor-pointer ${busy ? "opacity-40 pointer-events-none" : ""}`}>
            Choose audio file
            <input type="file" accept="audio/*,.m4a,.mp3,.wav,.ogg,.opus,.webm,.aac,video/mp4" className="hidden" data-testid="audio-file"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; if (f.size > 60 * 1024 * 1024) { setErr("That file is over 60 MB."); return; } transcribe(f); }} />
          </label>
        </>
      )}
      {busy && <div className="text-[12.5px] text-ink-soft flex items-center gap-2" data-testid="stt-progress"><Spinner /> Writing it down… {busy.total > 1 ? `part ${Math.min(busy.done + 1, busy.total)} of ${busy.total}` : ""}</div>}
      {err && <div className="text-[12.5px] text-miss">{err}</div>}
    </div>
  );
}
