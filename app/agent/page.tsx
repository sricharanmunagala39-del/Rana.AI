"use client";

import { useEffect, useRef, useState } from "react";
import Sidebar from "@/components/Sidebar";
import {
  AgentSettings,
  BackgroundSound,
  DEFAULT_AGENT_SETTINGS,
  LANGUAGES,
  getAgentSettings,
  saveAgentSettings,
} from "@/lib/storage";

const SUGGESTION_CHIPS = [
  "Always confirm the caller's name before continuing",
  "Speak in Telugu if the caller prefers it",
  "Never mention pricing over the phone — offer a callback instead",
  "Ask which exam and attempt number before anything else",
  "Keep the call under 3 minutes unless the caller wants to talk longer",
];
const BACKGROUND_OPTIONS: { id: BackgroundSound; label: string }[] = [
  { id: "none", label: "None" },
  { id: "office", label: "Quiet office" },
  { id: "callcenter", label: "Call centre" },
  { id: "traffic", label: "City traffic" },
];
const VOICES = [
  { id: "shubh",  label: "Shubh — confident & bold (M)" },
  { id: "anand",  label: "Anand — warm & reassuring (M)" },
  { id: "aditya", label: "Aditya — modern & crisp (M)" },
  { id: "ishita", label: "Ishita — polished & articulate (F)" },
  { id: "priya",  label: "Priya — cheerful & engaging (F)" },
  { id: "ritu",   label: "Ritu — expressive & lively (F)" },
];
type Tab     = "instructions" | "variables" | "tools" | "settings" | "tests";
type TestTab = "voice" | "phone" | "chat";
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "instructions", label: "Instructions", icon: "T"  },
  { id: "variables",    label: "Variables",    icon: "{}" },
  { id: "tools",        label: "Tools",        icon: "⚡" },
  { id: "settings",     label: "Settings",     icon: "⚙"  },
  { id: "tests",        label: "Tests",        icon: "✓"  },
];
type CallState = "idle" | "greeting" | "recording" | "sending" | "speaking" | "checking" | "ended";
type TranscriptLine = { speaker: "agent" | "caller"; text: string; lang: string };
const SILENCE_WARN_MS = 7500;
const SILENCE_STOP_MS = 1300;
const MAX_RECORD_MS   = 15000;
const SPEECH_RMS      = 0.02;

