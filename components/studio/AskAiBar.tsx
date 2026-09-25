// @ts-nocheck
"use client";
// "Ask AI to change" — the business owner describes a change in plain words (any language) and the
// AI rewrites only that part of the playbook. The change is applied at once so they can see it in
// the cards, with a clear summary of what moved and a one-click Undo.

import { useState } from "react";
import { Spinner } from "./Editors";

const SUGGESTIONS = [
  "Make every answer shorter and more conversational",
  "Add an answer for 'fees are too high' — mention EMI is available",
  "Sound warmer and more respectful, like a senior counsellor",
  "Ask for the caller's exam year before pitching",
];

const SECTION_LABELS: Record<string, string> = {
  goal: "Goal", persona: "Persona", opening: "Opening", discovery: "Questions", pitch: "Pitch", objections: "Objections",
  faqs: "FAQs", closing: "Closing", followUp: "If not ready", doNot: "Never say", facts: "Facts",
};

function changedSections(a: any, b: any, greetA: string, greetB: string, linksA: any[], linksB: any[]) {
  const out: string[] = [];
  if ((greetA || "") !== (greetB || "")) out.push("Greeting");
  for (const k of Object.keys(SECTION_LABELS)) if (JSON.stringify(a?.[k] ?? null) !== JSON.stringify(b?.[k] ?? null)) out.push(SECTION_LABELS[k]);
  if (JSON.stringify(linksA || []) !== JSON.stringify(linksB || [])) out.push("Links");
  return out;
}

export default function AskAiBar({ playbook, greeting, links, openingLanguage, onApply, compact = false }: any) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [last, setLast] = useState<{ summary: string; sections: string[]; before: any } | null>(null);

  async function run(instruction: string) {
    if (!instruction.trim() || busy) return;
    setBusy(true); setErr("");
    const before = { playbook, greeting, links };
    try {
      const res = await fetch("/api/studio/edit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playbook, greeting, links, instruction, openingLanguage }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "The AI couldn't make that change.");
      const sections = changedSections(playbook, d.playbook, greeting, d.greeting, links, d.links);
      onApply({ playbook: d.playbook, greeting: d.greeting, links: d.links });
      setLast({ summary: sections.length ? d.summary : "The AI didn't find anything to change for that request.", sections, before });
      setText("");
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  function undo() {
    if (!last) return;
    onApply(last.before);
    setLast(null);
  }

  return (
    <div className="border border-signal/30 bg-signal-tint/50 rounded-xl p-3" data-testid="ask-ai">
      <div className="flex items-center gap-2">
        <span className="text-signal text-[15px]" aria-hidden>✦</span>
        <input
          value={text} onChange={(e) => setText(e.target.value)} disabled={busy}
          onKeyDown={(e) => { if (e.key === "Enter") run(text); }}
          placeholder="Ask AI to change the script… e.g. “If they ask about hostel, say it's not included”"
          className="flex-1 bg-raised border border-line rounded-lg px-3 py-2 text-[13.5px] outline-none focus:border-signal disabled:opacity-60"
        />
        <button type="button" onClick={() => run(text)} disabled={busy || !text.trim()}
          className="bg-signal text-on-accent rounded-lg px-4 py-2 text-[13px] font-semibold disabled:opacity-40 flex items-center gap-2">
          {busy ? <><Spinner /> Changing…</> : "Change"}
        </button>
      </div>
      {!compact && !last && !busy && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" onClick={() => setText(s)} className="text-[11.5px] bg-raised border border-line rounded-full px-2.5 py-1 text-ink-soft hover:text-ink hover:border-signal">
              {s}
            </button>
          ))}
        </div>
      )}
      {err && <div className="text-[12px] text-miss mt-2">{err}</div>}
      {last && (
        <div className="mt-2 flex items-start justify-between gap-3 bg-raised border border-line rounded-lg px-3 py-2" data-testid="ask-ai-result">
          <div className="text-[12.5px]">
            <div className="font-semibold">{last.summary}</div>
            {last.sections.length > 0 && <div className="text-ink-soft mt-0.5">Changed: {last.sections.join(", ")}</div>}
          </div>
          <div className="flex gap-2 shrink-0">
            {last.sections.length > 0 && <button type="button" onClick={undo} className="text-[12px] font-semibold border border-line rounded-md px-2.5 py-1">Undo</button>}
            <button type="button" onClick={() => setLast(null)} className="text-[12px] font-semibold text-signal px-1">Keep</button>
          </div>
        </div>
      )}
    </div>
  );
}
