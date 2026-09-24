// @ts-nocheck
"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import VoicePickerModal, { PickerVoice } from "@/components/VoicePickerModal";
import ModelPickerModal, { PickerModel } from "@/components/ModelPickerModal";
import BackgroundSoundPicker, { PickerBackgroundSound } from "@/components/BackgroundSoundPicker";
import { LANGUAGES, STRICTNESS_LABELS, stepsToInstructions } from "@/lib/storage";

type Step = { id: string; title: string; body: string };
type Fact = string;

const STEPS = [
  { key: "basics", label: "Name & language" },
  { key: "voice", label: "Voice, pace & brain" },
  { key: "script", label: "Write the script" },
  { key: "review", label: "Review & save" },
] as const;

const BLANK_STEP = (): Step => ({ id: `s${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, title: "", body: "" });

function WizardInner() {
  const params = useSearchParams();
  const router = useRouter();
  const editId = params.get("id");
  const isEditing = !!editId;

  const [stepIdx, setStepIdx] = useState(0);
  const [loadingExisting, setLoadingExisting] = useState(isEditing);
  const [loadError, setLoadError] = useState("");

  // ── form state ──
  const [name, setName] = useState("");
  const [startingLanguage, setStartingLanguage] = useState("en-IN");
  const [voiceId, setVoiceId] = useState("");
  const [voiceName, setVoiceName] = useState("");
  const [modelId, setModelId] = useState("");
  const [speechRate, setSpeechRate] = useState(1);
  const [backgroundSoundId, setBackgroundSoundId] = useState<string | null>(null);
  const [backgroundVolume, setBackgroundVolume] = useState(1);
  const [noiseSuppression, setNoiseSuppression] = useState<"off" | "auto" | "max">("auto");
  const [greeting, setGreeting] = useState("");
  const [steps, setSteps] = useState<Step[]>([BLANK_STEP()]);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [strictness, setStrictness] = useState(3);

  // ── Cartesia catalog ──
  const [voices, setVoices] = useState<PickerVoice[]>([]);
  const [models, setModels] = useState<PickerModel[]>([]);
  const [backgroundSounds, setBackgroundSounds] = useState<PickerBackgroundSound[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);
  const [modelModalOpen, setModelModalOpen] = useState(false);
  const [soundModalOpen, setSoundModalOpen] = useState(false);

  // ── save/publish state ──
  const [savedId, setSavedId] = useState<string | null>(editId);
  const [cartesiaAgentId, setCartesiaAgentId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [publishDone, setPublishDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/cartesia-catalog");
        const data = await res.json();
        if (res.ok) { setVoices(data.voices || []); setModels(data.models || []); setBackgroundSounds(data.backgroundSounds || []); }
        else setCatalogError(data.error || "Failed to load voices/models.");
      } catch (err: any) {
        setCatalogError(err?.message || "Something went wrong.");
      } finally { setCatalogLoading(false); }
    })();
  }, []);

  useEffect(() => {
    if (!editId) return;
    (async () => {
      try {
        const res = await fetch(`/api/scripts/${editId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not load this agent.");
        const s = data.script;
        setName(s.name || "");
        setStartingLanguage(s.starting_language || "en-IN");
        setVoiceId(s.speaker || "");
        setVoiceName(s.voice_name || "");
        setModelId(s.model_id || "");
        setSpeechRate(typeof s.speech_rate === "number" ? s.speech_rate : 1);
        setBackgroundSoundId(s.background_sound_id || null);
        setBackgroundVolume(typeof s.background_volume === "number" ? s.background_volume : 1);
        setNoiseSuppression((s.noise_suppression as "off" | "auto" | "max") || "auto");
        setGreeting(s.greeting || "");
        setSteps(s.steps && s.steps.length > 0 ? s.steps : [BLANK_STEP()]);
        setFacts(s.facts || []);
        setStrictness(typeof s.strictness === "number" ? s.strictness : 3);
        setCartesiaAgentId(s.cartesia_agent_id || null);
      } catch (err: any) {
        setLoadError(err?.message || "Something went wrong.");
      } finally { setLoadingExisting(false); }
    })();
  }, [editId]);

  function addStep() { setSteps((s) => [...s, BLANK_STEP()]); }
  function updateStep(id: string, field: "title" | "body", value: string) {
    setSteps((s) => s.map((st) => (st.id === id ? { ...st, [field]: value } : st)));
  }
  function removeStep(id: string) { setSteps((s) => s.filter((st) => st.id !== id)); }
  function moveStep(id: string, dir: number) {
    setSteps((s) => {
      const idx = s.findIndex((st) => st.id === id);
      const swap = idx + dir;
      if (idx === -1 || swap < 0 || swap >= s.length) return s;
      const next = [...s];
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  }
  function addFact() { setFacts((f) => [...f, ""]); }
  function updateFact(i: number, v: string) { setFacts((f) => { const n = [...f]; n[i] = v; return n; }); }
  function removeFact(i: number) { setFacts((f) => f.filter((_, x) => x !== i)); }

  const selectedVoice = voices.find((v) => v.id === voiceId);
  const selectedModel = models.find((m) => m.id === modelId);
  const selectedSound = backgroundSounds.find((s) => s.id === backgroundSoundId) || null;
  const currentTier = STRICTNESS_LABELS.find((t) => t.value === strictness) ?? STRICTNESS_LABELS[2];

  function canAdvance() {
    if (stepIdx === 0) return name.trim().length > 0;
    if (stepIdx === 1) return true; // voice/model auto-resolve server-side if left blank
    if (stepIdx === 2) return greeting.trim().length > 0 && steps.some((s) => s.title.trim() || s.body.trim());
    return true;
  }

  async function persist(): Promise<string | null> {
    setSaving(true); setSaveError("");
    try {
      const cleanSteps = steps.filter((s) => s.title.trim() || s.body.trim());
      const payload: any = {
        name: name.trim(),
        greeting,
        steps: cleanSteps,
        instructions: stepsToInstructions(cleanSteps, strictness),
        facts: facts.filter((f) => f.trim()),
        variables: [],
        strictness,
        speaker: voiceId || "",
        voice_name: selectedVoice?.name || null,
        speech_rate: speechRate,
        starting_language: startingLanguage,
        model_id: modelId || null,
        background_sound_id: backgroundSoundId,
        background_volume: backgroundVolume,
        noise_suppression: noiseSuppression,
      };
      const res = savedId
        ? await fetch(`/api/scripts/${savedId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/scripts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, fromTemplate: false }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save.");
      const id = data.script.id;
      setSavedId(id);
      return id;
    } catch (err: any) {
      setSaveError(err?.message || "Something went wrong.");
      return null;
    } finally { setSaving(false); }
  }

  async function handleSaveDraft() {
    const id = await persist();
    if (id) router.push("/employees");
  }

  async function handlePublish() {
    setPublishError(""); setPublishDone(false);
    const id = await persist();
    if (!id) return;
    setPublishing(true);
    try {
      const res = await fetch(`/api/scripts/${id}/publish`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Publish failed.");
      setCartesiaAgentId(data.agentId);
      setPublishDone(true);
    } catch (err: any) {
      setPublishError(err?.message || "Something went wrong.");
    } finally { setPublishing(false); }
  }

  if (loadingExisting) {
    return (
      <div className="flex min-h-screen bg-paper">
        <Sidebar active="create-agent" />
        <div className="flex-1 flex items-center justify-center text-[13px] text-ink-soft">Loading…</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar active="create-agent" />
      <div className="flex-1 flex flex-col">
        <div className="border-b border-line px-8 py-4">
          <div className="text-[18px] font-display font-semibold">{isEditing ? `Edit ${name || "agent"}` : "Create your own agent"}</div>
          <div className="text-[12.5px] text-ink-soft mt-0.5">
            Write the script, pick a language and voice, then save it — it becomes a named agent you can talk to, publish, and later point a campaign at.
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="w-[220px] border-r border-line p-6 shrink-0">
            <div className="flex flex-col gap-1">
              {STEPS.map((s, i) => (
                <button key={s.key} onClick={() => setStepIdx(i)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left text-[13px] ${
                    i === stepIdx ? "bg-signal-tint text-signal font-semibold" : i < stepIdx ? "text-ink font-medium" : "text-ink-soft"
                  }`}>
                  <span className={`w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 ${
                    i === stepIdx ? "bg-signal text-white" : i < stepIdx ? "bg-ink text-white" : "bg-paper border border-line text-ink-soft"
                  }`}>
                    {i < stepIdx ? "✓" : i + 1}
                  </span>
                  {s.label}
                </button>
              ))}
            </div>
            {loadError && <div className="mt-4 text-[11.5px] text-miss">{loadError}</div>}
          </div>

          <div className="flex-1 overflow-y-auto p-10">
            <div className="max-w-[640px]">

              {stepIdx === 0 && (
                <div className="flex flex-col gap-6">
                  <div>
                    <label className="text-[13px] font-semibold block mb-1.5">What's this agent called?</label>
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`e.g. "Telugu NEET PG Outbound"`}
                      className="w-full border border-line rounded-lg px-3 py-2.5 text-[14px] bg-white outline-none focus:border-signal" />
                    <div className="text-[11.5px] text-ink-soft mt-1">This is the name your team sees — not what the caller hears.</div>
                  </div>
                  <div>
                    <label className="text-[13px] font-semibold block mb-1.5">Which language does it open in?</label>
                    <select value={startingLanguage} onChange={(e) => setStartingLanguage(e.target.value)}
                      className="border border-line rounded-lg px-3 py-2.5 text-[14px] bg-white outline-none focus:border-signal">
                      {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                    </select>
                    <div className="text-[11.5px] text-ink-soft mt-1.5">Cartesia agents run on one primary language at a time today — this is the one your voice and brain will speak.</div>
                  </div>
                </div>
              )}

              {stepIdx === 1 && (
                <div className="flex flex-col gap-6">
                  {catalogError && <div className="text-[12.5px] text-miss bg-miss-tint border border-miss/20 rounded-lg px-3 py-2">{catalogError}</div>}
                  <div>
                    <label className="text-[13px] font-semibold block mb-1.5">Voice</label>
                    <button type="button" onClick={() => setVoiceModalOpen(true)} disabled={catalogLoading}
                      className="w-full border border-line rounded-lg px-3 py-2.5 text-[14px] bg-white outline-none focus:border-signal flex items-center justify-between disabled:opacity-60">
                      <span className="truncate text-left">
                        {catalogLoading
                          ? "Loading voices…"
                          : selectedVoice
                          ? <>{selectedVoice.name}{selectedVoice.tagline ? <span className="text-ink-soft"> — {selectedVoice.tagline}</span> : null}</>
                          : "Let Cartesia pick a voice matching the language"}
                      </span>
                      <span className="text-[12.5px] font-semibold text-signal shrink-0 ml-3">{selectedVoice ? "Change" : "Browse"}</span>
                    </button>
                    {catalogError && <div className="text-[11.5px] text-miss mt-1">{catalogError}</div>}
                    {voiceModalOpen && (
                      <VoicePickerModal
                        voices={voices}
                        currentId={voiceId}
                        onSelect={(v) => { setVoiceId(v.id); setVoiceModalOpen(false); }}
                        onClose={() => setVoiceModalOpen(false)}
                      />
                    )}
                  </div>
                  <div>
                    <label className="text-[13px] font-semibold block mb-1.5">Pace <span className="font-normal text-ink-soft">{speechRate.toFixed(1)}x</span></label>
                    <input type="range" min={0.6} max={1.5} step={0.1} value={speechRate} onChange={(e) => setSpeechRate(parseFloat(e.target.value))} className="w-full accent-signal" />
                    <div className="flex justify-between text-[11px] text-ink-soft mt-1"><span>Slower</span><span>Faster</span></div>
                  </div>
                  <div>
                    <label className="text-[13px] font-semibold block mb-1.5">Brain — the model behind it</label>
                    <button type="button" onClick={() => setModelModalOpen(true)} disabled={catalogLoading}
                      className="w-full border border-line rounded-lg px-3 py-2.5 text-[14px] bg-white outline-none focus:border-signal flex items-center justify-between disabled:opacity-60">
                      <span className="truncate text-left">
                        {catalogLoading
                          ? "Loading models…"
                          : selectedModel
                          ? <>{selectedModel.name}{selectedModel.provider ? <span className="text-ink-soft"> — {selectedModel.provider}</span> : null}</>
                          : "Let Cartesia pick (defaults to a fast Claude model)"}
                      </span>
                      <span className="text-[12.5px] font-semibold text-signal shrink-0 ml-3">{selectedModel ? "Change" : "Browse"}</span>
                    </button>
                    <div className="text-[11.5px] text-ink-soft mt-1.5">This is what actually decides, in real time, what your agent says. Leave it on the default unless you have a reason to change it.</div>
                    {modelModalOpen && (
                      <ModelPickerModal
                        models={models}
                        currentId={modelId}
                        onSelect={(m) => { setModelId(m.id); setModelModalOpen(false); }}
                        onClose={() => setModelModalOpen(false)}
                      />
                    )}
                  </div>
                  <div>
                    <label className="text-[13px] font-semibold block mb-1.5">Background sound</label>
                    <button type="button" onClick={() => setSoundModalOpen(true)}
                      className="w-full border border-line rounded-lg px-3 py-2.5 text-[14px] bg-white outline-none focus:border-signal flex items-center justify-between">
                      <span className="truncate text-left">{selectedSound ? selectedSound.filename : "None"}</span>
                      <span className="text-[12.5px] font-semibold text-signal shrink-0 ml-3">{selectedSound ? "Change" : "Browse"}</span>
                    </button>
                    {selectedSound && (
                      <div className="mt-2">
                        <label className="text-[12px] text-ink-soft block mb-1">Volume <span className="font-semibold text-ink">{backgroundVolume.toFixed(1)}</span></label>
                        <input type="range" min={0} max={2} step={0.1} value={backgroundVolume} onChange={(e) => setBackgroundVolume(parseFloat(e.target.value))} className="w-full accent-signal" />
                      </div>
                    )}
                    {soundModalOpen && (
                      <BackgroundSoundPicker
                        sounds={backgroundSounds}
                        currentId={backgroundSoundId}
                        onSelect={(s) => { setBackgroundSoundId(s?.id ?? null); setSoundModalOpen(false); }}
                        onUploaded={(s) => { setBackgroundSounds((list) => [s, ...list]); setBackgroundSoundId(s.id); setSoundModalOpen(false); }}
                        onClose={() => setSoundModalOpen(false)}
                      />
                    )}
                  </div>
                  <div>
                    <label className="text-[13px] font-semibold block mb-1.5">Noise suppression</label>
                    <div className="flex gap-2">
                      {(["off", "auto", "max"] as const).map((n) => (
                        <button key={n} type="button" onClick={() => setNoiseSuppression(n)}
                          className={`text-[12.5px] font-semibold px-3.5 py-1.5 rounded-full border capitalize ${noiseSuppression === n ? "bg-ink text-white border-ink" : "bg-white text-ink-soft border-line"}`}>
                          {n}
                        </button>
                      ))}
                    </div>
                    <div className="text-[11.5px] text-ink-soft mt-1.5">How aggressively background noise on the caller's mic is filtered before it reaches the agent.</div>
                  </div>
                </div>
              )}

              {stepIdx === 2 && (
                <div className="flex flex-col gap-8">
                  <div>
                    <label className="text-[13px] font-semibold block mb-1.5">Opens the call with</label>
                    <textarea value={greeting} onChange={(e) => setGreeting(e.target.value)} rows={3}
                      placeholder="Spoken word-for-word the moment the call connects…"
                      className="w-full border border-line rounded-lg px-3 py-2.5 text-[14px] bg-white outline-none focus:border-signal resize-none" />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[13px] font-semibold">Your script</label>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-ink-soft">How closely should it stick to this?</span>
                        <select value={strictness} onChange={(e) => setStrictness(parseInt(e.target.value, 10))}
                          className="border border-line rounded-lg px-2 py-1 text-[11.5px] bg-white outline-none">
                          {STRICTNESS_LABELS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="text-[11.5px] text-ink-soft mb-3">{currentTier.description}</div>
                    <div className="flex flex-col gap-3">
                      {steps.map((step, i) => (
                        <div key={step.id} className="border border-line rounded-xl bg-white p-4 flex gap-3">
                          <div className="flex flex-col items-center gap-1 pt-0.5 shrink-0">
                            <span className="w-6 h-6 rounded-full bg-signal text-white text-[12px] font-bold flex items-center justify-center">{i + 1}</span>
                            <button onClick={() => moveStep(step.id, -1)} disabled={i === 0} className="text-ink-soft text-[10px] disabled:opacity-20">▲</button>
                            <button onClick={() => moveStep(step.id, 1)} disabled={i === steps.length - 1} className="text-ink-soft text-[10px] disabled:opacity-20">▼</button>
                          </div>
                          <div className="flex-1 min-w-0">
                            <input value={step.title} onChange={(e) => updateStep(step.id, "title", e.target.value)} placeholder={`Step title, e.g. "Qualify their need"`}
                              className="w-full font-semibold text-[14px] outline-none bg-transparent mb-1.5" />
                            <textarea value={step.body} onChange={(e) => updateStep(step.id, "body", e.target.value)} rows={2} placeholder="What should the agent do here?"
                              className="w-full text-[13.5px] leading-relaxed outline-none resize-none bg-transparent" />
                          </div>
                          <button onClick={() => removeStep(step.id)} className="text-miss text-xs font-semibold px-1 h-fit">✕</button>
                        </div>
                      ))}
                      <button onClick={addStep} className="text-[13px] font-semibold text-signal text-left">+ Add a step</button>
                    </div>
                  </div>

                  <div>
                    <label className="text-[13px] font-semibold block mb-2">Facts it should always know</label>
                    <div className="flex flex-col gap-2">
                      {facts.map((f, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="text-ink-soft mt-2.5">•</span>
                          <textarea value={f} onChange={(e) => updateFact(i, e.target.value)} rows={1}
                            className="flex-1 text-[14px] leading-relaxed outline-none resize-none bg-transparent py-1.5 border-b border-line focus:border-signal" />
                          <button onClick={() => removeFact(i)} className="text-miss text-xs font-semibold px-1 mt-2">✕</button>
                        </div>
                      ))}
                      <button onClick={addFact} className="text-[13px] font-semibold text-signal text-left mt-1 ml-4">+ Add a fact</button>
                    </div>
                  </div>
                </div>
              )}

              {stepIdx === 3 && (
                <div className="flex flex-col gap-6">
                  <div className="border border-line rounded-xl bg-white p-5 flex flex-col gap-4">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Name</div>
                      <div className="text-[15px] font-semibold mt-0.5">{name || "(untitled)"}</div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Language</div>
                        <div className="text-[13.5px] mt-0.5">{LANGUAGES.find((l) => l.code === startingLanguage)?.label}</div>
                      </div>
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Voice</div>
                        <div className="text-[13.5px] mt-0.5">{selectedVoice?.name || "Auto"}</div>
                      </div>
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Pace</div>
                        <div className="text-[13.5px] mt-0.5">{speechRate.toFixed(1)}x</div>
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Brain</div>
                      <div className="text-[13.5px] mt-0.5">{selectedModel?.name || "Auto (fast Claude model)"}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Background sound</div>
                        <div className="text-[13.5px] mt-0.5">{selectedSound ? `${selectedSound.filename} (${backgroundVolume.toFixed(1)}x)` : "None"}</div>
                      </div>
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Noise suppression</div>
                        <div className="text-[13.5px] mt-0.5 capitalize">{noiseSuppression}</div>
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Opens with</div>
                      <div className="text-[13.5px] mt-0.5 leading-relaxed">{greeting || "(no greeting set)"}</div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Script — {steps.filter((s) => s.title || s.body).length} steps</div>
                      <div className="flex flex-col gap-1.5 mt-1.5">
                        {steps.filter((s) => s.title || s.body).map((s, i) => (
                          <div key={s.id} className="text-[13px]"><span className="font-semibold">{i + 1}. {s.title}</span> — <span className="text-ink-soft">{s.body}</span></div>
                        ))}
                      </div>
                    </div>
                    {facts.filter((f) => f.trim()).length > 0 && (
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Facts</div>
                        <ul className="mt-1.5 flex flex-col gap-1">
                          {facts.filter((f) => f.trim()).map((f, i) => <li key={i} className="text-[13px] text-ink-soft">• {f}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>

                  {saveError && <div className="text-[12.5px] text-miss bg-miss-tint border border-miss/20 rounded-lg px-3 py-2.5">{saveError}</div>}
                  {publishError && <div className="text-[12.5px] text-miss bg-miss-tint border border-miss/20 rounded-lg px-3 py-2.5">{publishError}</div>}
                  {publishDone && cartesiaAgentId && (
                    <div className="text-[12.5px] text-signal bg-signal-tint border border-signal/20 rounded-lg px-3 py-2.5">
                      Published — live on Cartesia (agent {cartesiaAgentId}).{" "}
                      {savedId && <a href={`/talk?scriptId=${savedId}`} className="font-semibold underline">Talk to it now →</a>}
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <button onClick={handleSaveDraft} disabled={saving || publishing}
                      className="border border-line bg-white rounded-lg px-5 py-2.5 text-[13.5px] font-semibold disabled:opacity-50">
                      {saving ? "Saving…" : "Save as draft"}
                    </button>
                    <button onClick={handlePublish} disabled={saving || publishing}
                      className="bg-signal text-white rounded-lg px-5 py-2.5 text-[13.5px] font-semibold disabled:opacity-50">
                      {publishing ? "Publishing…" : "Save & publish to Cartesia"}
                    </button>
                  </div>
                  <div className="text-[11.5px] text-ink-soft">
                    Publishing makes it callable right now. Pointing a specific campaign at this agent is the next piece to build.
                  </div>
                </div>
              )}

              {stepIdx < 3 && (
                <div className="flex items-center gap-3 mt-10 pt-6 border-t border-line">
                  {stepIdx > 0 && (
                    <button onClick={() => setStepIdx((i) => i - 1)} className="border border-line bg-white rounded-lg px-5 py-2.5 text-[13.5px] font-semibold">
                      Back
                    </button>
                  )}
                  <button onClick={() => setStepIdx((i) => i + 1)} disabled={!canAdvance()}
                    className="bg-ink text-white rounded-lg px-5 py-2.5 text-[13.5px] font-semibold disabled:opacity-40">
                    Continue
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CreateAgentPage() {
  return (
    <Suspense fallback={null}>
      <WizardInner />
    </Suspense>
  );
}
