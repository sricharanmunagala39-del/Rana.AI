// @ts-nocheck
"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { INDUSTRY_LABELS, INDUSTRY_TEMPLATES } from "@/lib/industryTemplates";

type Script = {
  id: string; name: string; industry: string; greeting: string; instructions: string;
  facts: string[]; speaker: string; speech_rate: number; speech_pitch: number;
  starting_language: string; status: "draft" | "active";
  published_at: string | null; created_at: string; updated_at: string;
};
type Client = { id: string; name: string; industry: string; sarvam_app_id: string | null };

const SPEAKERS = [
  { id: "shubh",  label: "Shubh - confident & bold (M)" },
  { id: "anand",  label: "Anand - warm & reassuring (M)" },
  { id: "aditya", label: "Aditya - modern & crisp (M)" },
  { id: "ishita", label: "Ishita - polished & articulate (F)" },
  { id: "priya",  label: "Priya - cheerful & engaging (F)" },
  { id: "ritu",   label: "Ritu - expressive & lively (F)" },
];
const LANGUAGES = [
  { code: "en-IN", label: "English" }, { code: "hi-IN", label: "Hindi" },
  { code: "te-IN", label: "Telugu" }, { code: "ta-IN", label: "Tamil" },
  { code: "kn-IN", label: "Kannada" }, { code: "ml-IN", label: "Malayalam" },
  { code: "mr-IN", label: "Marathi" }, { code: "bn-IN", label: "Bengali" },
  { code: "gu-IN", label: "Gujarati" }, { code: "pa-IN", label: "Punjabi" },
];

