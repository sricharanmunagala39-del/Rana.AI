// @ts-nocheck
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildClip, encodeWav, toMono, MAX_SECONDS, MIN_SECONDS, type Channel, type Quality } from "@/lib/audioPrep";

type Item = { id: string; name: string; file: Blob; seconds: number; channels: number; kind: "upload" | "recording" };
export type ClonedVoice = { id: string; name: string; tagline: string; description: string | null; language: string; gender: string | null; custom: true; customId: string };

const LANGS: [string, string][] = [
  ["te", "Telugu"], ["hi", "Hindi"], ["en", "English"], ["ta", "Tamil"], ["kn", "Kannada"], ["ml", "Malayalam"], ["mr", "Marathi"],
  ["bn", "Bengali"], ["gu", "Gujarati"], ["pa", "Punjabi"], ["ur", "Urdu"], ["ar", "Arabic"], ["es", "Spanish"], ["fr", "French"],
  ["de", "German"], ["pt", "Portuguese"],
];

// Something natural to read aloud for ~45 seconds when recording in the browser.
const READ_ALOUD: Record<string, string> = {
  en: "Hi, good morning! Thanks for taking my call. I'm calling about the course you asked about last week. The new batch starts on the fifteenth, classes are in the evening, and we also have weekend options. The fee can be paid in easy instalments. Would you like me to send the details on WhatsApp? And is this a good time, or should I call you back later today?",
  te: "నమస్కారం! నా కాల్ తీసుకున్నందుకు ధన్యవాదాలు. మీరు గత వారం అడిగిన కోర్సు గురించి మాట్లాడదామని కాల్ చేశాను. కొత్త బ్యాచ్ పదిహేనవ తేదీ నుంచి మొదలవుతుంది. క్లాసులు సాయంత్రం ఉంటాయి, వీకెండ్ బ్యాచ్ కూడా ఉంది. ఫీజు వాయిదాలలో కట్టవచ్చు. వివరాలు వాట్సాప్‌లో పంపమంటారా? ఇప్పుడు మాట్లాడటానికి వీలుందా, లేక సాయంత్రం మళ్లీ కాల్ చేయమంటారా?",
  hi: "नमस्ते! मेरा कॉल लेने के लिए धन्यवाद। आपने पिछले हफ्ते जिस कोर्स के बारे में पूछा था, उसी के बारे में बात करनी थी। नया बैच पंद्रह तारीख से शुरू हो रहा है। क्लासेस शाम को होती हैं, और वीकेंड बैच भी है। फीस आसान किश्तों में दी जा सकती है। क्या मैं पूरी जानकारी व्हाट्सऐप पर भेज दूँ? अभी बात करने का सही समय है, या मैं शाम को दोबारा कॉल करूँ?",
};

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
let ctx: AudioContext | null = null;
const audioCtx = () => (ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)());

async function decode(blob: Blob): Promise<AudioBuffer> {
  return await audioCtx().decodeAudioData(await blob.arrayBuffer());
}

