// @ts-nocheck
"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import VoicePickerModal, { PickerVoice } from "@/components/VoicePickerModal";
import ModelPickerModal, { PickerModel } from "@/components/ModelPickerModal";
import BackgroundSoundPicker, { PickerBackgroundSound } from "@/components/BackgroundSoundPicker";
import ScriptStudio from "@/components/studio/ScriptStudio";
import AskAiBar from "@/components/studio/AskAiBar";
import { LANGUAGES, STRICTNESS_LABELS, stepsToInstructions } from "@/lib/storage";
import { baseLang, LANG_NAMES, playbookFromSteps, playbookToSteps, detectScriptLanguage } from "@/lib/playbook";

const STEPS = [
  { key: "basics", label: "Name & languages" },
  { key: "voice", label: "Voice, pace & brain" },
  { key: "script", label: "Script Studio" },
  { key: "review", label: "Review & publish" },
] as const;

// Languages a caller can switch into mid-call (the employee follows them).
const SWITCH_LANGS = ["en", "te", "hi", "ta", "kn", "ml", "mr", "bn", "gu", "pa"];

function WizardInner() {
  const params = useSearchParams();
  const router = useRouter();
  // Read once: saving a new agent puts ?id= in the URL, which must not trigger a reload of the form.
  const [editId] = useState(() => params.get("id"));
  const isEditing = !!editId;

  const [stepIdx, setStepIdx] = useState(0);
  const [loadingExisting, setLoadingExisting] = useState(isEditing);
  const [loadError, setLoadError] = useState("");

  // ── form state ──
  const [name, setName] = useState("");
  const [startingLanguage, setStartingLanguage] = useState("en-IN");
  const [policy, setPolicy] = useState<{ mode: "match_caller" | "fixed"; allowed: string[] }>({ mode: "match_caller", allowed: ["en", "te", "hi"] });
  // Voice engine: always Sarvam for customers (the Cartesia code path stays only for old drafts).
  const [engine, setEngine] = useState<"sarvam" | "cartesia">("sarvam");
  const [sarvamStatus, setSarvamStatus] = useState<any>(null);
  const [previewing, setPreviewing] = useState<string | false>(false);
  const [voiceId, setVoiceId] = useState("");
  const [voiceName, setVoiceName] = useState("");
  const [modelId, setModelId] = useState("");
  const [speechRate, setSpeechRate] = useState(1);
  const [backgroundSoundId, setBackgroundSoundId] = useState<string | null>(null);
  const [backgroundVolume, setBackgroundVolume] = useState(1);
  const [noiseSuppression, setNoiseSuppression] = useState<"off" | "auto" | "max">("auto");
  const [strictness, setStrictness] = useState(3);
  // Script Studio
  const [studio, setStudio] = useState<any>({ sourceScript: "", playbook: null, greeting: "", links: [], pronunciations: [], keyterms: [] });
  const setStudioPart = (patch: any) => setStudio((s: any) => ({ ...s, ...patch }));

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
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [publishDone, setPublishDone] = useState(false);

  useEffect(() => {
    fetch("/api/sarvam/status").then((r) => r.json()).then(setSarvamStatus).catch(() => {});
  }, []);

  async function previewSarvam(voice?: string) {
    const key = voice || (voiceName || "priya").toLowerCase();
    setPreviewing(key);
    try {
      const res = await fetch(`/api/voices/preview?${new URLSearchParams({ engine: "sarvam", lang: startingLanguage, voice: key })}`);
      if (!res.ok) throw new Error();
      const url = URL.createObjectURL(await res.blob());
      const a = new Audio(url); a.onended = () => { URL.revokeObjectURL(url); setPreviewing(false); };
      await a.play();
    } catch { setPreviewing(false); }
  }

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
        setEngine("sarvam"); // Sarvam is the only engine offered
        if (s.language_policy) setPolicy({ mode: s.language_policy.mode === "fixed" ? "fixed" : "match_caller", allowed: s.language_policy.allowed?.length ? s.language_policy.allowed : [baseLang(s.starting_language)] });
        setVoiceId(s.speaker || "");
        setVoiceName(s.voice_name || "");
        setModelId(s.model_id || "");
        setSpeechRate(typeof s.speech_rate === "number" ? s.speech_rate : 1);
        setBackgroundSoundId(s.background_sound_id || null);
        setBackgroundVolume(typeof s.background_volume === "number" ? s.background_volume : 1);
        setNoiseSuppression((s.noise_suppression as "off" | "auto" | "max") || "auto");
        setStrictness(typeof s.strictness === "number" ? s.strictness : 3);
        setCartesiaAgentId(s.cartesia_agent_id || null);
        // Older employees only have numbered steps + facts: show them as a playbook so nothing is lost.
        const hasSteps = (s.steps || []).some((x: any) => x.title?.trim() || x.body?.trim());
        const playbook = s.playbook || (hasSteps || (s.facts || []).length ? playbookFromSteps(s.steps || [], s.facts || []) : null);
        setStudio({
          sourceScript: s.source_script || "",
          playbook,
          greeting: s.greeting || "",
          links: s.links || [],
          pronunciations: s.pronunciations || [],
          keyterms: s.keyterms || [],
        });
      } catch (err: any) {
        setLoadError(err?.message || "Something went wrong.");
      } finally { setLoadingExisting(false); }
    })();
  }, [editId]);

  // The opening language is always one of the languages it may speak.
  const openBase = baseLang(startingLanguage);
  useEffect(() => {
    setPolicy((p) => ({ ...p, allowed: [openBase, ...p.allowed.filter((l) => l !== openBase)] }));
  }, [openBase]);
  function toggleAllowed(l: string) {
    if (l === openBase) return;
    setPolicy((p) => ({ ...p, allowed: p.allowed.includes(l) ? p.allowed.filter((x) => x !== l) : [...p.allowed, l] }));
  }

  const selectedVoice = voices.find((v) => v.id === voiceId);
  const selectedModel = models.find((m) => m.id === modelId);
  const selectedSound = backgroundSounds.find((s) => s.id === backgroundSoundId) || null;
  const pb = studio.playbook;
  const planReady = !!pb && !!(pb.opening?.trim() || pb.discovery?.some((x: string) => x.trim()) || pb.pitch?.some((x: string) => x.trim()) || pb.closing?.trim());

  function canAdvance() {
    if (stepIdx === 0) return name.trim().length > 0;
    if (stepIdx === 1) return true; // voice/model auto-resolve server-side if left blank
    if (stepIdx === 2) return studio.greeting.trim().length > 0 && planReady;
    return true;
  }

  function cleanPlaybook(p: any) {
    if (!p) return null;
    const t = (a: any[]) => (a || []).map((x: string) => x.trim()).filter(Boolean);
    const pairs = (a: any[], k1: string, k2: string) => (a || []).filter((x: any) => x[k1]?.trim() && x[k2]?.trim());
    return { ...p, discovery: t(p.discovery), pitch: t(p.pitch), facts: t(p.facts), doNot: t(p.doNot), objections: pairs(p.objections, "objection", "response"), faqs: pairs(p.faqs, "question", "answer") };
  }

  async function persist(): Promise<string | null> {
    if (!name.trim()) { setSaveError("Give the employee a name first."); return null; }
    setSaving(true); setSaveError("");
    try {
      const playbook = cleanPlaybook(studio.playbook);
      const steps = playbook ? playbookToSteps(playbook) : [];
      const payload: any = {
        name: name.trim(),
        greeting: studio.greeting,
        steps,
        instructions: stepsToInstructions(steps, strictness),
        facts: playbook?.facts || [],
        variables: [],
        strictness,
        speaker: voiceId || "",
        voice_name: engine === "sarvam" ? (voiceName || "Priya") : (selectedVoice?.name || voiceName || null),
        speech_rate: speechRate,
        starting_language: startingLanguage,
        model_id: modelId || null,
        background_sound_id: backgroundSoundId,
        background_volume: backgroundVolume,
        noise_suppression: noiseSuppression,
        playbook,
        source_script: studio.sourceScript,
        links: (studio.links || []).filter((l: any) => l.url?.trim()),
        pronunciations: (studio.pronunciations || []).filter((p: any) => p.word?.trim() && p.sayAs?.trim()),
        keyterms: studio.keyterms || [],
        language_policy: policy,
        engine,
      };
      const res = savedId
        ? await fetch(`/api/scripts/${savedId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/scripts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, fromTemplate: false }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save.");
      const id = data.script.id;
      setSavedId(id);
      setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      if (!editId && typeof window !== "undefined") window.history.replaceState(null, "", `/agents/new?id=${id}`);
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

  const openName = LANG_NAMES[openBase] || "English";
  const allowedNames = policy.allowed.map((l) => LANG_NAMES[l]).filter(Boolean);
  const Label = ({ children }: any) => <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{children}</div>;

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar active="create-agent" />
      <div className="flex-1 flex flex-col">
        <div className="border-b border-line px-8 py-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-[18px] font-display font-semibold">{isEditing ? `Edit ${name || "agent"}` : "Create your own agent"}</div>
            <div className="text-[12.5px] text-ink-soft mt-0.5">
              Paste your script — AI turns it into a call plan with objections, FAQs and closing. Add documents and links, fix pronunciation, then publish and talk to it.
            </div>
          </div>
          {stepIdx >= 2 && (
            <div className="flex items-center gap-3 shrink-0">
              {savedAt && <span className="text-[11.5px] text-ink-soft">Saved {savedAt}</span>}
              <button type="button" onClick={persist} disabled={saving || !name.trim()} className="border border-line bg-raised rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold disabled:opacity-50">
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          )}
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
                    i === stepIdx ? "bg-signal text-on-accent" : i < stepIdx ? "bg-ink text-on-accent" : "bg-paper border border-line text-ink-soft"
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
            <div className={stepIdx >= 2 ? "max-w-[860px]" : "max-w-[640px]"}>

              {stepIdx === 0 && (
                <div className="flex flex-col gap-6">
                  <div>
                    <label className="text-[13px] font-semibold block mb-1.5">What's this agent called?</label>
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`e.g. "Telugu NEET PG Outbound"`} data-testid="agent-name"
                      className="w-full border border-line rounded-lg px-3 py-2.5 text-[14px] bg-raised outline-none focus:border-signal" />
                    <div className="text-[11.5px] text-ink-soft mt-1">This is the name your team sees — not what the caller hears.</div>
                  </div>
                  <div>
                    <label className="text-[13px] font-semibold block mb-1.5">Which language does it open in?</label>
                    <select value={startingLanguage} onChange={(e) => setStartingLanguage(e.target.value)} data-testid="opening-language"
                      className="border border-line rounded-lg px-3 py-2.5 text-[14px] bg-raised outline-none focus:border-signal">
                      {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                    </select>
                    <div className="text-[11.5px] text-ink-soft mt-1.5">The greeting is spoken in this language — here and when you talk to it on the Talk page.</div>
                  </div>
                  <div>
                    <label className="text-[13px] font-semibold block mb-2">If the caller switches language</label>
                    <div className="flex flex-col gap-2" data-testid="language-policy">
                      {[
                        ["match_caller", "Reply in the caller's language", `Opens in ${openName}. If the caller talks in another language below, the employee switches with them — and back again.`],
                        ["fixed", `Always speak ${openName}`, `Stays in ${openName} even if the caller uses another language.`],
                      ].map(([k, t, d]) => (
                        <label key={k} className={`flex items-start gap-3 border rounded-xl px-3.5 py-3 cursor-pointer ${policy.mode === k ? "border-signal bg-signal-tint/50" : "border-line bg-raised"}`}>
                          <input type="radio" name="policy" checked={policy.mode === k} onChange={() => setPolicy((p) => ({ ...p, mode: k as any }))} className="mt-1 accent-signal" />
                          <span>
                            <span className="text-[13.5px] font-semibold block">{t}{k === "match_caller" && <span className="ml-2 text-[10.5px] font-semibold text-signal bg-raised border border-signal/30 rounded-full px-1.5 py-0.5">Recommended</span>}</span>
                            <span className="text-[12px] text-ink-soft">{d}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                    {policy.mode === "match_caller" && (
                      <div className="mt-3">
                        <div className="text-[12px] text-ink-soft mb-1.5">Languages it can switch to</div>
                        <div className="flex flex-wrap gap-1.5">
                          {SWITCH_LANGS.map((l) => {
                            const on = policy.allowed.includes(l);
                            return (
                              <button key={l} type="button" onClick={() => toggleAllowed(l)} disabled={l === openBase} data-testid={`allow-${l}`}
                                className={`text-[12.5px] font-semibold px-3 py-1 rounded-full border ${on ? "bg-ink text-paper border-ink" : "bg-raised text-ink-soft border-line"} ${l === openBase ? "opacity-80 cursor-default" : ""}`}>
                                {on ? "✓ " : ""}{LANG_NAMES[l]}{l === openBase ? " · opens" : ""}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {stepIdx === 1 && (
                <div className="flex flex-col gap-6">
                  <div>
                    <label className="text-[13px] font-semibold block mb-1">Voice</label>
                    <div className="text-[12px] text-ink-soft mb-3">Pick who your callers hear. Every voice speaks Telugu, Hindi, Tamil and 8 more Indian languages, and switches when the caller does.</div>
                    {sarvamStatus && !sarvamStatus.sarvam?.ready && (
                      <div className="text-[12px] text-miss mb-3">Calling isn't set up yet — RANA support has been notified.</div>
                    )}
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3" data-testid="voice-picker">
                      {(sarvamStatus?.sarvam?.voices || DEFAULT_VOICES).map((v: any) => {
                        const on = (voiceName || "Priya").toLowerCase() === String(v.name).toLowerCase();
                        return (
                          <div key={v.key} role="button" tabIndex={0} onClick={() => setVoiceName(v.name)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setVoiceName(v.name); }} data-testid={`voice-${v.key}`}
                            className={`text-left border rounded-xl px-3.5 py-3 cursor-pointer ${on ? "border-signal bg-signal-tint/50 ring-1 ring-signal" : "border-line bg-raised hover:border-signal/50"}`}>
                            <div className="flex items-center gap-2.5">
                              <div className={`w-9 h-9 rounded-full font-display font-bold flex items-center justify-center shrink-0 ${v.gender === "masculine" ? "bg-violet-tint text-violet" : "bg-signal-tint text-signal"}`}>{String(v.name).charAt(0)}</div>
                              <div className="min-w-0 flex-1">
                                <div className="text-[14px] font-semibold flex items-center gap-1.5">{v.name}{on && <span className="text-[10.5px] text-signal">✓ selected</span>}</div>
                                <div className="text-[11.5px] text-ink-soft leading-snug">{v.gender === "masculine" ? "Male" : "Female"} · {v.tone}</div>
                              </div>
                            </div>
                            <button type="button" onClick={(e) => { e.stopPropagation(); previewSarvam(v.key); }} disabled={!!previewing}
                              className="mt-2.5 w-full border border-line rounded-lg px-2.5 py-1.5 text-[12px] font-semibold bg-raised disabled:opacity-50">
                              {previewing === v.key ? "Playing…" : `▶ Hear in ${LANGUAGES.find((l) => l.code === startingLanguage)?.label || "English"}`}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {engine === "cartesia" && <>
                  {catalogError && <div className="text-[12.5px] text-miss bg-miss-tint border border-miss/20 rounded-lg px-3 py-2">{catalogError}</div>}
                  <div>
                    <label className="text-[13px] font-semibold block mb-1.5">Voice</label>
                    <button type="button" onClick={() => setVoiceModalOpen(true)} disabled={catalogLoading}
                      className="w-full border border-line rounded-lg px-3 py-2.5 text-[14px] bg-raised outline-none focus:border-signal flex items-center justify-between disabled:opacity-60">
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
                        language={startingLanguage}
                        speed={speechRate}
                        onSelect={(v) => { setVoiceId(v.id); setVoices((prev) => (prev.some((x) => x.id === v.id) ? prev : [v, ...prev])); setVoiceModalOpen(false); }}
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
                      className="w-full border border-line rounded-lg px-3 py-2.5 text-[14px] bg-raised outline-none focus:border-signal flex items-center justify-between disabled:opacity-60">
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
                      className="w-full border border-line rounded-lg px-3 py-2.5 text-[14px] bg-raised outline-none focus:border-signal flex items-center justify-between">
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
                          className={`text-[12.5px] font-semibold px-3.5 py-1.5 rounded-full border capitalize ${noiseSuppression === n ? "bg-ink text-paper border-ink" : "bg-raised text-ink-soft border-line"}`}>
                          {n}
                        </button>
                      ))}
                    </div>
                    <div className="text-[11.5px] text-ink-soft mt-1.5">How aggressively background noise on the caller's mic is filtered before it reaches the agent.</div>
                  </div>
                  </>}
                </div>
              )}

              {stepIdx === 2 && (
                <ScriptStudio
                  value={studio} set={setStudioPart}
                  agentName={name} openingLanguage={startingLanguage} policy={policy}
                  voiceId={voiceId} voiceName={engine === "sarvam" ? (voiceName || "Priya") : (selectedVoice?.name || voiceName)} speed={speechRate} engine={engine}
                  scriptId={savedId} ensureSaved={persist}
                  strictness={strictness} setStrictness={setStrictness} strictnessLabels={STRICTNESS_LABELS}
                />
              )}

              {stepIdx === 3 && (
                <div className="flex flex-col gap-5">
                  <div className="text-[12.5px] text-ink-soft">Read it through. Anything to change? Ask the AI in plain words — or go back to the Studio and edit a card.</div>
                  {pb && <AskAiBar playbook={pb} greeting={studio.greeting} links={studio.links} openingLanguage={startingLanguage} onApply={(x: any) => setStudioPart(x)} compact />}

                  <div className="border border-line rounded-xl bg-raised p-5 flex flex-col gap-4" data-testid="review">
                    <div className="grid grid-cols-3 gap-4">
                      <div><Label>Name</Label><div className="text-[15px] font-semibold mt-0.5">{name || "(untitled)"}</div></div>
                      <div><Label>Opens in</Label><div className="text-[13.5px] mt-0.5">{openName}</div></div>
                      <div>
                        <Label>Caller switches language</Label>
                        <div className="text-[13.5px] mt-0.5">{policy.mode === "fixed" ? `Stays in ${openName}` : `Follows the caller · ${allowedNames.join(", ")}`}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div><Label>Voice</Label><div className="text-[13.5px] mt-0.5">{engine === "sarvam" ? `${voiceName || "Priya"} · Indian voice` : `${selectedVoice?.name || voiceName || "Auto"} · ${speechRate.toFixed(1)}x`}</div></div>
                      <div><Label>Calls from</Label><div className="text-[13.5px] mt-0.5">{sarvamStatus?.sarvam?.ownNumber ? `Your number ${sarvamStatus.sarvam.number}` : `RANA's shared Indian number${sarvamStatus?.sarvam?.number ? ` ${sarvamStatus.sarvam.number}` : ""}`}</div></div>
                      <div><Label>Sticks to script</Label><div className="text-[13.5px] mt-0.5">{STRICTNESS_LABELS.find((t) => t.value === strictness)?.label}</div></div>
                    </div>
                    <div>
                      <Label>Greeting</Label>
                      <div className="text-[13.5px] mt-0.5 leading-relaxed">{studio.greeting || <span className="text-miss">No greeting yet</span>}</div>
                      {studio.greeting && detectScriptLanguage(studio.greeting) && detectScriptLanguage(studio.greeting) !== openBase && (
                        <div className="text-[12px] text-warm mt-1">⚠ The greeting isn't in {openName}. Fix it in the Studio (there's a Translate button).</div>
                      )}
                    </div>
                    {pb && (
                      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        {pb.opening && <div className="col-span-2"><Label>Opening</Label><div className="text-[13px] mt-0.5">{pb.opening}</div></div>}
                        {pb.discovery?.filter(Boolean).length > 0 && <div><Label>Asks</Label><ol className="text-[13px] mt-1 list-decimal ml-4 flex flex-col gap-0.5">{pb.discovery.filter(Boolean).map((q: string, i: number) => <li key={i}>{q}</li>)}</ol></div>}
                        {pb.pitch?.filter(Boolean).length > 0 && <div><Label>Pitch</Label><ul className="text-[13px] mt-1 flex flex-col gap-0.5">{pb.pitch.filter(Boolean).map((q: string, i: number) => <li key={i}>• {q}</li>)}</ul></div>}
                        {pb.objections?.length > 0 && (
                          <div className="col-span-2">
                            <Label>Objections — {pb.objections.length}</Label>
                            <div className="flex flex-col gap-1 mt-1">{pb.objections.map((o: any, i: number) => <div key={i} className="text-[13px]"><span className="font-semibold">“{o.objection}”</span> <span className="text-ink-soft">→ {o.response}</span></div>)}</div>
                          </div>
                        )}
                        {pb.closing && <div className="col-span-2"><Label>Closing</Label><div className="text-[13px] mt-0.5">{pb.closing}</div></div>}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {[
                        [pb?.faqs?.length || 0, "FAQs"], [pb?.facts?.filter(Boolean).length || 0, "facts"], [studio.links.filter((l: any) => l.url).length, "links"],
                        [studio.pronunciations.length, "pronunciation fixes"], [studio.keyterms.length, "listen-for words"],
                      ].map(([n, l]) => (
                        <span key={l as string} className={`text-[12px] border rounded-full px-2.5 py-0.5 ${n ? "border-line bg-paper" : "border-dashed border-line text-ink-soft"}`}>{n} {l}</span>
                      ))}
                      <button type="button" onClick={() => setStepIdx(2)} className="text-[12px] font-semibold text-signal ml-1">Edit in Studio →</button>
                    </div>
                    {pb?.missing?.length > 0 && (
                      <div className="text-[12.5px] bg-hot-tint border border-hot/30 rounded-lg px-3 py-2">
                        <div className="font-semibold mb-0.5">Still missing ({pb.missing.length})</div>
                        {pb.missing.map((m: string, i: number) => <div key={i}>• {m}</div>)}
                      </div>
                    )}
                  </div>

                  {saveError && <div className="text-[12.5px] text-miss bg-miss-tint border border-miss/20 rounded-lg px-3 py-2.5">{saveError}</div>}
                  {publishError && <div className="text-[12.5px] text-miss bg-miss-tint border border-miss/20 rounded-lg px-3 py-2.5">{publishError}</div>}
                  {publishDone && cartesiaAgentId && (
                    <div className="text-[12.5px] text-signal bg-signal-tint border border-signal/20 rounded-lg px-3 py-2.5" data-testid="published">
                      Published — {name} is live with everything above.{" "}
                      {savedId && <a href={`/talk?scriptId=${savedId}`} className="font-semibold underline">Talk to it now →</a>}
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <button onClick={handleSaveDraft} disabled={saving || publishing}
                      className="border border-line bg-raised rounded-lg px-5 py-2.5 text-[13.5px] font-semibold disabled:opacity-50">
                      {saving && !publishing ? "Saving…" : "Save as draft"}
                    </button>
                    <button onClick={handlePublish} disabled={saving || publishing || !studio.greeting.trim() || !planReady} data-testid="publish"
                      className="bg-signal text-on-accent rounded-lg px-5 py-2.5 text-[13.5px] font-semibold disabled:opacity-50">
                      {publishing ? "Publishing…" : cartesiaAgentId ? "Save & republish" : "Save & publish"}
                    </button>
                  </div>
                  <div className="text-[11.5px] text-ink-soft">
                    Publishing makes it callable right now. Edits after publishing reach callers only when you publish again.
                  </div>
                </div>
              )}

              {stepIdx < 3 && (
                <div className="flex items-center gap-3 mt-10 pt-6 border-t border-line">
                  {stepIdx > 0 && (
                    <button onClick={() => setStepIdx((i) => i - 1)} className="border border-line bg-raised rounded-lg px-5 py-2.5 text-[13.5px] font-semibold">
                      Back
                    </button>
                  )}
                  <button onClick={() => setStepIdx((i) => i + 1)} disabled={!canAdvance()} data-testid="continue"
                    className="bg-ink text-paper rounded-lg px-5 py-2.5 text-[13.5px] font-semibold disabled:opacity-40">
                    Continue
                  </button>
                  {stepIdx === 2 && !canAdvance() && (
                    <span className="text-[12px] text-ink-soft">{!pb ? "Paste a script and build the call plan (or write it card by card)." : !studio.greeting.trim() ? "Add a greeting." : "Fill in at least the opening, a question, a pitch point or the closing."}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const DEFAULT_VOICES = [
  { key: "priya", name: "Priya", gender: "feminine", tone: "Warm and friendly" },
  { key: "kavya", name: "Kavya", gender: "feminine", tone: "Calm and caring" },
  { key: "shreya", name: "Shreya", gender: "feminine", tone: "Bright and confident" },
  { key: "aditya", name: "Aditya", gender: "masculine", tone: "Clear and professional" },
  { key: "rahul", name: "Rahul", gender: "masculine", tone: "Friendly and upbeat" },
  { key: "kabir", name: "Kabir", gender: "masculine", tone: "Deep and assured" },
];

export default function CreateAgentPage() {
  return (
    <Suspense fallback={null}>
      <WizardInner />
    </Suspense>
  );
}
