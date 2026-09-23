// @ts-nocheck
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import {
  AgentSettings,
  AgentStep,
  AgentVariable,
  BackgroundSound,
  DEFAULT_AGENT_SETTINGS,
  LANGUAGES,
  STRICTNESS_LABELS,
  ScriptVersion,
  deleteScriptVersion,
  getAgentSettings,
  getScriptVersions,
  instructionsToSteps,
  saveAgentSettings,
  saveScriptVersion,
  stepsToInstructions,
} from "@/lib/storage";
import { CartesiaVoiceCall } from "@/lib/cartesia-voice-client";

/* ── constants ── */
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

/** Mirrors the live classifyLead() logic in lib/calls.ts — kept in sync by hand, not fetched. */
const OUTCOMES: { key: string; label: string; description: string; tone: string }[] = [
  { key: "no_answer", label: "No answer", description: "The call didn't connect — no answer, busy, or a carrier failure.", tone: "bg-paper text-ink-soft border border-line" },
  { key: "ready_to_close", label: "Ready to close", description: "Something the caller said matched \"ready\", \"enrol\", \"book\" or \"convert\" — hand this to your counsellor first.", tone: "bg-signal-tint text-signal border border-signal/30" },
  { key: "hot", label: "Hot", description: "Matched \"hot\" or \"high\" interest.", tone: "bg-orange-50 text-orange-700 border border-orange-200" },
  { key: "warm", label: "Warm", description: "Matched \"warm\", \"interested\", \"callback\" or \"follow up\".", tone: "bg-amber-50 text-amber-700 border border-amber-200" },
  { key: "not_interested", label: "Not interested", description: "Matched \"not interested\", \"decline\", \"reject\", or a do-not-disturb request.", tone: "bg-miss-tint text-miss border border-miss/20" },
  { key: "cold", label: "Cold", description: "Matched \"cold\"/\"low\" interest, or the call lasted under 15 seconds with no other signal.", tone: "bg-paper text-ink-soft border border-line" },
  { key: "new", label: "New", description: "Nothing above matched yet — the default until a human or a later call reclassifies it.", tone: "bg-paper text-ink-soft border border-line" },
];

type Tab = "overview" | "leads" | "script" | "training" | "actions" | "outcomes" | "voice" | "settings";
type TestTab = "voice" | "phone" | "chat";
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "overview",  label: "Overview",     icon: "◎"  },
  { id: "leads",     label: "Instant leads",icon: "{}" },
  { id: "script",    label: "Call script",  icon: "T"  },
  { id: "training",  label: "Training",     icon: "✦"  },
  { id: "actions",   label: "Actions",      icon: "⚡" },
  { id: "outcomes",  label: "Outcomes",     icon: "✓"  },
  { id: "voice",     label: "Voice",        icon: "♪"  },
  { id: "settings",  label: "Settings",     icon: "⚙"  },
];

/* ── voice call state ── */
type CallStatus = "idle" | "requesting" | "connecting" | "live" | "ending" | "error";