export default function VoiceCloneModal({ defaultLanguage, onCreated, onAdded, onClose }: {
  defaultLanguage?: string | null;
  /** "Use this voice" pressed. */
  onCreated: (v: ClonedVoice) => void;
  /** The voice exists (fires as soon as cloning succeeds, even if the modal is then just closed). */
  onAdded?: (v: ClonedVoice) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [channel, setChannel] = useState<Channel>("mix");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [clip, setClip] = useState<{ url: string; blob: Blob; seconds: number; quality: Quality } | null>(null);
  const [name, setName] = useState("");
  const [language, setLanguage] = useState(() => { const b = String(defaultLanguage || "te").split(/[-_]/)[0]; return LANGS.some(([c]) => c === b) ? b : "te"; });
  const [gender, setGender] = useState("feminine");
  const [description, setDescription] = useState("");
  const [speaker, setSpeaker] = useState("");
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<ClonedVoice | null>(null);
  const [recording, setRecording] = useState<{ started: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [drag, setDrag] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const decoded = useRef<Map<string, AudioBuffer>>(new Map());

  const hasStereo = items.some((i) => i.channels > 1);
  const totalSeconds = items.reduce((a, i) => a + i.seconds, 0);

  async function addFiles(files: FileList | File[] | null) {
    if (!files) return;
    setErr("");
    const list = Array.from(files).slice(0, 20 - items.length);
    for (const f of list) {
      if (f.size > 200 * 1024 * 1024) { setErr(`${f.name} is larger than 200 MB.`); continue; }
      try {
        const buf = await decode(f);
        const id = Math.random().toString(36).slice(2);
        decoded.current.set(id, buf);
        setItems((prev) => [...prev, { id, name: f.name, file: f, seconds: buf.duration, channels: buf.numberOfChannels, kind: "upload" }]);
      } catch {
        setErr(`Couldn't read ${f.name}. Use MP3, WAV, M4A, OGG or WebM audio.`);
      }
    }
  }

  async function startRecording() {
    setErr("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mr = new MediaRecorder(stream);
      chunks.current = [];
      mr.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: mr.mimeType || "audio/webm" });
        try {
          const buf = await decode(blob);
          const id = Math.random().toString(36).slice(2);
          decoded.current.set(id, buf);
          setItems((prev) => [...prev, { id, name: `Recording ${prev.filter((p) => p.kind === "recording").length + 1}`, file: blob, seconds: buf.duration, channels: buf.numberOfChannels, kind: "recording" }]);
        } catch { setErr("The recording couldn't be read — try again."); }
      };
      recRef.current = mr;
      mr.start(250);
      setRecording({ started: Date.now() });
    } catch {
      setErr("Microphone access was blocked. Allow the microphone in your browser, or upload recordings instead.");
    }
  }
  function stopRecording() { recRef.current?.stop(); setRecording(null); }
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setElapsed((Date.now() - recording.started) / 1000), 250);
    return () => clearInterval(t);
  }, [recording]);
  useEffect(() => { if (recording && elapsed >= 90) stopRecording(); }, [elapsed, recording]);

  // Rebuild the combined clip whenever the recordings or the chosen call side change.
  useEffect(() => {
    if (!items.length) { setClip(null); return; }
    let cancelled = false;
    setBusy(true);
    const t = setTimeout(() => {
      try {
        const sources = items.map((i) => { const b = decoded.current.get(i.id)!; return { name: i.name, samples: toMono(b, channel), rate: b.sampleRate }; });
        const built = buildClip(sources, MAX_SECONDS);
        const blob = new Blob([encodeWav(built.samples, built.rate)], { type: "audio/wav" });
        if (cancelled) return;
        setClip((prev) => { if (prev) URL.revokeObjectURL(prev.url); return { url: URL.createObjectURL(blob), blob, seconds: built.samples.length / built.rate, quality: built.quality }; });
      } catch (e: any) { if (!cancelled) setErr("Couldn't process these recordings."); }
      finally { if (!cancelled) setBusy(false); }
    }, 150);
    return () => { cancelled = true; clearTimeout(t); };
  }, [items, channel]);

  useEffect(() => () => { recRef.current?.state === "recording" && recRef.current.stop(); }, []);

  const problems = useMemo(() => [
    !items.length && "Add at least one recording",
    clip && clip.quality.usedSeconds < MIN_SECONDS && `At least ${MIN_SECONDS} seconds of clear speech is needed`,
    !name.trim() && "Name the voice",
    !speaker.trim() && "Enter whose voice this is",
    !consent && "Confirm you have their permission",
  ].filter(Boolean) as string[], [items, clip, name, speaker, consent]);

  async function create() {
    if (problems.length || !clip) return;
    setSaving(true); setErr("");
    try {
      const fd = new FormData();
      fd.append("clip", clip.blob, "voice.wav");
      fd.append("name", name.trim());
      fd.append("language", language);
      fd.append("gender", gender);
      fd.append("description", description.trim());
      fd.append("sourceFiles", String(items.length));
      fd.append("clipSeconds", String(Math.round(clip.quality.usedSeconds * 10) / 10));
      fd.append("quality", JSON.stringify(clip.quality));
      fd.append("consentSpeakerName", speaker.trim());
      fd.append("consentConfirmed", consent ? "yes" : "");
      const res = await fetch("/api/voices/clone", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Cloning failed");
      setDone(data.voice);
      onAdded?.(data.voice);
    } catch (e: any) { setErr(e.message); } finally { setSaving(false); }
  }

  const gradeTone = clip?.quality.grade === "great" ? "bg-signal-tint text-signal" : clip?.quality.grade === "good" ? "bg-warm-tint text-warm" : "bg-miss-tint text-miss";
  const input = "border border-line rounded-lg px-3 py-2 text-[13px] bg-raised outline-none focus:border-signal";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-6" onClick={(e) => { e.stopPropagation(); if (!saving && !recording) onClose(); }}>
      <div className="bg-raised rounded-2xl shadow-xl w-full max-w-[680px] max-h-[88vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-line flex items-center justify-between shrink-0">
          <div>
            <div className="text-[15px] font-semibold">Clone a voice</div>
            <div className="text-[12px] text-ink-soft">Upload recordings of one person — we cut the pauses, join the clearest minute and create a voice only your team can use.</div>
          </div>
          <button onClick={onClose} className="text-ink-soft hover:text-ink text-lg leading-none" aria-label="Close">×</button>
        </div>

        {done ? (
          <div className="p-8 flex flex-col items-center text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-signal-tint text-signal flex items-center justify-center text-[22px]">✓</div>
            <div className="text-[16px] font-semibold">{done.name} is ready</div>
            <div className="text-[13px] text-ink-soft max-w-[420px]">It&apos;s now in your voice list under &ldquo;My voices&rdquo;. Press play there to hear it say the sample line, then pick it for any employee.</div>
            <div className="flex gap-2 mt-2">
              <button onClick={() => onCreated(done)} className="bg-signal text-on-accent rounded-lg px-4 py-2 text-[13px] font-semibold">Use this voice</button>
              <button onClick={onClose} className="border border-line rounded-lg px-4 py-2 text-[13px] font-semibold">Close</button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
            {/* 1. Recordings */}
            <section className="flex flex-col gap-2.5">
              <div className="text-[13.5px] font-semibold">1 · Recordings of one person</div>
              <div
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
                className={`border-2 border-dashed rounded-xl p-4 flex flex-col sm:flex-row items-center gap-3 justify-between ${drag ? "border-signal bg-signal-tint" : "border-line bg-paper"}`}>
                <div className="text-[12.5px] text-ink-soft">Drop audio files here — one or many (up to 20). Calls, voice notes or studio recordings all work.</div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => fileInput.current?.click()} className="border border-line bg-raised rounded-lg px-3 py-1.5 text-[12.5px] font-semibold">Upload files</button>
                  {recording
                    ? <button onClick={stopRecording} className="bg-miss text-white rounded-lg px-3 py-1.5 text-[12.5px] font-semibold">■ Stop {fmt(elapsed)}</button>
                    : <button onClick={startRecording} className="bg-ink text-paper rounded-lg px-3 py-1.5 text-[12.5px] font-semibold">● Record now</button>}
                </div>
                <input ref={fileInput} type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm,.flac,.aac" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
              </div>
              {recording && (
                <div className="rounded-xl border border-line p-3 bg-raised">
                  <div className="text-[11.5px] text-ink-soft mb-1">Read this naturally, like a real call (about 45 seconds). Stops by itself at 1:30.</div>
                  <div className="text-[13.5px] leading-relaxed">{READ_ALOUD[language] ?? READ_ALOUD.en}</div>
                </div>
              )}
              {items.length > 0 && (
                <div className="border border-line rounded-xl overflow-hidden">
                  {items.map((i) => (
                    <div key={i.id} className="flex items-center gap-3 px-3 py-2 border-b border-line last:border-0 text-[12.5px]">
                      <span className="text-ink-soft">{i.kind === "recording" ? "🎙" : "♪"}</span>
                      <span className="flex-1 min-w-0 truncate">{i.name}</span>
                      <span className="text-ink-soft tabular-nums">{fmt(i.seconds)}{i.channels > 1 ? " · stereo" : ""}</span>
                      <button onClick={() => { decoded.current.delete(i.id); setItems((p) => p.filter((x) => x.id !== i.id)); }} className="text-ink-soft hover:text-miss font-semibold">Remove</button>
                    </div>
                  ))}
                  <div className="px-3 py-1.5 text-[11.5px] text-ink-soft bg-paper">{items.length} recording{items.length === 1 ? "" : "s"} · {fmt(totalSeconds)} total</div>
                </div>
              )}
              {hasStereo && (
                <label className="flex flex-wrap items-center gap-2 text-[12.5px]">
                  <span>Call recordings with two sides — which side is this person?</span>
                  <select value={channel} onChange={(e) => setChannel(e.target.value as Channel)} className={`${input} py-1`}>
                    <option value="mix">Both sides (only one person talks)</option>
                    <option value="left">Left channel</option>
                    <option value="right">Right channel</option>
                  </select>
                  <span className="text-[11.5px] text-ink-soft w-full">If the other person can be heard in the result below, switch sides. The clone must hear only one voice.</span>
                </label>
              )}
            </section>

            {/* 2. Result */}
            {items.length > 0 && (
              <section className="flex flex-col gap-2">
                <div className="text-[13.5px] font-semibold">2 · The clip we&apos;ll use</div>
                {busy && !clip && <div className="text-[12.5px] text-ink-soft">Cutting pauses and joining the clearest speech…</div>}
                {clip && (
                  <div className="rounded-xl border border-line p-3 flex flex-col gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[11.5px] font-semibold px-2 py-0.5 rounded-full ${gradeTone}`}>{clip.quality.grade === "great" ? "Great quality" : clip.quality.grade === "good" ? "Good" : "Needs better audio"}</span>
                      <span className="text-[12px] text-ink-soft">{clip.quality.usedSeconds.toFixed(0)}s of speech from {clip.quality.filesUsed} of {clip.quality.files} recording{clip.quality.files === 1 ? "" : "s"}{clip.quality.speechSeconds > clip.quality.usedSeconds + 1 ? ` (best ${MAX_SECONDS}s of ${clip.quality.speechSeconds.toFixed(0)}s found)` : ""}</span>
                      {busy && <span className="text-[11.5px] text-ink-soft">updating…</span>}
                    </div>
                    <audio controls src={clip.url} className="w-full h-9" />
                    {clip.quality.notes.length > 0 && <ul className="text-[12px] text-ink-soft list-disc pl-5">{clip.quality.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
                  </div>
                )}
              </section>
            )}

            {/* 3. Details + consent */}
            <section className="flex flex-col gap-2.5">
              <div className="text-[13.5px] font-semibold">3 · Name it and confirm permission</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Voice name, e.g. Ananya" className={input} />
                <select value={language} onChange={(e) => setLanguage(e.target.value)} className={input} aria-label="Language in the recordings">
                  {LANGS.map(([c, l]) => <option key={c} value={c}>{l}</option>)}
                </select>
                <select value={gender} onChange={(e) => setGender(e.target.value)} className={input} aria-label="Voice type">
                  <option value="feminine">Feminine</option><option value="masculine">Masculine</option><option value="gender_neutral">Neutral</option>
                </select>
              </div>
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Notes (optional), e.g. Warm counsellor voice, Hyderabad accent" className={input} />
              <div className="rounded-xl bg-paper border border-line p-3 flex flex-col gap-2">
                <input value={speaker} onChange={(e) => setSpeaker(e.target.value)} placeholder="Full name of the person in the recordings" className={input} />
                <label className="flex items-start gap-2 text-[12.5px] leading-snug">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
                  <span>I have <b>{speaker.trim() || "this person"}</b>&apos;s written permission to clone their voice and use it for calls made by our AI employees. RANA records who confirmed this and when.</span>
                </label>
              </div>
            </section>
          </div>
        )}

        {!done && (
          <div className="px-5 py-3 border-t border-line flex items-center gap-3 shrink-0">
            <div className={`flex-1 text-[12px] text-ink-soft ${err ? "" : "truncate"}`} data-testid="clone-status">{err ? <span className="text-miss leading-snug block">{err}</span> : problems[0] || "Ready — this takes about 10 seconds."}</div>
            <button onClick={onClose} className="border border-line rounded-lg px-4 py-2 text-[13px] font-semibold">Cancel</button>
            <button onClick={create} disabled={saving || busy || problems.length > 0} className="bg-signal text-on-accent rounded-lg px-4 py-2 text-[13px] font-semibold disabled:opacity-40">{saving ? "Cloning…" : "Create voice"}</button>
          </div>
        )}
      </div>
    </div>
  );
}