export default function AgentPage() {
  const [settings, setSettings] = useState<AgentSettings & { speaker: string }>({
    ...DEFAULT_AGENT_SETTINGS, speaker: "shubh",
  });
  const [tab,   setTab]   = useState<Tab>("instructions");
  const [saved, setSaved] = useState(false);
  const [editInput,   setEditInput]   = useState("");
  const [editLog,     setEditLog]     = useState<{ request: string; summary: string; time: string }[]>([]);
  const [editLoading, setEditLoading] = useState(false);
  const [editError,   setEditError]   = useState("");
  const [testTab, setTestTab] = useState<TestTab>("voice");
  const [micSupported, setMicSupported] = useState(true);
  const [backendError, setBackendError] = useState("");
  const [callState,    setCallState]    = useState<CallState>("idle");
  const [transcript,   setTranscript]   = useState<TranscriptLine[]>([]);
  const [currentLang,  setCurrentLang]  = useState("en-IN");
  const [phoneNumber,  setPhoneNumber]  = useState("");
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneStatus,  setPhoneStatus]  = useState<"idle" | "calling" | "error">("idle");
  const [phoneError,   setPhoneError]   = useState("");
  const [chatInput,   setChatInput]   = useState("");
  const [chatHistory, setChatHistory] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

  const settingsRef    = useRef(settings);  settingsRef.current = settings;
  const activeRef      = useRef(false);
  const historyRef     = useRef<{ role: string; content: string }[]>([]);
  const currentLangRef = useRef("en-IN");
  const streamRef      = useRef<MediaStream | null>(null);
  const recorderRef    = useRef<MediaRecorder | null>(null);
  const chunksRef      = useRef<Blob[]>([]);
  const vadCtxRef      = useRef<AudioContext | null>(null);
  const analyserRef    = useRef<AnalyserNode | null>(null);
  const vadIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioElRef     = useRef<HTMLAudioElement | null>(null);
  const ambienceCtxRef = useRef<AudioContext | null>(null);
  const ambienceNodesRef = useRef<{ src: AudioBufferSourceNode } | null>(null);

  useEffect(() => {
    setSettings((s) => ({ ...s, ...getAgentSettings() }));
    setMicSupported(typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia);
  }, []);

  function persist(next: AgentSettings & { speaker: string }) { setSettings(next); saveAgentSettings(next); }
  function handleSave() { saveAgentSettings(settings); setSaved(true); setTimeout(() => setSaved(false), 2200); }
  function addChip(text: string) {
    setSettings((s) => ({ ...s, instructions: s.instructions.trim() ? `${s.instructions.trim()}\n- ${text}` : `- ${text}` }));
  }
  function addFact()                          { setSettings((s) => ({ ...s, facts: [...s.facts, ""] })); }
  function updateFact(i: number, v: string)   { setSettings((s) => { const f = [...s.facts]; f[i] = v; return { ...s, facts: f }; }); }
  function removeFact(i: number)              { setSettings((s) => ({ ...s, facts: s.facts.filter((_, x) => x !== i) })); }
  function addPron()                          { setSettings((s) => ({ ...s, pronunciations: [...s.pronunciations, { word: "", sayAs: "" }] })); }
  function updatePron(i: number, field: "word" | "sayAs", v: string) {
    setSettings((s) => { const p = [...s.pronunciations]; p[i] = { ...p[i], [field]: v }; return { ...s, pronunciations: p }; });
  }
  function removePron(i: number) { setSettings((s) => ({ ...s, pronunciations: s.pronunciations.filter((_, x) => x !== i) })); }

  async function submitEdit() {
    if (!editInput.trim() || editLoading) return;
    const req = editInput.trim(); setEditInput(""); setEditLoading(true); setEditError("");
    try {
      const res = await fetch("/api/edit-agent", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ greeting: settings.greeting, instructions: settings.instructions, facts: settings.facts, request: req }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed.");
      persist({ ...settings, greeting: data.greeting, instructions: data.instructions, facts: data.facts });
      setEditLog((l) => [{ request: req, summary: data.summary, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }, ...l]);
      setTab("instructions");
    } catch (err: any) { setEditError(err?.message || "Something went wrong."); }
    finally { setEditLoading(false); }
  }

  async function triggerPhoneCall() {
    if (!phoneNumber.trim() || phoneLoading) return;
    setPhoneLoading(true); setPhoneError("");
    try {
      const res = await fetch("/api/outbound-call", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userPhone: phoneNumber.trim() }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ? JSON.stringify(data.detail) : data.error || "Call failed.");
      setPhoneStatus("calling");
    } catch (err: any) { setPhoneError(err?.message || "Something went wrong."); setPhoneStatus("error"); }
    finally { setPhoneLoading(false); }
  }

  async function sendChat() {
    if (!chatInput.trim() || chatLoading) return;
    const userText = chatInput.trim(); setChatInput("");
    setChatHistory((h) => [...h, { role: "user", text: userText }]);
    setChatLoading(true);
    try {
      const fd = new FormData();
      fd.append("mode", "turn");
      fd.append("instructions", settings.instructions + "\n\nFacts:\n" + settings.facts.map((f) => `- ${f}`).join("\n"));
      fd.append("history", JSON.stringify(chatHistory.map((m) => ({ role: m.role, content: m.text }))));
      const silence = new Blob([], { type: "audio/webm" });
      fd.append("audio", silence, "silence.webm");
      fd.append("text_override", userText);
      fd.append("language", settings.startingLanguage);
      fd.append("speaker", settings.speaker || "shubh");
      fd.append("pace", "1");
      fd.append("chat_only", "true");
      const res = await fetch("/api/test-call", { method: "POST", body: fd });
      const data = await res.json();
      setChatHistory((h) => [...h, { role: "assistant", text: data.replyText || "(no response)" }]);
    } catch { setChatHistory((h) => [...h, { role: "assistant", text: "(Error — check your API key)" }]); }
    finally { setChatLoading(false); }
  }

  function startAmbience(kind: BackgroundSound) {
    if (kind === "none") return;
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx(); ambienceCtxRef.current = ctx;
    const buf = ctx.createBuffer(1, 2 * ctx.sampleRate, ctx.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = "bandpass";
    f.frequency.value = kind === "traffic" ? 180 : kind === "callcenter" ? 900 : 500; f.Q.value = 0.6;
    const g = ctx.createGain(); g.gain.value = 0.03;
    src.connect(f).connect(g).connect(ctx.destination); src.start();
    ambienceNodesRef.current = { src };
  }
  function stopAmbience() {
    ambienceNodesRef.current?.src.stop(); ambienceNodesRef.current = null;
    ambienceCtxRef.current?.close(); ambienceCtxRef.current = null;
  }
  function playBase64Audio(b64: string): Promise<void> {
    return new Promise((res) => {
      const a = new Audio(`data:audio/wav;base64,${b64}`); audioElRef.current = a;
      a.onended = () => res(); a.onerror = () => res(); a.play().catch(() => res());
    });
  }
  async function callBackend(fd: FormData) {
    const r = await fetch("/api/test-call", { method: "POST", body: fd });
    const d = await r.json(); if (!r.ok) throw new Error(d.error || "Request failed"); return d;
  }
  async function ensureMic(): Promise<MediaStream> {
    if (streamRef.current) return streamRef.current;
    const s = await navigator.mediaDevices.getUserMedia({ audio: true }); streamRef.current = s; return s;
  }
  function stopVad() {
    if (vadIntervalRef.current) clearInterval(vadIntervalRef.current); vadIntervalRef.current = null;
    vadCtxRef.current?.close().catch(() => {}); vadCtxRef.current = null; analyserRef.current = null;
  }
  async function recordOneTurn(): Promise<{ blob: Blob | null; silent: boolean }> {
    const stream = await ensureMic();
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx(); vadCtxRef.current = ctx;
    const src2 = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser(); an.fftSize = 512; src2.connect(an); analyserRef.current = an;
    const rec = new MediaRecorder(stream, { mimeType: "audio/webm" }); recorderRef.current = rec;
    chunksRef.current = []; rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    return new Promise((resolve) => {
      let spoken = false, lastAbove = Date.now(); const start = Date.now();
      const data = new Uint8Array(an.frequencyBinCount);
      rec.start(); setCallState("recording");
      vadIntervalRef.current = setInterval(() => {
        an.getByteTimeDomainData(data);
        let sq = 0; for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sq += v * v; }
        const rms = Math.sqrt(sq / data.length); const now = Date.now();
        if (rms > SPEECH_RMS) { spoken = true; lastAbove = now; }
        if (spoken && now - lastAbove > SILENCE_STOP_MS) fin(false);
        else if (!spoken && now - start > SILENCE_WARN_MS) fin(true);
        else if (now - start > MAX_RECORD_MS) fin(!spoken);
      }, 100);
      function fin(silent: boolean) {
        stopVad(); rec.onstop = () => resolve({ blob: silent ? null : new Blob(chunksRef.current, { type: "audio/webm" }), silent });
        if (rec.state !== "inactive") rec.stop();
      }
    });
  }
  function playFiller() {
    try {
      const u = new SpeechSynthesisUtterance(["Mm-hmm.","I see.","Okay.","Right."][Math.floor(Math.random() * 4)]);
      u.rate = 1.1; window.speechSynthesis.speak(u);
    } catch {}
  }
  async function conversationLoop() {
    while (activeRef.current) {
      const { blob, silent } = await recordOneTurn(); if (!activeRef.current) return;
      if (silent) {
        setCallState("checking");
        const fd = new FormData(); fd.append("mode","greeting"); fd.append("text","Sorry, are you still there?");
        fd.append("language", currentLangRef.current); fd.append("speaker", settingsRef.current.speaker); fd.append("pace","1");
        try { const d2 = await callBackend(fd); setTranscript((t) => [...t, { speaker:"agent", text:"Sorry, are you still there?", lang: currentLangRef.current }]); if (d2.audioBase64) await playBase64Audio(d2.audioBase64); } catch {}
        if (!activeRef.current) return;
        const { blob: b2, silent: s2 } = await recordOneTurn(); if (!activeRef.current) return;
        if (s2 || !b2) {
          const fd2 = new FormData(); fd2.append("mode","greeting"); fd2.append("text","I'll let you go — thank you, have a good day!");
          fd2.append("language", currentLangRef.current); fd2.append("speaker", settingsRef.current.speaker); fd2.append("pace","1");
          try { const d3 = await callBackend(fd2); setTranscript((t) => [...t, { speaker:"agent", text:"I'll let you go — thank you, have a good day!", lang: currentLangRef.current }]); if (d3.audioBase64) await playBase64Audio(d3.audioBase64); } catch {}
          endConversation(); return;
        }
        await sendTurn(b2);
      } else if (blob) { await sendTurn(blob); }
    }
  }
  async function sendTurn(blob: Blob) {
    setCallState("sending"); playFiller();
    try {
      const fd = new FormData(); fd.append("mode","turn"); fd.append("audio", blob, "audio.webm");
      fd.append("history", JSON.stringify(historyRef.current));
      fd.append("instructions", settingsRef.current.instructions + "\n\nFacts:\n" + settingsRef.current.facts.map((f) => `- ${f}`).join("\n"));
      fd.append("language", currentLangRef.current); fd.append("speaker", settingsRef.current.speaker); fd.append("pace", String(settingsRef.current.speechRate));
      const d = await callBackend(fd); if (d.silent) return;
      setCurrentLang(d.detectedLanguage); currentLangRef.current = d.detectedLanguage;
      setTranscript((t) => [...t, { speaker:"caller", text: d.transcript, lang: d.detectedLanguage }]);
      historyRef.current.push({ role:"user", content: d.transcript });
      setCallState("speaking");
      setTranscript((t) => [...t, { speaker:"agent", text: d.replyText, lang: d.detectedLanguage }]);
      historyRef.current.push({ role:"assistant", content: d.replyText });
      if (d.audioBase64) await playBase64Audio(d.audioBase64);
    } catch (err: any) { setBackendError(err?.message || "Error."); endConversation(); }
  }
  async function startConversation() {
    setBackendError(""); setTranscript([]); historyRef.current = []; activeRef.current = true;
    const lang = settings.startingLanguage; setCurrentLang(lang); currentLangRef.current = lang;
    setCallState("greeting"); startAmbience(settings.backgroundSound);
    try {
      await ensureMic();
      const fd = new FormData(); fd.append("mode","greeting"); fd.append("text", settings.greeting);
      fd.append("language", lang); fd.append("speaker", settings.speaker); fd.append("pace", String(settings.speechRate));
      const d = await callBackend(fd); setTranscript([{ speaker:"agent", text: settings.greeting, lang }]);
      if (d.audioBase64) await playBase64Audio(d.audioBase64);
    } catch (err: any) { setBackendError(err?.message || "Couldn't reach Sarvam."); activeRef.current = false; setCallState("idle"); stopAmbience(); return; }
    if (activeRef.current) conversationLoop();
  }
  function endConversation() {
    activeRef.current = false; stopVad();
    if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
    audioElRef.current?.pause(); stopAmbience(); setCallState("ended");
    setTimeout(() => setCallState("idle"), 1400);
  }
  const stateLabel: Record<CallState, string> = { idle:"", greeting:"Agent speaking…", recording:"Listening…", sending:"Thinking…", speaking:"Agent speaking…", checking:"Checking in…", ended:"Call ended" };
  const langLabel = LANGUAGES.find((l) => l.code === currentLang)?.label ?? currentLang;

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar active="agent" />
      <div className="flex-1 flex flex-col bg-raised">
        <div className="border-b border-line px-6 py-3.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-signal-tint flex items-center justify-center text-signal font-display font-bold text-sm">{settings.agentName.charAt(0)}</div>
            <span className="font-semibold text-[15px]">{settings.agentName} — DBMCI Voice Agent</span>
            <span className="text-ink-soft text-sm">/</span>
            <span className="text-ink-soft text-sm">Draft</span>
          </div>
          <button onClick={() => setTab("tests")} className="bg-ink text-white rounded-full px-4 py-2 text-[13px] font-semibold flex items-center gap-2">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.95.36 1.87.68 2.75a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.33-1.34a2 2 0 0 1 2.11-.45c.88.32 1.8.55 2.75.68A2 2 0 0 1 22 16.92z" />
            </svg>
            Test agent
          </button>
        </div>
        <div className="flex flex-1 overflow-hidden">
          <div className="w-[200px] border-r border-line p-4 flex flex-col gap-0.5 shrink-0">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left ${tab === t.id ? "bg-signal-tint text-signal font-semibold" : "text-ink-soft hover:bg-paper"}`}>
                <span className="w-4 text-center text-xs">{t.icon}</span>{t.label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-10 relative">
            {tab === "instructions" && (
              <div className="max-w-[680px] flex flex-col gap-8">
                <div>
                  <h2 className="text-[13px] font-semibold uppercase tracking-wide border-b border-line pb-2 mb-3">Greeting</h2>
                  <textarea value={settings.greeting} onChange={(e) => setSettings((s) => ({ ...s, greeting: e.target.value }))} rows={3} className="w-full text-[15px] leading-relaxed outline-none resize-none bg-transparent" />
                </div>
                <div>
                  <h2 className="text-[13px] font-semibold uppercase tracking-wide border-b border-line pb-2 mb-3">Instructions</h2>
                  <textarea value={settings.instructions} onChange={(e) => setSettings((s) => ({ ...s, instructions: e.target.value }))} rows={8} className="w-full text-[15px] leading-relaxed outline-none resize-none bg-transparent" />
                  <div className="flex flex-wrap gap-2 mt-3">
                    {SUGGESTION_CHIPS.map((c) => (
                      <button key={c} onClick={() => addChip(c)} className="text-xs px-3 py-1.5 rounded-full border border-line bg-paper hover:bg-signal-tint hover:border-signal hover:text-signal text-ink-soft">+ {c}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <h2 className="text-lg font-display font-semibold mb-3">Facts</h2>
                  <div className="flex flex-col gap-2">
                    {settings.facts.map((f, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="text-ink-soft mt-2.5">•</span>
                        <textarea value={f} onChange={(e) => updateFact(i, e.target.value)} rows={1} className="flex-1 text-[15px] leading-relaxed outline-none resize-none bg-transparent py-1.5" />
                        <button onClick={() => removeFact(i)} className="text-miss text-xs font-semibold px-1 mt-2">✕</button>
                      </div>
                    ))}
                    <button onClick={addFact} className="text-[13px] font-semibold text-signal text-left mt-1 ml-4">+ Add a fact</button>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={handleSave} className="bg-ink text-white rounded-lg px-5 py-2.5 text-[13.5px] font-semibold">Save changes</button>
                  {saved && <span className="text-[13px] text-signal font-medium">Saved ✓</span>}
                </div>
              </div>
            )}
            {tab === "variables" && (
              <div className="max-w-[600px] text-center py-20">
                <div className="text-[15px] font-semibold mb-1.5">Variables</div>
                <div className="text-[13.5px] text-ink-soft">Personalize calls with per-contact values like name or city. Coming soon.</div>
              </div>
            )}
            {tab === "tools" && (
              <div className="max-w-[600px] text-center py-20">
                <div className="text-[15px] font-semibold mb-1.5">Tools</div>
                <div className="text-[13.5px] text-ink-soft">Let the agent book slots, transfer to a salesperson, or look up a record. Coming soon.</div>
              </div>
            )}
            {tab === "settings" && (
              <div className="max-w-[600px] flex flex-col gap-6">
                <div>
                  <label className="text-[13px] font-semibold block mb-1.5">Voice</label>
                  <select value={settings.speaker} onChange={(e) => setSettings((s) => ({ ...s, speaker: e.target.value }))} className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-signal">
                    {VOICES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className="text-[13px] font-semibold block mb-1.5">Pace <span className="font-normal text-ink-soft">{settings.speechRate.toFixed(1)}x</span></label>
                    <input type="range" min={0.5} max={2.0} step={0.1} value={settings.speechRate} onChange={(e) => setSettings((s) => ({ ...s, speechRate: parseFloat(e.target.value) }))} className="w-full accent-signal" />
                  </div>
                  <div>
                    <label className="text-[13px] font-semibold block mb-1.5">Pitch <span className="font-normal text-ink-soft">{settings.speechPitch.toFixed(1)}</span></label>
                    <input type="range" min={0.5} max={1.8} step={0.1} value={settings.speechPitch} onChange={(e) => setSettings((s) => ({ ...s, speechPitch: parseFloat(e.target.value) }))} className="w-full accent-signal" />
                  </div>
                </div>
                <div>
                  <label className="text-[13px] font-semibold block mb-1.5">Starting language</label>
                  <select value={settings.startingLanguage} onChange={(e) => setSettings((s) => ({ ...s, startingLanguage: e.target.value }))} className="border border-line rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-signal">
                    {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[13px] font-semibold block mb-1.5">Background sound</label>
                  <div className="flex gap-2 flex-wrap">
                    {BACKGROUND_OPTIONS.map((b) => (
                      <button key={b.id} onClick={() => setSettings((s) => ({ ...s, backgroundSound: b.id }))}
                        className={`text-[12.5px] font-semibold px-3 py-1.5 rounded-full border ${settings.backgroundSound === b.id ? "bg-ink text-white border-ink" : "bg-white text-ink-soft border-line"}`}>
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[13px] font-semibold block mb-1.5">Pronunciation overrides</label>
                  <div className="flex flex-col gap-2">
                    {settings.pronunciations.map((p, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input value={p.word} onChange={(e) => updatePron(i, "word", e.target.value)} placeholder="Word" className="flex-1 border border-line rounded-lg px-2.5 py-1.5 text-[12.5px] bg-white outline-none focus:border-signal" />
                        <span className="text-ink-soft text-xs">→</span>
                        <input value={p.sayAs} onChange={(e) => updatePron(i, "sayAs", e.target.value)} placeholder="Say it as" className="flex-1 border border-line rounded-lg px-2.5 py-1.5 text-[12.5px] bg-white outline-none focus:border-signal" />
                        <button onClick={() => removePron(i)} className="text-miss text-xs font-semibold px-1">✕</button>
                      </div>
                    ))}
                    <button onClick={addPron} className="text-[12.5px] font-semibold text-signal text-left mt-1">+ Add a word</button>
                  </div>
                </div>
                <div className="flex items-center gap-3 pt-2 border-t border-line">
                  <button onClick={handleSave} className="bg-ink text-white rounded-lg px-5 py-2.5 text-[13.5px] font-semibold mt-4">Save changes</button>
                  {saved && <span className="text-[13px] text-signal font-medium mt-4">Saved ✓</span>}
                </div>
              </div>
            )}
            {tab === "tests" && (
              <div className="max-w-[560px] flex flex-col gap-5">
                <div className="flex gap-1 border border-line rounded-xl p-1 bg-paper w-fit">
                  {(["voice","phone","chat"] as const).map((t) => (
                    <button key={t} onClick={() => setTestTab(t)}
                      className={`px-4 py-1.5 rounded-lg text-[13px] font-semibold ${testTab === t ? "bg-white shadow-sm text-ink" : "text-ink-soft hover:text-ink"}`}>
                      {t === "voice" ? "🎙 Voice" : t === "phone" ? "📞 Phone" : "💬 Chat"}
                    </button>
                  ))}
                </div>
                {testTab === "voice" && (
                  <div className="flex flex-col gap-4">
                    <p className="text-[13px] text-ink-soft">Browser mic → Sarvam STT → AI → Sarvam TTS. No phone needed.</p>
                    {!micSupported && <div className="text-[12.5px] text-miss bg-miss-tint border border-miss/20 rounded-lg px-3 py-2.5">Mic not supported — try Chrome.</div>}
                    {backendError && <div className="text-[12.5px] text-miss bg-miss-tint border border-miss/20 rounded-lg px-3 py-2.5">{backendError}</div>}
                    {micSupported && callState === "idle" && (
                      <button onClick={startConversation} className="bg-signal text-white rounded-lg px-5 py-2.5 text-[13.5px] font-semibold flex items-center gap-2 w-fit">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4"/>
                        </svg>
                        Start conversation
                      </button>
                    )}
                    {micSupported && callState !== "idle" && (
                      <div className="flex flex-col items-center gap-2 py-4 border border-line rounded-xl bg-white">
                        <div className={`w-14 h-14 rounded-full flex items-center justify-center mt-1 ${callState === "recording" ? "bg-signal-tint text-signal" : "bg-warm-tint text-warm"} ${callState !== "recording" && callState !== "ended" ? "animate-pulse" : ""}`}>
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4"/>
                          </svg>
                        </div>
                        <div className="text-[13.5px] font-semibold">{stateLabel[callState]}</div>
                        <div className="text-[11.5px] text-ink-soft">Language: {langLabel}</div>
                        {callState !== "ended" && <button onClick={endConversation} className="bg-miss text-white rounded-lg px-4 py-1.5 text-[12.5px] font-semibold mt-1 mb-2">End conversation</button>}
                      </div>
                    )}
                    <div className="border border-line rounded-xl bg-white min-h-[220px] max-h-[340px] overflow-y-auto p-3.5 flex flex-col gap-2.5">
                      {transcript.length === 0 && <div className="text-[12.5px] text-ink-soft text-center py-8">Your conversation will appear here.</div>}
                      {transcript.map((line, i) => (
                        <div key={i} className={`flex ${line.speaker === "agent" ? "justify-start" : "justify-end"}`}>
                          <div className={`max-w-[85%] rounded-lg px-3 py-1.5 text-[12.5px] ${line.speaker === "agent" ? "bg-paper text-ink" : "bg-signal-tint text-signal font-medium"}`}>{line.text}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {testTab === "phone" && (
                  <div className="flex flex-col gap-4">
                    <p className="text-[13px] text-ink-soft">Enter a number — Sarvam calls it using your DBMCI agent at full quality. Same pipeline as their “Connect to phone” button.</p>
                    <div className="border border-line rounded-xl bg-white p-5 flex flex-col gap-4">
                      {phoneStatus !== "calling" && (
                        <>
                          <div>
                            <label className="text-[12.5px] font-semibold block mb-1.5">Phone number</label>
                            <input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="+91 98765 43210"
                              className="w-full border border-line rounded-lg px-3 py-2.5 text-[14px] bg-paper outline-none focus:border-signal" />
                            <div className="text-[11px] text-ink-soft mt-1">Include country code (e.g. +91 for India)</div>
                          </div>
                          <button onClick={triggerPhoneCall} disabled={phoneLoading || !phoneNumber.trim()}
                            className="bg-signal text-white rounded-lg py-2.5 text-[13.5px] font-semibold flex items-center justify-center gap-2 disabled:opacity-40">
                            {phoneLoading ? "Connecting to Sarvam…" : (
                              <>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.13 12 19.79 19.79 0 0 1 1.06 3.38 2 2 0 0 1 3.05 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21 16z"/>
                                </svg>
                                Call this number
                              </>
                            )}
                          </button>
                          {phoneStatus === "error" && phoneError && (
                            <div className="text-[12.5px] text-miss bg-miss-tint border border-miss/20 rounded-lg px-3 py-2.5">
                              <div className="font-semibold mb-0.5">Call failed</div>
                              <div className="font-mono text-[11px] break-all">{phoneError}</div>
                            </div>
                          )}
                        </>
                      )}
                      {phoneStatus === "calling" && (
                        <div className="flex flex-col items-center gap-3 py-6">
                          <div className="w-16 h-16 rounded-full bg-signal-tint text-signal flex items-center justify-center animate-pulse">
                            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.13 12 19.79 19.79 0 0 1 1.06 3.38 2 2 0 0 1 3.05 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21 16z"/>
                            </svg>
                          </div>
                          <div className="text-[15px] font-semibold text-signal">Calling {phoneNumber}…</div>
                          <div className="text-[12.5px] text-ink-soft text-center max-w-[280px]">Sarvam is ringing the number. Pick up — your DBMCI agent will speak immediately.</div>
                          <button onClick={() => { setPhoneStatus("idle"); setPhoneNumber(""); }}
                            className="text-[12.5px] font-semibold text-ink-soft border border-line rounded-lg px-4 py-1.5 mt-1">
                            Make another call
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="text-[11.5px] text-ink-soft bg-paper border border-line rounded-lg px-3 py-2.5 leading-relaxed">
                      ℹ️ Uses your <span className="font-mono">SARVAM_ORG_ID</span>, <span className="font-mono">SARVAM_APP_ID</span>, <span className="font-mono">SARVAM_CONNECTION_ID</span> env vars via Sarvam’s Instant Outbound API.
                    </div>
                  </div>
                )}
                {testTab === "chat" && (
                  <div className="flex flex-col gap-4">
                    <p className="text-[13px] text-ink-soft">Text-only test — same agent instructions, no audio. Good for quickly checking responses.</p>
                    <div className="border border-line rounded-xl bg-white min-h-[260px] max-h-[360px] overflow-y-auto p-3.5 flex flex-col gap-2.5">
                      {chatHistory.length === 0 && <div className="text-[12.5px] text-ink-soft text-center py-8">Type a message below to start.</div>}
                      {chatHistory.map((m, i) => (
                        <div key={i} className={`flex ${m.role === "assistant" ? "justify-start" : "justify-end"}`}>
                          <div className={`max-w-[85%] rounded-lg px-3 py-1.5 text-[12.5px] ${m.role === "assistant" ? "bg-paper text-ink" : "bg-signal-tint text-signal font-medium"}`}>{m.text}</div>
                        </div>
                      ))}
                      {chatLoading && <div className="flex justify-start"><div className="bg-paper rounded-lg px-3 py-1.5 text-[12.5px] text-ink-soft animate-pulse">Thinking…</div></div>}
                    </div>
                    <div className="flex gap-2">
                      <input value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                        placeholder="Type a message and press Enter…" disabled={chatLoading}
                        className="flex-1 border border-line rounded-lg px-3 py-2.5 text-[13px] bg-white outline-none focus:border-signal" />
                      <button onClick={() => { setChatHistory([]); setChatInput(""); }}
                        className="text-[12px] text-ink-soft border border-line rounded-lg px-3">Clear</button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {tab === "instructions" && (
              <div className="absolute bottom-8 left-10 bg-raised border border-line rounded-xl p-4 w-[230px] shadow-sm">
                <div className="flex items-center gap-1.5 mb-2 text-[12px] font-semibold text-signal">
                  <span className="w-1.5 h-1.5 rounded-full bg-signal" /> Ready
                </div>
                <div className="text-[13px] font-medium mb-3">Your agent is ready to test</div>
                <button onClick={() => setTab("tests")} className="w-full bg-ink text-white rounded-lg py-2 text-[12.5px] font-semibold">Test agent</button>
              </div>
            )}
          </div>
          <div className="w-[340px] border-l border-line flex flex-col shrink-0">
            <div className="px-4 py-3.5 border-b border-line flex items-center gap-1.5">
              <span className="text-signal">✨</span>
              <span className="text-[14px] font-semibold">Edit with AI</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
              {editLog.length === 0 && <div className="text-[12.5px] text-ink-soft leading-relaxed">Describe a change — e.g. “mention we now offer EMI options” or “make the greeting shorter” — and I’ll rewrite Greeting, Instructions, and Facts.</div>}
              {editLog.map((e, i) => (
                <div key={i} className="flex flex-col gap-1.5">
                  <div className="bg-paper rounded-lg px-3 py-2 text-[12.5px] self-end max-w-[85%]">{e.request}</div>
                  <div className="flex items-center gap-1.5 text-[11px] text-ink-soft"><span className="text-signal">✓</span> {e.summary} · {e.time}</div>
                </div>
              ))}
              {editError && <div className="text-[12.5px] text-miss bg-miss-tint rounded-lg px-3 py-2">{editError}</div>}
              {editLoading && <div className="text-[12.5px] text-ink-soft">Rewriting…</div>}
            </div>
            <div className="p-3 border-t border-line flex items-end gap-2">
              <textarea value={editInput} onChange={(e) => setEditInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitEdit(); } }}
                placeholder="Ask AI to change this agent…" rows={2}
                className="flex-1 border border-line rounded-lg px-3 py-2 text-[13px] bg-white outline-none focus:border-signal resize-none" />
              <button onClick={submitEdit} disabled={editLoading || !editInput.trim()}
                className="bg-ink text-white rounded-full w-9 h-9 flex items-center justify-center disabled:opacity-40 shrink-0">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
