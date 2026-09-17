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
import { applyPronunciations, detectScriptLanguage } from "@/lib/langDetect";
import { nextAgentLine } from "@/lib/conversationEngine";

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

type CallState = "idle" | "greeting" | "listening" | "speaking" | "checking" | "ended";
type TranscriptLine = { speaker: "agent" | "caller"; text: string; lang: string };

const SILENCE_WARN_MS = 7500;
const SILENCE_DISCONNECT_MS = 6000;

export default function AgentPage() {
  const [settings, setSettings] = useState<AgentSettings>(DEFAULT_AGENT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);

  const [callState, setCallState] = useState<CallState>("idle");
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [currentLang, setCurrentLang] = useState("en-IN");

  const recognitionRef = useRef<any>(null);
  const turnRef = useRef(0);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const ambienceNodesRef = useRef<{ src: AudioBufferSourceNode; gain: GainNode } | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const activeRef = useRef(false);

  useEffect(() => {
    setSettings(getAgentSettings());
    const hasRecognition = typeof window !== "undefined" && (("SpeechRecognition" in window) || ("webkitSpeechRecognition" in window));
    const hasSynthesis = typeof window !== "undefined" && "speechSynthesis" in window;
    setSpeechSupported(!!hasRecognition && !!hasSynthesis);
  }, []);

  function handleSave() {
    saveAgentSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  }

  function addChip(text: string) {
    setSettings((s) => ({
      ...s,
      instructions: s.instructions.trim().length ? `${s.instructions.trim()}\n- ${text}` : `- ${text}`,
    }));
  }

  function addPronunciation() {
    setSettings((s) => ({ ...s, pronunciations: [...s.pronunciations, { word: "", sayAs: "" }] }));
  }
  function updatePronunciation(i: number, field: "word" | "sayAs", value: string) {
    setSettings((s) => {
      const next = [...s.pronunciations];
      next[i] = { ...next[i], [field]: value };
      return { ...s, pronunciations: next };
    });
  }
  function removePronunciation(i: number) {
    setSettings((s) => ({ ...s, pronunciations: s.pronunciations.filter((_, idx) => idx !== i) }));
  }

  function pickVoice(lang: string): SpeechSynthesisVoice | null {
    const voices = window.speechSynthesis.getVoices();
    return (
      voices.find((v) => v.lang.toLowerCase() === lang.toLowerCase()) ||
      voices.find((v) => v.lang.toLowerCase().startsWith(lang.split("-")[0])) ||
      voices.find((v) => v.lang.toLowerCase().startsWith("en")) ||
      voices[0] ||
      null
    );
  }

  function speak(text: string, lang: string): Promise<void> {
    return new Promise((resolve) => {
      const spoken = applyPronunciations(text, settingsRef.current.pronunciations);
      const utter = new SpeechSynthesisUtterance(spoken);
      utter.rate = settingsRef.current.speechRate;
      utter.pitch = settingsRef.current.speechPitch;
      const voice = pickVoice(lang);
      if (voice) utter.voice = voice;
      utter.lang = lang;
      utter.onend = () => resolve();
      utter.onerror = () => resolve();
      window.speechSynthesis.speak(utter);
    });
  }

  function clearTimers() {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
    silenceTimerRef.current = null;
    disconnectTimerRef.current = null;
  }

  function startAmbience(kind: BackgroundSound) {
    if (kind === "none") return;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtx();
    audioCtxRef.current = ctx;
    const bufferSize = 2 * ctx.sampleRate;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = kind === "traffic" ? 180 : kind === "callcenter" ? 900 : 500;
    filter.Q.value = 0.6;

    const gain = ctx.createGain();
    gain.gain.value = kind === "callcenter" ? 0.05 : kind === "traffic" ? 0.045 : 0.025;

    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
    ambienceNodesRef.current = { src, gain };
  }

  function stopAmbience() {
    ambienceNodesRef.current?.src.stop();
    ambienceNodesRef.current = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
  }

  function startListening(lang: string) {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = lang;
    rec.continuous = false;
    rec.interimResults = false;

    rec.onresult = (e: any) => {
      const text = e.results[0][0].transcript as string;
      clearTimers();
      handleCallerSpeech(text);
    };
    rec.onerror = () => {
      // stay silent — the silence timer handles the "are you still there" flow
    };
    recognitionRef.current = rec;
    rec.start();
    setCallState("listening");

    silenceTimerRef.current = setTimeout(() => {
      recognitionRef.current?.stop();
      handleSilenceWarning();
    }, SILENCE_WARN_MS);
  }

  async function handleSilenceWarning() {
    if (!activeRef.current) return;
    setCallState("checking");
    await speak("Sorry, are you still there? I just want to check you can hear me.", currentLang);
    setTranscript((t) => [...t, { speaker: "agent", text: "Sorry, are you still there? I just want to check you can hear me.", lang: currentLang }]);
    if (!activeRef.current) return;

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = currentLang;
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      const text = e.results[0][0].transcript as string;
      clearTimers();
      handleCallerSpeech(text);
    };
    recognitionRef.current = rec;
    rec.start();
    setCallState("listening");

    disconnectTimerRef.current = setTimeout(async () => {
      recognitionRef.current?.stop();
      setCallState("speaking");
      const bye = "I'll let you go for now — thank you for your time, have a good day.";
      setTranscript((t) => [...t, { speaker: "agent", text: bye, lang: currentLang }]);
      await speak(bye, currentLang);
      endConversation();
    }, SILENCE_DISCONNECT_MS);
  }

  async function handleCallerSpeech(text: string) {
    const detected = detectScriptLanguage(text) || currentLang;
    setCurrentLang(detected);
    setTranscript((t) => [...t, { speaker: "caller", text, lang: detected }]);
    setCallState("speaking");

    const reply = nextAgentLine(turnRef.current, text);
    turnRef.current += 1;
    setTranscript((t) => [...t, { speaker: "agent", text: reply, lang: detected }]);
    await speak(reply, detected);

    if (activeRef.current) startListening(detected);
  }

  async function startConversation() {
    setTranscript([]);
    turnRef.current = 0;
    activeRef.current = true;
    const lang = settings.startingLanguage;
    setCurrentLang(lang);
    setCallState("greeting");
    startAmbience(settings.backgroundSound);
    setTranscript([{ speaker: "agent", text: settings.greeting, lang }]);
    await speak(settings.greeting, lang);
    startListening(lang);
  }

  function endConversation() {
    activeRef.current = false;
    clearTimers();
    recognitionRef.current?.stop();
    window.speechSynthesis.cancel();
    stopAmbience();
    setCallState("ended");
    setTimeout(() => setCallState("idle"), 1400);
  }

  const stateLabel: Record<CallState, string> = {
    idle: "",
    greeting: "Agent speaking…",
    listening: "Listening…",
    speaking: "Agent speaking…",
    checking: "Checking in…",
    ended: "Call ended",
  };

  const currentLangLabel = LANGUAGES.find((l) => l.code === currentLang)?.label ?? currentLang;

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar active="agent" />

      <main className="flex-1 box-border p-11 flex flex-col gap-7 max-w-[1260px]">
        <div>
          <h1 className="font-display text-[26px] font-semibold m-0">Agent</h1>
          <div className="text-[13px] text-ink-soft mt-1">
            Tell your AI agent how to talk, tune its voice, then test it right here — no phone number needed.
          </div>
        </div>

        <div className="grid grid-cols-[1.1fr_0.9fr] gap-5 items-start">
          {/* Left column */}
          <div className="flex flex-col gap-5">
            <div className="bg-raised border border-line rounded-[10px] p-6 flex flex-col gap-4">
              <div>
                <label className="text-[13px] font-semibold block mb-1.5">Agent name</label>
                <input
                  value={settings.agentName}
                  onChange={(e) => setSettings((s) => ({ ...s, agentName: e.target.value }))}
                  className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-signal"
                />
              </div>
              <div>
                <label className="text-[13px] font-semibold block mb-1.5">Opening greeting</label>
                <textarea
                  value={settings.greeting}
                  onChange={(e) => setSettings((s) => ({ ...s, greeting: e.target.value }))}
                  rows={2}
                  className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-signal resize-none"
                />
              </div>
              <div>
                <label className="text-[13px] font-semibold block mb-1.5">
                  Instructions <span className="font-normal text-ink-soft">— how it should behave on the call</span>
                </label>
                <textarea
                  value={settings.instructions}
                  onChange={(e) => setSettings((s) => ({ ...s, instructions: e.target.value }))}
                  rows={7}
                  className="w-full border border-line rounded-lg px-3 py-2.5 text-sm bg-white outline-none focus:border-signal resize-none leading-relaxed"
                />
              </div>
              <div>
                <div className="text-xs text-ink-soft mb-2">Quick add</div>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTION_CHIPS.map((c) => (
                    <button
                      key={c}
                      onClick={() => addChip(c)}
                      className="text-xs px-3 py-1.5 rounded-full border border-line bg-paper hover:bg-signal-tint hover:border-signal hover:text-signal text-ink-soft"
                    >
                      + {c}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Voice & behavior */}
            <div className="bg-raised border border-line rounded-[10px] p-6 flex flex-col gap-5">
              <div className="text-[15px] font-semibold">Voice &amp; behavior</div>

              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="text-[13px] font-semibold block mb-1.5">
                    Speaking speed <span className="font-normal text-ink-soft">{settings.speechRate.toFixed(1)}x</span>
                  </label>
                  <input
                    type="range" min={0.6} max={1.6} step={0.1}
                    value={settings.speechRate}
                    onChange={(e) => setSettings((s) => ({ ...s, speechRate: parseFloat(e.target.value) }))}
                    className="w-full accent-signal"
                  />
                </div>
                <div>
                  <label className="text-[13px] font-semibold block mb-1.5">
                    Pitch <span className="font-normal text-ink-soft">{settings.speechPitch.toFixed(1)}</span>
                  </label>
                  <input
                    type="range" min={0.5} max={1.8} step={0.1}
                    value={settings.speechPitch}
                    onChange={(e) => setSettings((s) => ({ ...s, speechPitch: parseFloat(e.target.value) }))}
                    className="w-full accent-signal"
                  />
                </div>
              </div>

              <div>
                <label className="text-[13px] font-semibold block mb-1.5">Starting language</label>
                <select
                  value={settings.startingLanguage}
                  onChange={(e) => setSettings((s) => ({ ...s, startingLanguage: e.target.value }))}
                  className="border border-line rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-signal"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>{l.label}</option>
                  ))}
                </select>
                <div className="text-[11.5px] text-ink-soft mt-1.5">
                  The agent opens in this language, then switches automatically to match whatever the caller speaks.
                </div>
              </div>

              <div>
                <label className="text-[13px] font-semibold block mb-1.5">Background sound</label>
                <div className="flex gap-2 flex-wrap">
                  {BACKGROUND_OPTIONS.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => setSettings((s) => ({ ...s, backgroundSound: b.id }))}
                      className={`text-[12.5px] font-semibold px-3 py-1.5 rounded-full border ${
                        settings.backgroundSound === b.id ? "bg-ink text-white border-ink" : "bg-white text-ink-soft border-line"
                      }`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[13px] font-semibold block mb-1.5">Pronunciation overrides</label>
                <div className="text-[11.5px] text-ink-soft mb-2">
                  If the agent says a word wrong, tell it how to say it instead.
                </div>
                <div className="flex flex-col gap-2">
                  {settings.pronunciations.map((p, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        value={p.word}
                        onChange={(e) => updatePronunciation(i, "word", e.target.value)}
                        placeholder="Word (e.g. DBMCI)"
                        className="flex-1 border border-line rounded-lg px-2.5 py-1.5 text-[12.5px] bg-white outline-none focus:border-signal"
                      />
                      <span className="text-ink-soft text-xs">→</span>
                      <input
                        value={p.sayAs}
                        onChange={(e) => updatePronunciation(i, "sayAs", e.target.value)}
                        placeholder="Say it as (e.g. D B M C I)"
                        className="flex-1 border border-line rounded-lg px-2.5 py-1.5 text-[12.5px] bg-white outline-none focus:border-signal"
                      />
                      <button onClick={() => removePronunciation(i)} className="text-miss text-xs font-semibold px-1">✕</button>
                    </div>
                  ))}
                  <button onClick={addPronunciation} className="text-[12.5px] font-semibold text-signal text-left mt-1">
                    + Add a word
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-1 border-t border-line">
                <button onClick={handleSave} className="bg-ink text-white rounded-lg px-5 py-2.5 text-[13.5px] font-semibold mt-4">
                  Save changes
                </button>
                {saved && <span className="text-[13px] text-signal font-medium mt-4">Saved ✓</span>}
              </div>
            </div>
          </div>

          {/* Right column — test conversation */}
          <div className="bg-raised border border-line rounded-[10px] p-6 flex flex-col gap-4 sticky top-11">
            <div>
              <div className="text-[15px] font-semibold">Test this agent</div>
              <div className="text-[12.5px] text-ink-soft mt-1">
                Have a real spoken conversation with it, right in your browser — no phone number required.
              </div>
            </div>

            {!speechSupported && (
              <div className="text-[12.5px] text-miss bg-miss-tint border border-miss/20 rounded-lg px-3 py-2.5">
                Your browser doesn't support live voice conversations. Please try this in Chrome on desktop or Android.
              </div>
            )}

            {speechSupported && callState === "idle" && (
              <button
                onClick={startConversation}
                className="bg-signal text-white rounded-lg px-5 py-3 text-[13.5px] font-semibold flex items-center justify-center gap-2"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4" />
                </svg>
                Start conversation
              </button>
            )}

            {speechSupported && callState !== "idle" && (
              <div className="flex flex-col items-center gap-2 py-3">
                <div className={`w-14 h-14 rounded-full flex items-center justify-center ${
                  callState === "listening" ? "bg-signal-tint text-signal" : "bg-warm-tint text-warm"
                } ${callState !== "listening" && callState !== "ended" ? "animate-pulse" : ""}`}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4" />
                  </svg>
                </div>
                <div className="text-[13.5px] font-semibold">{stateLabel[callState]}</div>
                <div className="text-[11.5px] text-ink-soft">Speaking: {currentLangLabel}</div>
                {callState !== "ended" && (
                  <button onClick={endConversation} className="bg-miss text-white rounded-lg px-4 py-1.5 text-[12.5px] font-semibold mt-1">
                    End conversation
                  </button>
                )}
              </div>
            )}

            <div className="border border-line rounded-lg bg-white flex-1 min-h-[220px] max-h-[360px] overflow-y-auto p-3.5 flex flex-col gap-2.5">
              {transcript.length === 0 && (
                <div className="text-[12.5px] text-ink-soft text-center py-8">Your conversation will appear here.</div>
              )}
              {transcript.map((line, i) => (
                <div key={i} className={`flex ${line.speaker === "agent" ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[85%] rounded-lg px-3 py-1.5 text-[12.5px] ${
                    line.speaker === "agent" ? "bg-paper text-ink" : "bg-signal-tint text-signal font-medium"
                  }`}>
                    {line.text}
                  </div>
                </div>
              ))}
            </div>

            <div className="text-[11.5px] text-ink-soft border-t border-line pt-3">
              Preview conversation logic — real replies connect once your agent is linked to calling. Voice, speed, pitch, language switching, and silence handling are all live right now.
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