export default function AgentPage() {
  const [settings, setSettings] = useState<AgentSettings & { speaker: string }>({
    ...DEFAULT_AGENT_SETTINGS, speaker: "",
  });
  const [tab,   setTab]   = useState<Tab>("overview");
  const [saved, setSaved] = useState(false);

  /* script versions */
  const [versions,     setVersions]     = useState<ScriptVersion[]>([]);
  const [versionLabel, setVersionLabel] = useState("");
  const [savingVer,    setSavingVer]    = useState(false);
  const [savedVerMsg,  setSavedVerMsg]  = useState("");
  const [showVerPanel, setShowVerPanel] = useState(false);

  /* AI edit panel */
  const [editInput,   setEditInput]   = useState("");
  const [editLog,     setEditLog]     = useState<{ request: string; summary: string; time: string }[]>([]);
  const [editLoading, setEditLoading] = useState(false);
  const [editError,   setEditError]   = useState("");

  /* Cartesia catalog + publish */
  const [cartesiaVoices, setCartesiaVoices] = useState<{ id: string; name: string; language: string | null; tagline?: string | null }[]>([]);
  const [cartesiaModels, setCartesiaModels] = useState<{ id: string; name: string; provider?: string | null }[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError,   setCatalogError]   = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");

  const [publishStatus, setPublishStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [publishError,  setPublishError]  = useState("");
  const [publishInfo,   setPublishInfo]   = useState<{ agentId?: string; webhookId?: string; voiceId?: string; modelId?: string; hasWebhook?: boolean } | null>(null);

  /* test modal */
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testTab, setTestTab] = useState<TestTab>("voice");
  function openTestModal(t: TestTab) { setTestTab(t); setTestModalOpen(true); }
  function closeTestModal() { setTestModalOpen(false); }

  /* ── EMBEDDED VOICE CALL ── */
  const [callStatus,   setCallStatus]   = useState<CallStatus>("idle");
  const [callError,    setCallError]    = useState("");
  const [callDuration, setCallDuration] = useState(0);
  const [transcript,   setTranscript]   = useState<{ role: "agent" | "user"; text: string }[]>([]);
  const [isMuted,      setIsMuted]      = useState(false);
  const cartesiaCallRef = useRef<CartesiaVoiceCall | null>(null);
  const durationRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  /* phone call */
  const [phoneNumber,  setPhoneNumber]  = useState("");
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneStatus,  setPhoneStatus]  = useState<"idle" | "calling" | "done" | "error">("idle");
  const [phoneError,   setPhoneError]   = useState("");

  /* chat test */
  const [chatInput,   setChatInput]   = useState("");
  const [chatHistory, setChatHistory] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    setSettings((s) => ({ ...s, ...getAgentSettings() }));
    setVersions(getScriptVersions());
    loadCartesiaCatalog();
    loadPublishStatus();
  }, []);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [transcript]);

  function persist(next: AgentSettings & { speaker: string }) { setSettings(next); saveAgentSettings(next); }
  function handleSave() { saveAgentSettings(settings); setSaved(true); setTimeout(() => setSaved(false), 2200); }

  async function loadCartesiaCatalog() {
    setCatalogLoading(true); setCatalogError("");
    try {
      const res = await fetch("/api/admin/cartesia-catalog");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load voices/models.");
      setCartesiaVoices(data.voices || []);
      setCartesiaModels(data.models || []);
    } catch (err: any) {
      setCatalogError(err?.message || "Something went wrong.");
    } finally { setCatalogLoading(false); }
  }

  async function loadPublishStatus() {
    try {
      const res = await fetch("/api/admin/cartesia-agent");
      const data = await res.json();
      if (res.ok && data.agentId) setPublishInfo({ agentId: data.agentId, hasWebhook: data.hasWebhook });
    } catch { /* ignore — Overview just shows "Not published yet" */ }
  }

  async function handlePublish() {
    setPublishStatus("loading"); setPublishError("");
    try {
      const res = await fetch("/api/admin/cartesia-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: settings.agentName,
          greeting: settings.greeting,
          instructions: settings.instructions,
          startingLanguage: settings.startingLanguage,
          speechRate: settings.speechRate,
          voiceId: settings.speaker || undefined,
          modelId: selectedModelId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Publish failed.");
      setPublishInfo({ agentId: data.agentId, webhookId: data.webhookId, voiceId: data.voiceId, modelId: data.modelId, hasWebhook: true });
      setPublishStatus("done");
    } catch (err: any) {
      setPublishError(err?.message || "Something went wrong.");
      setPublishStatus("error");
    }
  }

  function handleSaveVersion() {
    setSavingVer(true);
    const label = versionLabel.trim() || undefined;
    saveScriptVersion({
      label: label ?? "",
      greeting: settings.greeting,
      instructions: settings.instructions,
      facts: settings.facts,
      steps: settings.steps,
      variables: settings.variables,
      strictness: settings.strictness,
      speaker: settings.speaker,
      speechRate: settings.speechRate,
      speechPitch: settings.speechPitch,
      startingLanguage: settings.startingLanguage,
    }, label);
    const updated = getScriptVersions();
    setVersions(updated);
    setSavingVer(false);
    setVersionLabel("");
    setSavedVerMsg(`Saved as ${updated[0].label}`);
    setTimeout(() => setSavedVerMsg(""), 2500);
  }

  function handleRestoreVersion(v: ScriptVersion) {
    const steps = v.steps && v.steps.length > 0 ? v.steps : instructionsToSteps(v.instructions);
    const next = {
      ...settings, greeting: v.greeting, instructions: v.instructions, facts: v.facts,
      steps, variables: v.variables ?? settings.variables,
      strictness: typeof v.strictness === "number" ? v.strictness : settings.strictness,
      speaker: v.speaker, speechRate: v.speechRate, speechPitch: v.speechPitch, startingLanguage: v.startingLanguage,
    };
    persist(next);
  }

  function handleDeleteVersion(vnum: number) {
    deleteScriptVersion(vnum);
    setVersions(getScriptVersions());
  }

  /* facts */
  function addFact()                        { setSettings((s) => ({ ...s, facts: [...s.facts, ""] })); }
  function updateFact(i: number, v: string) { setSettings((s) => { const f = [...s.facts]; f[i] = v; return { ...s, facts: f }; }); }
  function removeFact(i: number)            { setSettings((s) => ({ ...s, facts: s.facts.filter((_, x) => x !== i) })); }

  /* pronunciations */
  function addPron() { setSettings((s) => ({ ...s, pronunciations: [...s.pronunciations, { word: "", sayAs: "" }] })); }
  function updatePron(i: number, f: "word" | "sayAs", v: string) {
    setSettings((s) => { const p = [...s.pronunciations]; p[i] = { ...p[i], [f]: v }; return { ...s, pronunciations: p }; });
  }
  function removePron(i: number) { setSettings((s) => ({ ...s, pronunciations: s.pronunciations.filter((_, x) => x !== i) })); }

  /* call-script steps */
  function addStep() {
    setSettings((s) => {
      const steps = [...s.steps, { id: `s${Date.now()}`, title: "New step", body: "" }];
      return { ...s, steps, instructions: stepsToInstructions(steps, s.strictness) };
    });
  }
  function updateStep(id: string, field: "title" | "body", value: string) {
    setSettings((s) => {
      const steps = s.steps.map((st) => (st.id === id ? { ...st, [field]: value } : st));
      return { ...s, steps, instructions: stepsToInstructions(steps, s.strictness) };
    });
  }
  function removeStep(id: string) {
    setSettings((s) => {
      const steps = s.steps.filter((st) => st.id !== id);
      return { ...s, steps, instructions: stepsToInstructions(steps, s.strictness) };
    });
  }
  function moveStep(id: string, dir: number) {
    setSettings((s) => {
      const idx = s.steps.findIndex((st) => st.id === id);
      const swapIdx = idx + dir;
      if (idx === -1 || swapIdx < 0 || swapIdx >= s.steps.length) return s;
      const steps = [...s.steps];
      const tmp = steps[idx]; steps[idx] = steps[swapIdx]; steps[swapIdx] = tmp;
      return { ...s, steps, instructions: stepsToInstructions(steps, s.strictness) };
    });
  }
  function addStepFromChip(text: string) {
    setSettings((s) => {
      const steps = [...s.steps, { id: `s${Date.now()}`, title: "House rule", body: text }];
      return { ...s, steps, instructions: stepsToInstructions(steps, s.strictness) };
    });
  }
  function setStrictness(v: number) {
    setSettings((s) => ({ ...s, strictness: v, instructions: stepsToInstructions(s.steps, v) }));
  }

  /* instant-lead variables */
  function addVariable() { setSettings((s) => ({ ...s, variables: [...s.variables, { key: "", label: "" }] })); }
  function updateVariable(i: number, field: "key" | "label", value: string) {
    setSettings((s) => { const v = [...s.variables]; v[i] = { ...v[i], [field]: value }; return { ...s, variables: v }; });
  }
  function removeVariable(i: number) { setSettings((s) => ({ ...s, variables: s.variables.filter((_, x) => x !== i) })); }

  async function submitEdit() {
    if (!editInput.trim() || editLoading) return;
    const req = editInput.trim(); setEditInput(""); setEditLoading(true); setEditError("");
    try {
      const res = await fetch("/api/edit-agent", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ greeting: settings.greeting, instructions: settings.instructions, facts: settings.facts, request: req }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed.");
      const steps = instructionsToSteps(data.instructions);
      persist({ ...settings, greeting: data.greeting, instructions: data.instructions, facts: data.facts, steps });
      setEditLog((l) => [{ request: req, summary: data.summary, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }, ...l]);
      setTab("script");
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
      const history = chatHistory.map((m) => ({ role: m.role, content: m.text }));
      const res = await fetch("/api/test-call", { method: "POST",
        body: (() => { const fd = new FormData(); fd.append("mode", "chat");
          fd.append("instructions", settings.instructions + "\n\nFacts:\n" + settings.facts.map((f) => `- ${f}`).join("\n"));
          fd.append("text", userText); fd.append("history", JSON.stringify(history)); return fd; })() });
      const data = await res.json();
      setChatHistory((h) => [...h, { role: "assistant", text: data.replyText || "(no response)" }]);
    } catch { setChatHistory((h) => [...h, { role: "assistant", text: "(Error — check your API key)" }]); }
    finally { setChatLoading(false); }
  }

  /* ─────────── EMBEDDED VOICE CALL — real audio from your published Cartesia agent ───────────
     Cartesia doesn't ship a browser SDK for this yet, so lib/cartesia-voice-client.ts
     hand-rolls the raw WebSocket protocol (mic capture, resampling, playback scheduling). */
  const startVoiceCall = useCallback(async () => {
    if (callStatus !== "idle" && callStatus !== "error") return;
    if (!publishInfo?.agentId) {
      setCallStatus("error");
      setCallError("Publish your agent to Cartesia first (Overview tab) — there's nothing live to call yet.");
      return;
    }
    setCallError("");
    setTranscript([]);
    setCallDuration(0);
    setCallStatus("connecting");

    const call = new CartesiaVoiceCall((evt) => {
      if (evt.type === "live") {
        setCallStatus("live");
        durationRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
      } else if (evt.type === "transcript") {
        setTranscript((t) => {
          const last = t[t.length - 1];
          if (last && last.role === evt.role) {
            return [...t.slice(0, -1), { role: evt.role, text: `${last.text} ${evt.text}`.trim() }];
          }
          return [...t, { role: evt.role, text: evt.text }];
        });
      } else if (evt.type === "ended") {
        setCallStatus("idle");
        if (durationRef.current) { clearInterval(durationRef.current); durationRef.current = null; }
      } else if (evt.type === "error") {
        setCallStatus("error");
        setCallError(evt.message);
        if (durationRef.current) { clearInterval(durationRef.current); durationRef.current = null; }
      }
    });

    cartesiaCallRef.current = call;
    try {
      await call.start(publishInfo.agentId);
    } catch (err: any) {
      setCallStatus("error");
      setCallError(err?.message || "Failed to start call");
      cartesiaCallRef.current = null;
    }
  }, [callStatus, publishInfo]);

  const stopVoiceCall = useCallback(async () => {
    if (!cartesiaCallRef.current) return;
    setCallStatus("ending");
    cartesiaCallRef.current.stop();
    cartesiaCallRef.current = null;
    if (durationRef.current) { clearInterval(durationRef.current); durationRef.current = null; }
    setCallStatus("idle");
    setIsMuted(false);
  }, []);

  const toggleMute = useCallback(() => {
    if (!cartesiaCallRef.current) return;
    if (isMuted) { cartesiaCallRef.current.unmute(); setIsMuted(false); }
    else          { cartesiaCallRef.current.mute();   setIsMuted(true);  }
  }, [isMuted]);

  useEffect(() => () => {
    cartesiaCallRef.current?.stop();
    if (durationRef.current) clearInterval(durationRef.current);
  }, []);

  function fmtDuration(s: number) {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  }

  const isLive       = callStatus === "live";
  const isConnecting = callStatus === "connecting" || callStatus === "requesting";
  const currentTier  = STRICTNESS_LABELS.find((t) => t.value === settings.strictness) ?? STRICTNESS_LABELS[2];
  const currentVoiceName = cartesiaVoices.find((v) => v.id === settings.speaker)?.name ?? (settings.speaker || "Not chosen yet");

  /* ─────────── RENDER ─────────── */
  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar active="agent" />
      <div className="flex-1 flex flex-col bg-raised">
        <div className="border-b border-line px-6 py-3.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-signal-tint flex items-center justify-center text-signal font-display font-bold text-sm">{settings.agentName.charAt(0)}</div>
            <span className="font-semibold text-[15px]">{settings.agentName} — DBMCI Voice Agent</span>
            <span className="text-ink-soft text-sm">/</span>
            <span className={`text-sm ${publishInfo?.agentId ? "text-signal font-semibold" : "text-ink-soft"}`}>
              {publishInfo?.agentId ? "Live on Cartesia" : "Draft"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => openTestModal("voice")}
              className="border border-line bg-white text-ink rounded-full px-3.5 py-2 text-[12.5px] font-semibold flex items-center gap-1.5 hover:bg-paper">
              🎙 Talk
            </button>
            <button onClick={() => openTestModal("chat")}
              className="border border-line bg-white text-ink rounded-full px-3.5 py-2 text-[12.5px] font-semibold flex items-center gap-1.5 hover:bg-paper">
              💬 Chat
            </button>
            <button onClick={() => openTestModal("phone")}
              className="bg-ink text-white rounded-full px-4 py-2 text-[12.5px] font-semibold flex items-center gap-1.5">
              📞 Test call
            </button>
          </div>
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

          <div className="flex-1 overflow-y-auto p-10">

            {tab === "overview" && (
              <div className="max-w-[720px] flex flex-col gap-6">
                <div className="border border-line rounded-2xl bg-white p-6 flex items-start gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-signal-tint flex items-center justify-center text-signal font-display font-bold text-2xl shrink-0">{settings.agentName.charAt(0)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[20px] font-display font-semibold">{settings.agentName}</div>
                    <div className="text-[13.5px] text-ink-soft mt-0.5">NEET PG / INICET / FMGE admissions counsellor · DBMCI</div>
                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      <span className={`text-[11.5px] font-semibold px-2.5 py-1 rounded-full border ${publishInfo?.agentId ? "bg-signal-tint border-signal/30 text-signal" : "bg-paper border-line text-ink-soft"}`}>
                        {publishInfo?.agentId ? "Live on Cartesia" : "Draft"}
                      </span>
                      <span className="text-[11.5px] font-semibold px-2.5 py-1 rounded-full bg-paper border border-line text-ink-soft">
                        {LANGUAGES.find((l) => l.code === settings.startingLanguage)?.label ?? "English"} first
                      </span>
                      <span className="text-[11.5px] font-semibold px-2.5 py-1 rounded-full bg-paper border border-line text-ink-soft">
                        {currentVoiceName}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="border border-line rounded-xl bg-white p-5 flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <div className="text-[14px] font-semibold">Publish to Cartesia</div>
                      <div className="text-[12.5px] text-ink-soft mt-0.5">
                        {publishInfo?.agentId
                          ? `Live — agent ${publishInfo.agentId}${publishInfo.hasWebhook ? " · webhook connected" : ""}`
                          : "Not published yet. This sends your greeting, call script, voice and language to Cartesia."}
                      </div>
                    </div>
                    <button onClick={handlePublish} disabled={publishStatus === "loading"}
                      className="bg-signal text-white rounded-lg px-4 py-2 text-[12.5px] font-semibold disabled:opacity-50 shrink-0">
                      {publishStatus === "loading" ? "Publishing…" : publishInfo?.agentId ? "Update" : "Publish"}
                    </button>
                  </div>
                  {publishStatus === "error" && publishError && (
                    <div className="text-[12.5px] text-miss bg-miss-tint border border-miss/20 rounded-lg px-3 py-2.5">
                      <div className="font-semibold mb-0.5">Publish failed</div>
                      <div className="font-mono text-[11px] break-all">{publishError}</div>
                    </div>
                  )}
                  {publishStatus === "done" && (
                    <div className="text-[12.5px] text-signal bg-signal-tint border border-signal/20 rounded-lg px-3 py-2.5">
                      Published. Voice: {publishInfo?.voiceId ?? "—"} · Model: {publishInfo?.modelId ?? "—"}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="border border-line rounded-xl p-4">
                    <div className="text-[12px] text-ink-soft">Call script</div>
                    <div className="text-[22px] font-display font-semibold mt-1">{settings.steps.length}</div>
                    <div className="text-[12px] text-ink-soft">steps</div>
                  </div>
                  <div className="border border-line rounded-xl p-4">
                    <div className="text-[12px] text-ink-soft">Facts loaded</div>
                    <div className="text-[22px] font-display font-semibold mt-1">{settings.facts.length}</div>
                    <div className="text-[12px] text-ink-soft">facts</div>
                  </div>
                  <div className="border border-line rounded-xl p-4">
                    <div className="text-[12px] text-ink-soft">Instant leads</div>
                    <div className="text-[22px] font-display font-semibold mt-1">{settings.variables.length}</div>
                    <div className="text-[12px] text-ink-soft">fields expected</div>
                  </div>
                </div>

                <div className="border border-line rounded-xl bg-paper p-5 flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <div className="text-[14px] font-semibold">Ready to hear how it sounds?</div>
                    <div className="text-[12.5px] text-ink-soft mt-0.5">Talk to it in the browser, or send a real test call to your phone.</div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => openTestModal("voice")} className="bg-signal text-white rounded-lg px-4 py-2 text-[12.5px] font-semibold">Talk now</button>
                    <button onClick={() => { window.location.href = "/outbound/new"; }} className="border border-line bg-white text-ink rounded-lg px-4 py-2 text-[12.5px] font-semibold">Launch campaign</button>
                  </div>
                </div>

                <a href="/overview" className="text-[12.5px] font-semibold text-signal self-start">See live call performance →</a>
              </div>
            )}

            {tab === "leads" && (
              <div className="max-w-[600px] flex flex-col gap-5">
                <div>
                  <div className="text-[15px] font-semibold">Instant leads</div>
                  <div className="text-[13px] text-ink-soft mt-1 leading-relaxed">
                    What you expect to arrive with each lead. Reference a field by name in your call script — e.g. "ask about their {"{exam}"}".
                    This is a planning list for your team; it isn't wired to your CRM or campaign CSV columns yet.
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  {settings.variables.map((v, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input value={v.key} onChange={(e) => updateVariable(i, "key", e.target.value)} placeholder="field_key"
                        className="w-[170px] border border-line rounded-lg px-2.5 py-1.5 text-[12.5px] font-mono bg-white outline-none focus:border-signal" />
                      <input value={v.label} onChange={(e) => updateVariable(i, "label", e.target.value)} placeholder="Label shown to your team"
                        className="flex-1 border border-line rounded-lg px-2.5 py-1.5 text-[12.5px] bg-white outline-none focus:border-signal" />
                      <button onClick={() => removeVariable(i)} className="text-miss text-xs font-semibold px-1">✕</button>
                    </div>
                  ))}
                  <button onClick={addVariable} className="text-[12.5px] font-semibold text-signal text-left mt-1">+ Add a field</button>
                </div>
                <div className="flex items-center gap-3 pt-2 border-t border-line">
                  <button onClick={handleSave} className="bg-ink text-white rounded-lg px-5 py-2.5 text-[13.5px] font-semibold mt-4">Save changes</button>
                  {saved && <span className="text-[13px] text-signal font-medium mt-4">Saved ✓</span>}
                </div>
              </div>
            )}

            {tab === "script" && (
              <div className="max-w-[720px] flex flex-col gap-8">
                <div>
                  <h2 className="text-[13px] font-semibold uppercase tracking-wide border-b border-line pb-2 mb-3">Opens with</h2>
                  <textarea value={settings.greeting} onChange={(e) => setSettings((s) => ({ ...s, greeting: e.target.value }))} rows={3} className="w-full text-[15px] leading-relaxed outline-none resize-none bg-transparent" />
                  <div className="text-[11.5px] text-ink-soft mt-1.5">Spoken word-for-word the moment the call connects.</div>
                </div>

                <div>
                  <h2 className="text-[13px] font-semibold uppercase tracking-wide border-b border-line pb-2 mb-3">Call script — {settings.steps.length} steps</h2>
                  <div className="flex flex-col gap-3">
                    {settings.steps.map((step: AgentStep, i: number) => (
                      <div key={step.id} className="border border-line rounded-xl bg-white p-4 flex gap-3">
                        <div className="flex flex-col items-center gap-1 pt-0.5 shrink-0">
                          <span className="w-6 h-6 rounded-full bg-signal text-white text-[12px] font-bold flex items-center justify-center">{i + 1}</span>
                          <button onClick={() => moveStep(step.id, -1)} disabled={i === 0} className="text-ink-soft text-[10px] leading-none disabled:opacity-20">▲</button>
                          <button onClick={() => moveStep(step.id, 1)} disabled={i === settings.steps.length - 1} className="text-ink-soft text-[10px] leading-none disabled:opacity-20">▼</button>
                        </div>
                        <div className="flex-1 min-w-0">
                          <input value={step.title} onChange={(e) => updateStep(step.id, "title", e.target.value)} placeholder="Step title"
                            className="w-full font-semibold text-[14px] outline-none bg-transparent mb-1.5" />
                          <textarea value={step.body} onChange={(e) => updateStep(step.id, "body", e.target.value)} rows={2} placeholder="What should the agent do in this step?"
                            className="w-full text-[13.5px] leading-relaxed outline-none resize-none bg-transparent" />
                        </div>
                        <button onClick={() => removeStep(step.id)} className="text-miss text-xs font-semibold px-1 h-fit">✕</button>
                      </div>
                    ))}
                    <button onClick={addStep} className="text-[13px] font-semibold text-signal text-left">+ Add a step</button>
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

                <div className="flex flex-col gap-4 border-t border-line pt-5">
                  <div className="flex items-center gap-3">
                    <button onClick={handleSave} className="bg-ink text-white rounded-lg px-5 py-2.5 text-[13.5px] font-semibold">Save changes</button>
                    {saved && <span className="text-[13px] text-signal font-medium">Saved ✓</span>}
                  </div>
                  <div className="bg-paper border border-line rounded-xl p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[13px] font-semibold">Save as version</div>
                        <div className="text-[12px] text-ink-soft mt-0.5">
                          Lock this script before launching a campaign.
                          {versions.length > 0 && <span className="ml-1 text-signal font-medium">Latest: {versions[0].label}</span>}
                        </div>
                      </div>
                      {versions.length > 0 && (
                        <button onClick={() => setShowVerPanel((v) => !v)}
                          className="text-[12px] text-ink-soft border border-line rounded-lg px-2.5 py-1 hover:bg-white">
                          {showVerPanel ? "Hide history" : `History (${versions.length})`}
                        </button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <input value={versionLabel} onChange={(e) => setVersionLabel(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleSaveVersion(); }}
                        placeholder={`e.g. "Medical college outbound" (optional)`}
                        className="flex-1 border border-line rounded-lg px-3 py-2 text-[13px] bg-white outline-none focus:border-signal" />
                      <button onClick={handleSaveVersion} disabled={savingVer}
                        className="bg-signal text-white rounded-lg px-4 py-2 text-[13px] font-semibold whitespace-nowrap disabled:opacity-50">
                        Save version
                      </button>
                    </div>
                    {savedVerMsg && <div className="text-[12.5px] text-signal font-medium">{savedVerMsg} ✓</div>}
                    {showVerPanel && versions.length > 0 && (
                      <div className="flex flex-col gap-2 mt-1">
                        <div className="text-[11.5px] text-ink-soft uppercase tracking-wide font-semibold">Version history</div>
                        {versions.map((v) => (
                          <div key={v.version} className="flex items-center gap-2 border border-line rounded-lg bg-white px-3 py-2.5">
                            <div className="flex-1 min-w-0">
                              <div className="text-[13px] font-semibold truncate">{v.label}</div>
                              <div className="text-[11.5px] text-ink-soft">
                                {new Date(v.savedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                                {" · "}{v.speaker} · {v.startingLanguage.split("-")[0].toUpperCase()}
                              </div>
                            </div>
                            <button onClick={() => handleRestoreVersion(v)}
                              className="text-[12px] font-semibold text-signal border border-signal/30 rounded-lg px-2.5 py-1 hover:bg-signal-tint shrink-0">Restore</button>
                            <button onClick={() => handleDeleteVersion(v.version)}
                              className="text-[12px] font-semibold text-miss border border-miss/20 rounded-lg px-2 py-1 hover:bg-miss-tint shrink-0">✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {tab === "training" && (
              <div className="max-w-[600px] flex flex-col gap-7">
                <div>
                  <div className="text-[15px] font-semibold mb-1">How closely should {settings.agentName} follow the script?</div>
                  <div className="text-[13px] text-ink-soft mb-4">This changes what's actually sent to the agent — not just a label.</div>
                  <input type="range" min={1} max={5} step={1} value={settings.strictness}
                    onChange={(e) => setStrictness(parseInt(e.target.value, 10))} className="w-full accent-signal" />
                  <div className="flex justify-between text-[11px] text-ink-soft mt-1">
                    <span>Flexible</span><span>Strict</span>
                  </div>
                  <div className="mt-3 border border-line rounded-lg bg-paper p-3.5">
                    <div className="text-[13px] font-semibold">{currentTier.label} · {settings.strictness}/5</div>
                    <div className="text-[12.5px] text-ink-soft mt-1 leading-relaxed">{currentTier.description}</div>
                  </div>
                </div>

                <div>
                  <div className="text-[13px] font-semibold mb-2">Add a house rule</div>
                  <div className="text-[12.5px] text-ink-soft mb-3">Adds a new step to the call script.</div>
                  <div className="flex flex-wrap gap-2">
                    {SUGGESTION_CHIPS.map((c) => (
                      <button key={c} onClick={() => addStepFromChip(c)} className="text-xs px-3 py-1.5 rounded-full border border-line bg-paper hover:bg-signal-tint hover:border-signal hover:text-signal text-ink-soft">+ {c}</button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2 border-t border-line">
                  <button onClick={handleSave} className="bg-ink text-white rounded-lg px-5 py-2.5 text-[13.5px] font-semibold mt-4">Save changes</button>
                  {saved && <span className="text-[13px] text-signal font-medium mt-4">Saved ✓</span>}
                </div>
              </div>
            )}

            {tab === "actions" && (
              <div className="max-w-[600px] text-center py-20">
                <div className="text-[15px] font-semibold mb-1.5">Actions</div>
                <div className="text-[13.5px] text-ink-soft">Let the agent book slots, transfer to a salesperson, or look up a record. Coming soon.</div>
              </div>
            )}

            {tab === "outcomes" && (
              <div className="max-w-[640px] flex flex-col gap-5">
                <div>
                  <div className="text-[15px] font-semibold">How calls get classified</div>
                  <div className="text-[13px] text-ink-soft mt-1 leading-relaxed">
                    RANA reads each call automatically after it ends and sorts it into one of these — this is the live logic behind
                    the Lead column on your Inbound/Outbound pages, not a preview.
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  {OUTCOMES.map((o) => (
                    <div key={o.key} className="border border-line rounded-lg p-3.5 flex items-start gap-3">
                      <span className={`text-[11px] font-semibold px-2 py-1 rounded-full shrink-0 ${o.tone}`}>{o.label}</span>
                      <div className="text-[12.5px] text-ink-soft leading-relaxed">{o.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === "voice" && (
              <div className="max-w-[600px] flex flex-col gap-6">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[13px] font-semibold block">Voice</label>
                    <button onClick={loadCartesiaCatalog} disabled={catalogLoading} className="text-[11.5px] font-semibold text-signal disabled:opacity-40">
                      {catalogLoading ? "Loading…" : "↻ Refresh"}
                    </button>
                  </div>
                  {catalogError && (
                    <div className="text-[12.5px] text-miss bg-miss-tint border border-miss/20 rounded-lg px-3 py-2 mb-2">{catalogError}</div>
                  )}
                  <select value={settings.speaker} onChange={(e) => setSettings((s) => ({ ...s, speaker: e.target.value }))}
                    className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-signal">
                    <option value="">{catalogLoading ? "Loading voices…" : "Choose a voice…"}</option>
                    {cartesiaVoices.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}{v.language ? ` — ${v.language}` : ""}{v.tagline ? ` (${v.tagline})` : ""}
                      </option>
                    ))}
                  </select>
                  <div className="text-[11px] text-ink-soft mt-1">Loaded live from your Cartesia account.</div>
                </div>

                <div>
                  <label className="text-[13px] font-semibold block mb-1.5">Model — the agent's brain</label>
                  <select value={selectedModelId} onChange={(e) => setSelectedModelId(e.target.value)}
                    className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-signal">
                    <option value="">Let Cartesia pick (defaults to a Claude model)</option>
                    {cartesiaModels.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}{m.provider ? ` — ${m.provider}` : ""}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className="text-[13px] font-semibold block mb-1.5">Pace <span className="font-normal text-ink-soft">{settings.speechRate.toFixed(1)}x</span></label>
                    <input type="range" min={0.6} max={1.5} step={0.1} value={settings.speechRate} onChange={(e) => setSettings((s) => ({ ...s, speechRate: parseFloat(e.target.value) }))} className="w-full accent-signal" />
                    <div className="text-[11px] text-ink-soft mt-1">Cartesia allows 0.6x–1.5x.</div>
                  </div>
                  <div>
                    <label className="text-[13px] font-semibold block mb-1.5">Pitch <span className="font-normal text-ink-soft">{settings.speechPitch.toFixed(1)}</span></label>
                    <input type="range" min={0.5} max={1.8} step={0.1} value={settings.speechPitch} onChange={(e) => setSettings((s) => ({ ...s, speechPitch: parseFloat(e.target.value) }))} className="w-full accent-signal" />
                    <div className="text-[11px] text-ink-soft mt-1">Preview only — Cartesia doesn't take a pitch knob.</div>
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
                  <div className="text-[11px] text-ink-soft mt-1">Preview only — not yet sent to Cartesia.</div>
                </div>
                <div className="flex items-center gap-3 pt-2 border-t border-line">
                  <button onClick={handleSave} className="bg-ink text-white rounded-lg px-5 py-2.5 text-[13.5px] font-semibold mt-4">Save changes</button>
                  {saved && <span className="text-[13px] text-signal font-medium mt-4">Saved ✓</span>}
                </div>
              </div>
            )}

            {tab === "settings" && (
              <div className="max-w-[600px] flex flex-col gap-6">
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
                  <div className="text-[11px] text-ink-soft mt-1">Preview only — not yet sent to Cartesia (Cartesia's pronunciation dictionaries are a separate, later step).</div>
                </div>
                <div className="flex items-center gap-3 pt-2 border-t border-line">
                  <button onClick={handleSave} className="bg-ink text-white rounded-lg px-5 py-2.5 text-[13.5px] font-semibold mt-4">Save changes</button>
                  {saved && <span className="text-[13px] text-signal font-medium mt-4">Saved ✓</span>}
                </div>
              </div>
            )}
          </div>

          <div className="w-[340px] border-l border-line flex flex-col shrink-0">
            <div className="px-4 py-3.5 border-b border-line flex items-center gap-1.5">
              <span className="text-signal">✨</span>
              <span className="text-[14px] font-semibold">Edit with AI</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
              {editLog.length === 0 && <div className="text-[12.5px] text-ink-soft leading-relaxed">Describe a change and I will rewrite the greeting, call script and facts.</div>}
              {editLog.map((e, i) => (
                <div key={i} className="flex flex-col gap-1.5">
                  <div className="bg-paper rounded-lg px-3 py-2 text-[12.5px] self-end max-w-[85%]">{e.request}</div>
                  <div className="flex items-center gap-1.5 text-[11px] text-ink-soft"><span className="text-signal">✓</span> {e.summary} · {e.time}</div>
                </div>
              ))}
              {editError   && <div className="text-[12.5px] text-miss bg-miss-tint rounded-lg px-3 py-2">{editError}</div>}
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

      {testModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-6" onClick={closeTestModal}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-[560px] max-h-[85vh] overflow-y-auto p-6 relative" onClick={(e) => e.stopPropagation()}>
            <button onClick={closeTestModal} className="absolute top-4 right-4 text-ink-soft hover:text-ink text-lg leading-none">×</button>

            <div className="flex gap-1 border border-line rounded-xl p-1 bg-paper w-fit mb-5">
              {(["voice", "phone", "chat"] as const).map((t) => (
                <button key={t} onClick={() => setTestTab(t)}
                  className={`px-4 py-1.5 rounded-lg text-[13px] font-semibold ${testTab === t ? "bg-white shadow-sm text-ink" : "text-ink-soft hover:text-ink"}`}>
                  {t === "voice" ? "🎙 Voice" : t === "phone" ? "📞 Phone" : "💬 Chat"}
                </button>
              ))}
            </div>

            {testTab === "voice" && (
              <div className="flex flex-col gap-4">
                {publishInfo?.agentId ? (
                  <div className="text-[11.5px] text-ink-soft bg-paper border border-line rounded-lg px-3 py-2">
                    This is your real, published Cartesia agent — same brain, same voice as a real call. First test may take a beat to connect.
                  </div>
                ) : (
                  <div className="text-[11.5px] text-miss bg-miss-tint border border-miss/20 rounded-lg px-3 py-2">
                    Not published yet — go to Overview and click Publish first, there's nothing live to call.
                  </div>
                )}

                {(isLive || isConnecting || callStatus === "ending") && (
                  <div className="border border-signal/30 rounded-2xl bg-white overflow-hidden">
                    <div className="bg-signal px-5 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {isLive && (
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                            <span className="text-white text-[12.5px] font-semibold">LIVE</span>
                          </span>
                        )}
                        {isConnecting && <span className="text-white text-[12.5px] font-semibold">Connecting…</span>}
                        {callStatus === "ending" && <span className="text-white text-[12.5px] font-semibold">Ending…</span>}
                      </div>
                      {isLive && (
                        <span className="text-white/80 text-[12px] font-mono">{fmtDuration(callDuration)}</span>
                      )}
                    </div>

                    <div className="px-5 py-4 flex flex-col gap-3">
                      {isConnecting && (
                        <div className="flex items-center justify-center py-8">
                          <div className="relative w-20 h-20">
                            <div className="absolute inset-0 rounded-full bg-signal/10 animate-ping" />
                            <div className="absolute inset-2 rounded-full bg-signal/20 animate-ping" style={{ animationDelay: "0.15s" }} />
                            <div className="absolute inset-4 rounded-full bg-signal flex items-center justify-center">
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="0">
                                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                                <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4" stroke="white" fill="none" strokeWidth="2" strokeLinecap="round"/>
                              </svg>
                            </div>
                          </div>
                        </div>
                      )}

                      {isLive && (
                        <div ref={transcriptRef} className="max-h-[220px] overflow-y-auto flex flex-col gap-2 pb-1">
                          {transcript.length === 0 && (
                            <div className="text-center text-[12.5px] text-ink-soft py-6 animate-pulse">
                              Speak — your agent is listening…
                            </div>
                          )}
                          {transcript.map((t, i) => (
                            <div key={i} className={`flex ${t.role === "agent" ? "justify-start" : "justify-end"}`}>
                              <div className={`max-w-[85%] rounded-xl px-3.5 py-2 text-[12.5px] leading-relaxed ${
                                t.role === "agent" ? "bg-signal-tint text-ink" : "bg-ink text-white"
                              }`}>
                                {t.role === "agent" && (
                                  <div className="text-[10px] text-signal font-semibold uppercase tracking-wide mb-0.5">Agent</div>
                                )}
                                {t.text}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {isLive && (
                        <div className="flex items-center gap-3 pt-2 border-t border-line">
                          <button onClick={toggleMute}
                            className={`flex items-center gap-1.5 text-[12px] font-semibold px-3 py-2 rounded-lg border ${isMuted ? "bg-miss-tint border-miss/30 text-miss" : "bg-paper border-line text-ink-soft hover:text-ink"}`}>
                            {isMuted ? (
                              <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23M12 19v4"/></svg> Muted</>
                            ) : (
                              <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4"/></svg> Mute</>
                            )}
                          </button>
                          <button onClick={stopVoiceCall}
                            className="flex-1 bg-miss text-white rounded-lg py-2 text-[12.5px] font-semibold flex items-center justify-center gap-2">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                            End call
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {(callStatus === "idle" || callStatus === "error") && (
                  <div className="border border-line rounded-xl bg-white p-5 flex flex-col gap-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-signal-tint flex items-center justify-center shrink-0">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-signal">
                          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4"/>
                        </svg>
                      </div>
                      <div>
                        <div className="text-[14px] font-semibold">Test your agent — right here</div>
                        <div className="text-[12.5px] text-ink-soft mt-0.5">Speak directly with your DBMCI voice agent, running live on Cartesia, in this browser.</div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 bg-paper rounded-lg p-3.5">
                      {[
                        'Click "Start call" and allow microphone access when prompted',
                        "Speak naturally — your DBMCI agent responds instantly in voice",
                        "Live transcript appears during the call",
                      ].map((step, i) => (
                        <div key={i} className="flex items-start gap-2.5">
                          <span className="w-5 h-5 rounded-full bg-signal text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                          <span className="text-[12.5px] text-ink leading-relaxed">{step}</span>
                        </div>
                      ))}
                    </div>

                    {callStatus === "error" && callError && (
                      <div className="text-[12.5px] text-miss bg-miss-tint border border-miss/20 rounded-lg px-3 py-2.5">
                        <div className="font-semibold mb-0.5">Could not connect</div>
                        <div className="font-mono text-[11px] break-all">{callError}</div>
                      </div>
                    )}

                    <button onClick={startVoiceCall} disabled={!publishInfo?.agentId}
                      className="bg-signal text-white rounded-lg px-5 py-3 text-[13.5px] font-semibold flex items-center gap-2 w-fit disabled:opacity-40">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4"/>
                      </svg>
                      {!publishInfo?.agentId ? "Publish first" : callStatus === "error" ? "Try again" : "Start call"}
                    </button>

                    <div className="text-[11.5px] text-ink-soft border-t border-line pt-3">
                      After testing, edit the script with AI or launch an outbound campaign.
                    </div>
                  </div>
                )}
              </div>
            )}

            {testTab === "phone" && (
              <div className="flex flex-col gap-4">
                <p className="text-[13px] text-ink-soft">Enter a number — Sarvam calls it using your DBMCI agent at full quality.</p>
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
                          <><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.13 12 19.79 19.79 0 0 1 1.06 3.38 2 2 0 0 1 3.05 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21 16z"/>
                          </svg>Call this number</>
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
                        className="text-[12.5px] font-semibold text-ink-soft border border-line rounded-lg px-4 py-1.5 mt-1">Make another call</button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {testTab === "chat" && (
              <div className="flex flex-col gap-4">
                <p className="text-[13px] text-ink-soft">Text-only test — same agent instructions, no audio.</p>
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
        </div>
      )}
    </div>
  );
}
