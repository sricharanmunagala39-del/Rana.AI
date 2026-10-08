"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { LANGUAGES } from "@/lib/storage";
import { SECTIONS, type Sections } from "@/lib/agentBuilder";

type Agent = { id: string; name: string; greeting: string; language: string; voice: string; sections: Sections; exact: boolean; publishedAt: string | null; readyMade: boolean; hasOldScript: boolean };
type Version = { version: number; note: string | null; greeting: string; sections: Sections; starting_language: string | null; voice_name: string | null; created_by: string | null; created_at: string };
type Proposal = { kind: "change" | "import" | "restore"; title: string; summary: string; changes: Partial<Sections>; greeting: string | null; language?: string | null; voice?: string | null };

const box = "w-full rounded-lg border border-line bg-paper px-3 py-2 text-[13.5px] leading-relaxed outline-none focus:border-signal";
const btn = "rounded-lg px-3.5 py-2 text-[13px] font-semibold disabled:opacity-40";
const ago = (t: string) => new Date(t).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function Builder() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get("id");
  const [agent, setAgent] = useState<Agent | null>(null);
  const [saved, setSaved] = useState<string>("");
  const [versions, setVersions] = useState<Version[]>([]);
  const [oldScript, setOldScript] = useState("");
  const [voices, setVoices] = useState<{ name: string; live: boolean }[]>([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [ask, setAsk] = useState("");
  const [paste, setPaste] = useState("");
  const [note, setNote] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [list, setList] = useState<any[]>([]);
  const [newName, setNewName] = useState("");

  const snapshot = (a: Agent | null) => (a ? JSON.stringify([a.name, a.greeting, a.language, a.voice, a.sections]) : "");
  const dirty = !!agent && snapshot(agent) !== saved;

  async function load() {
    if (!id) { fetch("/api/scripts").then((r) => r.json()).then((d) => setList(d.scripts || [])).catch(() => {}); return; }
    setErr("");
    const r = await fetch(`/api/builder/${id}`); const d = await r.json();
    if (!r.ok) { setErr(d.error || "Couldn't open this employee."); return; }
    setAgent(d.agent); setSaved(snapshot(d.agent)); setVersions(d.versions || []); setOldScript(d.oldScript || "");
  }
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fetch("/api/voices/r1").then((r) => r.json()).then((d) => setVoices((d.voices || []).filter((v: any) => v.live).map((v: any) => ({ name: v.name, live: v.live })))).catch(() => {}); }, []);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = (p: Partial<Agent>) => setAgent((a) => (a ? { ...a, ...p } : a));
  const setSection = (k: keyof Sections, v: string) => setAgent((a) => (a ? { ...a, sections: { ...a.sections, [k]: v } } : a));

  async function call(path: string, body: any, label: string) {
    setBusy(label); setErr(""); setMsg("");
    try {
      const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || "Something went wrong.");
      return d;
    } catch (e: any) { setErr(e.message); return null; } finally { setBusy(""); }
  }

  async function askChange() {
    if (!agent || !ask.trim()) return;
    const d = await call(`/api/builder/${agent.id}/ai`, { mode: "change", request: ask, sections: agent.sections, greeting: agent.greeting }, "ask");
    if (d) setProposal({ kind: "change", title: ask.trim(), summary: d.summary, changes: d.changes || {}, greeting: d.greeting });
  }
  async function importScript(text: string) {
    if (!agent || text.trim().length < 20) return;
    const d = await call(`/api/builder/${agent.id}/ai`, { mode: "import", text }, "import");
    if (!d) return;
    const changes: Partial<Sections> = {};
    for (const s of SECTIONS) if ((d.sections?.[s.key] || "") !== (agent.sections[s.key] || "")) changes[s.key] = d.sections[s.key];
    setProposal({ kind: "import", title: "Script arranged into sections", summary: "Every detail from your script was placed in a section. Check it, then accept.", changes, greeting: d.greeting && d.greeting !== agent.greeting ? d.greeting : null });
  }
  function restore(v: Version) {
    if (!agent) return;
    const changes: Partial<Sections> = {};
    for (const s of SECTIONS) if ((v.sections?.[s.key] || "") !== (agent.sections[s.key] || "")) changes[s.key] = v.sections?.[s.key] || "";
    setProposal({ kind: "restore", title: `Restore version ${v.version}`, summary: v.note || "Brings back that version's script. Publish to use it on calls.", changes, greeting: v.greeting !== agent.greeting ? v.greeting : null, language: v.starting_language, voice: v.voice_name });
  }
  function accept() {
    if (!agent || !proposal) return;
    set({ sections: { ...agent.sections, ...proposal.changes } as Sections, ...(proposal.greeting != null ? { greeting: proposal.greeting } : {}), ...(proposal.language ? { language: proposal.language } : {}), ...(proposal.voice ? { voice: proposal.voice } : {}) });
    if (proposal.kind === "change") setAsk("");
    if (proposal.kind === "import") setPaste("");
    setProposal(null); setMsg("Accepted — press Publish to use it on calls.");
  }
  async function saveDraft() {
    if (!agent) return;
    setBusy("save"); setErr("");
    const r = await fetch(`/api/builder/${agent.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: agent.name, greeting: agent.greeting, sections: agent.sections, language: agent.language, voice: agent.voice }) });
    const d = await r.json(); setBusy("");
    if (!r.ok) { setErr(d.error || "Couldn't save."); return; }
    setSaved(snapshot(agent)); setMsg("Draft saved. Calls still use the last published version.");
  }
  async function publish() {
    if (!agent) return;
    const d = await call(`/api/builder/${agent.id}/publish`, { note, name: agent.name, greeting: agent.greeting, sections: agent.sections, language: agent.language, voice: agent.voice }, "publish");
    if (!d) return;
    setNote(""); await load();
    setMsg(`Published version ${d.version}. The next test or call uses it.${d.voiceLive === false ? ` (${agent.voice} isn't switched on yet — calls use ${d.voiceUsed}.)` : ""}`);
  }
  async function createNew() {
    const d = await call(`/api/builder`, { name: newName || "New agent" }, "new");
    if (d?.id) router.push(`/builder?id=${d.id}`);
  }

  const changedKeys = useMemo(() => Object.keys(proposal?.changes || {}), [proposal]);
  const filled = agent ? SECTIONS.filter((s) => agent.sections[s.key]?.trim()).length : 0;

  if (!id) return (
    <div className="flex flex-col gap-5 max-w-[900px]">
      <div>
        <div className="text-[20px] font-display font-semibold">Agent Builder</div>
        <div className="text-[13px] text-ink-soft mt-0.5">Write the script in clear sections. The agent follows it exactly as written. Ask the AI for changes in plain words, publish, and test straight away.</div>
      </div>
      <div className="border border-line rounded-xl bg-raised p-4 flex flex-wrap gap-2 items-center">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Agent name, e.g. Honer Homes reception" className={`${box} max-w-[360px]`} data-testid="builder-new-name" />
        <button onClick={createNew} disabled={!!busy} className={`${btn} bg-signal text-on-accent`} data-testid="builder-new">{busy === "new" ? "Creating…" : "+ New agent"}</button>
      </div>
      <div className="border border-line rounded-xl bg-raised p-4">
        <div className="text-[13.5px] font-semibold mb-2">Or open an employee</div>
        <div className="flex flex-col divide-y divide-line">
          {list.map((s) => (
            <a key={s.id} href={`/builder?id=${s.id}`} className="py-2 flex items-center justify-between text-[13.5px] hover:text-signal">
              <span>{s.name}</span>
              <span className="text-[11.5px] text-ink-soft">{s.prompt_mode === "exact" ? "Agent Builder" : s.engine_agent ? "Ready-made agent" : "Script Studio"}{s.published_at ? " · published" : ""}</span>
            </a>
          ))}
          {!list.length && <div className="text-[13px] text-ink-soft py-2">No employees yet.</div>}
        </div>
      </div>
      {err && <div className="text-[13px] text-miss">{err}</div>}
    </div>
  );

  if (!agent) return <div className="text-[13px] text-ink-soft">{err || "Loading…"}</div>;

  return (
    <div className="flex flex-col gap-4 w-full max-w-[1500px]" data-testid="builder">
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <div className="min-w-0">
          <div className="text-[12px] text-ink-soft"><a href="/builder" className="hover:text-ink">Agent Builder</a> /</div>
          <input value={agent.name} onChange={(e) => set({ name: e.target.value })} className="text-[20px] font-display font-semibold bg-transparent outline-none border-b border-transparent focus:border-signal w-[min(520px,80vw)]" aria-label="Agent name" />
          <div className="text-[12px] text-ink-soft mt-0.5" data-testid="builder-status">
            {versions[0] ? `Live: version ${versions[0].version}, published ${ago(versions[0].created_at)}` : agent.exact && agent.publishedAt ? "Published" : "Not published yet"}
            {dirty ? " · unsaved changes" : ""}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={agent.language} onChange={(e) => set({ language: e.target.value })} className="rounded-lg border border-line bg-paper px-2.5 py-2 text-[13px]" aria-label="Opening language" data-testid="builder-language">
            {LANGUAGES.filter((l) => !/R2|R3/.test(l.label)).map((l) => <option key={l.code} value={l.code}>Opens in {l.label}</option>)}
          </select>
          <select value={agent.voice} onChange={(e) => set({ voice: e.target.value })} className="rounded-lg border border-line bg-paper px-2.5 py-2 text-[13px] max-w-[230px]" aria-label="Voice" data-testid="builder-voice">
            {!voices.some((v) => v.name === agent.voice) && <option value={agent.voice}>{agent.voice}</option>}
            {voices.map((v) => <option key={v.name} value={v.name}>Voice: {v.name}</option>)}
          </select>
          <button onClick={saveDraft} disabled={!!busy || !dirty} className={`${btn} border border-line`} data-testid="builder-save">{busy === "save" ? "Saving…" : "Save draft"}</button>
          <a href={`/talk?scriptId=${agent.id}`} className={`${btn} border border-line ${!agent.publishedAt ? "opacity-40 pointer-events-none" : ""}`} data-testid="builder-test">▶ Test</a>
        </div>
      </div>

      {agent.readyMade && <div className="text-[12.5px] rounded-lg border border-warm/40 bg-warm/10 px-3 py-2">This employee is connected to a ready-made agent. Publishing here switches it to this script (the ready-made agent is no longer used).</div>}
      {err && <div className="text-[13px] text-miss" data-testid="builder-error">{err}</div>}
      {msg && <div className="text-[13px] text-signal" data-testid="builder-msg">{msg}</div>}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_400px] gap-4 items-start">
        <div className="flex flex-col gap-3">
          <div className="border border-line rounded-xl bg-raised p-4">
            <div className="text-[13.5px] font-semibold">Greeting</div>
            <div className="text-[11.5px] text-ink-soft mb-1.5">The first line the agent says, in the opening language.</div>
            <textarea value={agent.greeting} onChange={(e) => set({ greeting: e.target.value })} rows={2} className={box} data-testid="builder-greeting" placeholder="Hello, welcome to … this is Priya. How can I help you today?" />
          </div>
          {SECTIONS.map((s) => (
            <div key={s.key} className={`border rounded-xl bg-raised p-4 ${changedKeys.includes(s.key) ? "border-signal ring-1 ring-signal" : "border-line"}`} data-testid={`section-${s.key}`}>
              <div className="text-[13.5px] font-semibold">{s.title}</div>
              <div className="text-[11.5px] text-ink-soft mb-1.5">{s.hint}</div>
              <textarea value={agent.sections[s.key]} onChange={(e) => setSection(s.key, e.target.value)} rows={Math.min(18, Math.max(3, (agent.sections[s.key] || "").split("\n").length + 1))} className={box} />
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 lg:sticky lg:top-4">
          <div className="border border-signal/50 rounded-xl bg-raised p-4" data-testid="builder-ask">
            <div className="text-[13.5px] font-semibold">✨ Ask for a change</div>
            <div className="text-[11.5px] text-ink-soft mb-1.5">Say it in plain words. The AI edits only what's needed and keeps the rest of the script the same.</div>
            <textarea value={ask} onChange={(e) => setAsk(e.target.value)} rows={4} className={box} placeholder="e.g. Say all prices in English. If they ask about sizes, say all sizes are available and invite them to visit." data-testid="builder-ask-input" />
            <button onClick={askChange} disabled={!!busy || !ask.trim() || filled === 0} className={`${btn} bg-signal text-on-accent mt-2`} data-testid="builder-ask-go">{busy === "ask" ? "Working on it…" : "Make the change"}</button>
            {filled === 0 && <div className="text-[11.5px] text-ink-soft mt-1.5">Add the script first (paste it below).</div>}
          </div>

          {proposal && (
            <div className="border border-signal rounded-xl bg-raised p-4" data-testid="builder-proposal">
              <div className="text-[13.5px] font-semibold">{proposal.title}</div>
              <div className="text-[12.5px] text-ink-soft mt-0.5">{proposal.summary}</div>
              <div className="flex flex-col gap-2 mt-2.5 max-h-[50vh] overflow-y-auto">
                {proposal.greeting != null && <Diff title="Greeting" before={agent.greeting} after={proposal.greeting} />}
                {SECTIONS.filter((s) => s.key in proposal.changes).map((s) => <Diff key={s.key} title={s.title} before={agent.sections[s.key]} after={proposal.changes[s.key] || ""} />)}
                {!changedKeys.length && proposal.greeting == null && <div className="text-[12.5px]">Nothing needs to change.</div>}
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={accept} disabled={!changedKeys.length && proposal.greeting == null && !proposal.language} className={`${btn} bg-signal text-on-accent`} data-testid="builder-accept">Accept</button>
                <button onClick={() => setProposal(null)} className={`${btn} border border-line`}>Discard</button>
              </div>
            </div>
          )}

          <div className="border border-line rounded-xl bg-raised p-4" data-testid="builder-publish">
            <div className="text-[13.5px] font-semibold">Publish</div>
            <div className="text-[11.5px] text-ink-soft mb-1.5">Calls use the published version. Each publish is saved, so you can go back.</div>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What changed? (optional)" className={box} />
            <button onClick={publish} disabled={!!busy || filled === 0} className={`${btn} bg-ink text-paper mt-2`} data-testid="builder-publish-go">{busy === "publish" ? "Publishing…" : `Publish version ${(versions[0]?.version || 0) + 1}`}</button>
          </div>

          <div className="border border-line rounded-xl bg-raised p-4">
            <div className="text-[13.5px] font-semibold">Start from a script</div>
            <div className="text-[11.5px] text-ink-soft mb-1.5">Paste a full script or notes. The AI puts every detail into the sections.</div>
            <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={4} className={box} placeholder="Paste the script here…" data-testid="builder-paste" />
            <div className="flex flex-wrap gap-2 mt-2">
              <button onClick={() => importScript(paste)} disabled={!!busy || paste.trim().length < 20} className={`${btn} border border-line`} data-testid="builder-import">{busy === "import" ? "Arranging…" : "Arrange into sections"}</button>
              {oldScript && <button onClick={() => importScript(oldScript)} disabled={!!busy} className={`${btn} border border-line`} data-testid="builder-import-old">Use this employee&apos;s current script</button>}
            </div>
          </div>

          <div className="border border-line rounded-xl bg-raised p-4" data-testid="builder-versions">
            <div className="text-[13.5px] font-semibold mb-1.5">Versions</div>
            {!versions.length && <div className="text-[12.5px] text-ink-soft">No versions yet — publish to save the first one.</div>}
            <div className="flex flex-col divide-y divide-line">
              {versions.map((v, i) => (
                <div key={v.version} className="py-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold">v{v.version}{i === 0 ? <span className="text-[10.5px] text-signal font-mono ml-1.5">LIVE</span> : null}</div>
                    <div className="text-[11.5px] text-ink-soft truncate">{v.note || "No note"} · {ago(v.created_at)}</div>
                  </div>
                  {i > 0 && <button onClick={() => restore(v)} className="text-[12px] text-signal font-semibold shrink-0">Restore</button>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Diff({ title, before, after }: { title: string; before: string; after: string }) {
  return (
    <div className="rounded-lg border border-line p-2.5">
      <div className="text-[12px] font-semibold mb-1">{title}</div>
      <div className="grid gap-1.5">
        <div className="text-[12px] whitespace-pre-wrap rounded bg-miss/10 text-ink-soft px-2 py-1.5 line-through decoration-miss/50 max-h-40 overflow-y-auto">{before || "(empty)"}</div>
        <div className="text-[12px] whitespace-pre-wrap rounded bg-signal/10 px-2 py-1.5 max-h-60 overflow-y-auto">{after || "(empty)"}</div>
      </div>
    </div>
  );
}

export default function BuilderPage() {
  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar active="builder" />
      <div className="flex-1 p-6 md:p-10 min-w-0">
        <Suspense fallback={<div className="text-[13px] text-ink-soft">Loading…</div>}><Builder /></Suspense>
      </div>
    </div>
  );
}