export default function ScriptsPage() {
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [selected, setSelected] = useState<Script | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [publishMsg, setPublishMsg] = useState("");
  const [publishErr, setPublishErr] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newIndustry, setNewIndustry] = useState("edtech");
  const [creating, setCreating] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [saveTimer, setSaveTimer] = useState<any>(null);

  useEffect(() => {
    async function init() {
      try {
        const meRes = await fetch("/api/auth/me");
        if (!meRes.ok) { router.push("/login"); return; }
        const me = await meRes.json();
        setClient(me);
        const sRes = await fetch("/api/scripts");
        if (!sRes.ok) throw new Error("Failed to load scripts");
        const { scripts: list } = await sRes.json();
        setScripts(list);
        if (list.length > 0) setSelected(list.find((s: Script) => s.status === "active") ?? list[0]);
      } catch { router.push("/login"); }
      finally { setLoading(false); }
    }
    init();
  }, [router]);

  function fieldChange(patch: Partial<Script>) {
    if (!selected) return;
    const next = { ...selected, ...patch };
    setSelected(next);
    setScripts((ss) => ss.map((s) => s.id === next.id ? next : s));
    if (saveTimer) clearTimeout(saveTimer);
    setSaveTimer(setTimeout(() => autoSave(next), 800));
  }

  async function autoSave(script: Script) {
    setSaving(true);
    try {
      await fetch(`/api/scripts/${script.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: script.name, greeting: script.greeting, instructions: script.instructions, facts: script.facts, speaker: script.speaker, speech_rate: script.speech_rate, speech_pitch: script.speech_pitch, starting_language: script.starting_language }),
      });
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch {}
    finally { setSaving(false); }
  }

  async function handlePublish() {
    if (!selected) return;
    setPublishing(true); setPublishMsg(""); setPublishErr("");
    try {
      const res = await fetch("/api/scripts/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scriptId: selected.id }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setScripts((ss) => ss.map((s) => ({ ...s, status: s.id === selected.id ? "active" : "draft" })));
      setSelected((s) => s ? { ...s, status: "active" } : s);
      setPublishMsg(data.message || data.warning || "Published!");
    } catch (err: any) { setPublishErr(err.message); }
    finally { setPublishing(false); }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/scripts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newName.trim(), industry: newIndustry, fromTemplate: true }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setScripts((ss) => [data.script, ...ss]);
      setSelected(data.script);
      setShowNew(false); setNewName(""); setNewIndustry("edtech");
    } catch {}
    finally { setCreating(false); }
  }

  async function handleDelete(id: string) {
    try {
      await fetch(`/api/scripts/${id}`, { method: "DELETE" });
      const remaining = scripts.filter((s) => s.id !== id);
      setScripts(remaining);
      if (selected?.id === id) setSelected(remaining[0] ?? null);
    } catch {}
    finally { setDeleteConfirm(null); }
  }

  async function handleLogout() {
    await fetch("/api/auth/me", { method: "POST" });
    router.push("/login");
  }

  function addFact() { fieldChange({ facts: [...(selected?.facts ?? []), ""] }); }
  function updateFact(i: number, v: string) { const f = [...(selected?.facts ?? [])]; f[i] = v; fieldChange({ facts: f }); }
  function removeFact(i: number) { fieldChange({ facts: (selected?.facts ?? []).filter((_, x) => x !== i) }); }

  if (loading) return <div className="min-h-screen bg-paper flex items-center justify-center"><div className="text-[13px] text-ink-soft animate-pulse">Loading</div></div>;

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar active="scripts" />
      <div className="flex-1 flex overflow-hidden">

        {/* Script list sidebar */}
        <div className="w-[260px] border-r border-line bg-raised flex flex-col shrink-0">
          <div className="px-4 py-3.5 border-b border-line flex items-center justify-between">
            <div>
              <div className="text-[13.5px] font-semibold">{client?.name}</div>
              <div className="text-[11px] text-ink-soft">{INDUSTRY_LABELS[client?.industry as keyof typeof INDUSTRY_LABELS] ?? client?.industry}</div>
            </div>
            <button onClick={handleLogout} title="Sign out" className="text-ink-soft hover:text-miss p-1 rounded">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {scripts.length === 0 ? (
              <div className="text-center text-[12px] text-ink-soft py-8">No scripts yet.<br />Create your first one below.</div>
            ) : scripts.map((s) => (
              <button key={s.id} onClick={() => { setSelected(s); setPublishMsg(""); setPublishErr(""); }}
                className={`w-full text-left px-3 py-2.5 rounded-lg mb-0.5 group ${selected?.id === s.id ? "bg-signal-tint" : "hover:bg-paper"}`}>
                <div className="flex items-center justify-between gap-1">
                  <span className={`text-[13px] font-medium truncate ${selected?.id === s.id ? "text-signal" : "text-ink"}`}>{s.name}</span>
                  {s.status === "active" && <span className="shrink-0 text-[10px] font-bold text-on-accent bg-signal rounded-full px-1.5 py-0.5">LIVE</span>}
                </div>
                <div className="text-[11px] text-ink-soft mt-0.5">
                  {INDUSTRY_LABELS[s.industry as keyof typeof INDUSTRY_LABELS] ?? s.industry}{s.status === "draft" && " - draft"}
                </div>
              </button>
            ))}
          </div>

          <div className="p-3 border-t border-line">
            {!showNew ? (
              <button onClick={() => setShowNew(true)} className="w-full bg-ink text-paper rounded-lg py-2 text-[13px] font-semibold flex items-center justify-center gap-1.5">
                <span className="text-base leading-none">+</span> New script
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Script name" autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") { setShowNew(false); setNewName(""); } }}
                  className="w-full border border-line rounded-lg px-2.5 py-2 text-[13px] outline-none focus:border-signal bg-paper" />
                <select value={newIndustry} onChange={(e) => setNewIndustry(e.target.value)}
                  className="w-full border border-line rounded-lg px-2.5 py-2 text-[12.5px] bg-paper outline-none focus:border-signal">
                  {Object.entries(INDUSTRY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <div className="flex gap-1.5">
                  <button onClick={handleCreate} disabled={creating || !newName.trim()} className="flex-1 bg-signal text-on-accent rounded-lg py-1.5 text-[12.5px] font-semibold disabled:opacity-40">{creating ? "Creating" : "Create"}</button>
                  <button onClick={() => { setShowNew(false); setNewName(""); }} className="px-3 border border-line rounded-lg text-[12.5px] text-ink-soft hover:bg-paper">Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Script editor */}
        {selected ? (
          <div className="flex-1 overflow-y-auto">
            <div className="sticky top-0 bg-raised border-b border-line px-6 py-3 flex items-center justify-between z-10">
              <div className="flex items-center gap-3">
                <div>
                  <input value={selected.name} onChange={(e) => fieldChange({ name: e.target.value })} className="text-[15px] font-semibold bg-transparent outline-none border-b border-transparent focus:border-signal" />
                  <div className="text-[11.5px] text-ink-soft">
                    {selected.status === "active" ? <><span className="text-signal font-semibold">LIVE</span> - Running on your voice agent</> : "Draft - not live yet"}
                  </div>
                </div>
                {saving && <span className="text-[11.5px] text-ink-soft">Saving</span>}
                {saved && <span className="text-[11.5px] text-signal">Saved</span>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => router.push("/agent")} className="border border-line bg-paper text-ink rounded-lg px-3.5 py-2 text-[12.5px] font-semibold flex items-center gap-1.5 hover:bg-raised">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4"/></svg>
                  Test voice
                </button>
                {selected.status !== "active" && (
                  <button onClick={() => setDeleteConfirm(selected.id)} className="border border-miss/30 text-miss rounded-lg px-3 py-2 text-[12.5px] font-semibold hover:bg-miss-tint">Delete</button>
                )}
                <button onClick={handlePublish} disabled={publishing || selected.status === "active"}
                  className={`rounded-lg px-4 py-2 text-[13px] font-semibold flex items-center gap-1.5 ${selected.status === "active" ? "bg-signal-tint text-signal border border-signal/30" : "bg-signal text-on-accent hover:opacity-90"} disabled:opacity-50`}>
                  {publishing ? "Publishing" : selected.status === "active" ? "Live" : "Publish as live"}
                </button>
              </div>
            </div>

            {publishMsg && <div className="mx-6 mt-4 text-[12.5px] text-signal bg-signal-tint border border-signal/20 rounded-lg px-4 py-2.5">{publishMsg}</div>}
            {publishErr && <div className="mx-6 mt-4 text-[12.5px] text-miss bg-miss-tint border border-miss/20 rounded-lg px-4 py-2.5">{publishErr}</div>}

            <div className="max-w-[700px] mx-auto px-6 py-8 flex flex-col gap-8">
              <div>
                <label className="text-[12px] font-semibold uppercase tracking-wide text-ink-soft border-b border-line pb-2 mb-3 block">Greeting - first thing the agent says</label>
                <textarea value={selected.greeting} onChange={(e) => fieldChange({ greeting: e.target.value })} rows={3} className="w-full text-[15px] leading-relaxed outline-none resize-none bg-transparent" />
              </div>
              <div>
                <label className="text-[12px] font-semibold uppercase tracking-wide text-ink-soft border-b border-line pb-2 mb-3 block">Instructions - how the agent should behave</label>
                <textarea value={selected.instructions} onChange={(e) => fieldChange({ instructions: e.target.value })} rows={8} className="w-full text-[15px] leading-relaxed outline-none resize-none bg-transparent" />
              </div>
              <div>
                <label className="text-[12px] font-semibold uppercase tracking-wide text-ink-soft border-b border-line pb-2 mb-3 block">Facts - what the agent knows</label>
                <div className="flex flex-col gap-2">
                  {(selected.facts ?? []).map((f, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-ink-soft mt-2.5 text-sm">-</span>
                      <textarea value={f} onChange={(e) => updateFact(i, e.target.value)} rows={1} className="flex-1 text-[14.5px] leading-relaxed outline-none resize-none bg-transparent py-1.5" />
                      <button onClick={() => removeFact(i)} className="text-miss text-xs font-semibold px-1 mt-2">x</button>
                    </div>
                  ))}
                  <button onClick={addFact} className="text-[13px] font-semibold text-signal text-left mt-1 ml-4">+ Add a fact</button>
                </div>
              </div>
              <div className="border border-line rounded-xl p-5 flex flex-col gap-5">
                <div className="text-[12px] font-semibold uppercase tracking-wide text-ink-soft">Voice settings</div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[12.5px] font-semibold block mb-1.5">Voice</label>
                    <select value={selected.speaker} onChange={(e) => fieldChange({ speaker: e.target.value })} className="w-full border border-line rounded-lg px-3 py-2 text-[13px] bg-raised outline-none focus:border-signal">
                      {SPEAKERS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[12.5px] font-semibold block mb-1.5">Language</label>
                    <select value={selected.starting_language} onChange={(e) => fieldChange({ starting_language: e.target.value })} className="w-full border border-line rounded-lg px-3 py-2 text-[13px] bg-raised outline-none focus:border-signal">
                      {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[12.5px] font-semibold block mb-1.5">Pace <span className="font-normal text-ink-soft">{Number(selected.speech_rate).toFixed(1)}x</span></label>
                    <input type="range" min={0.5} max={2.0} step={0.1} value={selected.speech_rate} onChange={(e) => fieldChange({ speech_rate: parseFloat(e.target.value) })} className="w-full accent-signal" />
                  </div>
                  <div>
                    <label className="text-[12.5px] font-semibold block mb-1.5">Pitch <span className="font-normal text-ink-soft">{Number(selected.speech_pitch).toFixed(1)}</span></label>
                    <input type="range" min={0.5} max={1.8} step={0.1} value={selected.speech_pitch} onChange={(e) => fieldChange({ speech_pitch: parseFloat(e.target.value) })} className="w-full accent-signal" />
                  </div>
                </div>
              </div>
              <div className="text-[12px] text-ink-soft border-t border-line pt-4">
                Last updated: {new Date(selected.updated_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                {selected.published_at && <> - Published: {new Date(selected.published_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</>}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-ink-soft text-[13px]">
            {scripts.length === 0 ? "Create your first script using the button on the left." : "Select a script to edit it."}
          </div>
        )}
      </div>

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-raised rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <div className="text-[15px] font-semibold mb-2">Delete this script?</div>
            <div className="text-[13px] text-ink-soft mb-5">"{scripts.find(s => s.id === deleteConfirm)?.name}" will be permanently deleted.</div>
            <div className="flex gap-2">
              <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 bg-miss text-white rounded-lg py-2.5 text-[13px] font-semibold">Delete</button>
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 border border-line rounded-lg py-2.5 text-[13px] font-semibold text-ink-soft">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
