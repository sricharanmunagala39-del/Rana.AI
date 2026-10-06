// @ts-nocheck
"use client";
// "Hear in Telugu" (or any call language): the owner reads and hears exactly how the employee will sound before going live.
// 1. Opening line: what the voice will actually read (pronunciation fixes applied) + one click to write typed-in-English
//    Telugu ("nenu Swathi matladutunnanu") in Telugu script so the voice reads it right.
// 2. The whole call plan in the call language, line by line, each with ▶ Hear and "Use this wording".
// 3. A sample call in that language. 4. Fix any word's pronunciation right here and hear it again.

import { useRef, useState } from "react";
import { Card, Spinner } from "./Editors";
import { LANG_NAMES } from "@/lib/playbook";
import { speakableGreeting } from "@/lib/acronym";

const LATIN = /[A-Za-z]{2,}/;

export default function LanguagePreview({ value, set, language, voiceId, voiceName, speed, engine }: any) {
  const { playbook, greeting, pronunciations } = value;
  const name = LANG_NAMES[language] || "English";
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [data, setData] = useState<any>(null);
  const [playing, setPlaying] = useState("");
  const [undo, setUndo] = useState<string | null>(null);
  const [fix, setFix] = useState({ word: "", sayAs: "" });
  const audio = useRef<HTMLAudioElement | null>(null);

  const spoken = (t: string) => speakableGreeting(t || "", pronunciations || [], language) || t || "";

  async function hear(key: string, text: string) {
    setErr("");
    audio.current?.pause();
    if (playing === key) { setPlaying(""); return; }
    const say = spoken(text).replace(/\s+/g, " ").trim();
    if (!say) return;
    if (engine !== "sarvam" && !voiceId) { setErr("Pick a voice in step 2 to hear it."); return; }
    setPlaying(key);
    try {
      const q = new URLSearchParams(engine === "sarvam"
        ? { engine: "sarvam", voice: voiceName || "Priya", lang: language, text: say.slice(0, 240), speed: String(speed || 1) }
        : { voiceId, lang: language, text: say.slice(0, 240), speed: String(speed || 1) });
      const r = await fetch(`/api/voices/preview?${q}`);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Couldn't play that.");
      const a = new Audio(URL.createObjectURL(await r.blob())); audio.current = a;
      a.onended = () => setPlaying(""); a.onerror = () => setPlaying("");
      await a.play();
    } catch (e: any) { setErr(e.message); setPlaying(""); }
  }

  async function fixGreetingScript() {
    setBusy("script"); setErr("");
    try {
      const r = await fetch("/api/studio/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: greeting, to: language, mode: "script" }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error);
      setUndo(greeting); set({ greeting: d.text });
    } catch (e: any) { setErr(e.message || "Couldn't rewrite it."); } finally { setBusy(""); }
  }

  async function build() {
    setBusy("preview"); setErr("");
    try {
      const r = await fetch("/api/studio/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ playbook, greeting, to: language }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error);
      setData(d);
    } catch (e: any) { setErr(e.message || "Couldn't build the preview."); } finally { setBusy(""); }
  }

  // "Use this wording": the line in the call language replaces the card text, so the employee says it this way.
  function useLine(id: string, text: string) {
    const pb = { ...playbook };
    const [k, i] = id.split(".");
    if (i === undefined) pb[k] = text;
    else if (k === "objections") pb.objections = pb.objections.map((o: any, j: number) => j === +i ? { ...o, response: text } : o);
    else if (k === "faqs") pb.faqs = pb.faqs.map((f: any, j: number) => j === +i ? { ...f, answer: text } : f);
    else pb[k] = pb[k].map((x: string, j: number) => j === +i ? text : x);
    set({ playbook: pb });
    setData((d: any) => ({ ...d, lines: d.lines.map((l: any) => l.id === id ? { ...l, en: text, used: true } : l) }));
  }

  function addFix() {
    const word = fix.word.trim(), sayAs = fix.sayAs.trim();
    if (!word || !sayAs) return;
    const rest = (pronunciations || []).filter((p: any) => p.word.toLowerCase() !== word.toLowerCase());
    set({ pronunciations: [...rest, { word, sayAs }] });
    setFix({ word: "", sayAs: "" });
  }

  const g = greeting || "";
  const mixed = language !== "en" && LATIN.test(g.replace(/https?:\S+/g, ""));
  const playBtn = (key: string, text: string, label = "▶ Hear") => (
    <button type="button" onClick={() => hear(key, text)} disabled={!String(text || "").trim()}
      className="shrink-0 border border-line rounded-lg px-2.5 py-1 text-[12px] font-semibold bg-raised hover:border-signal disabled:opacity-40" data-testid={`hear-${key}`}>
      {playing === key ? "■ Stop" : label}
    </button>
  );

  return (
    <div className="flex flex-col gap-4" data-testid="lang-preview">
      <div className="text-[12.5px] text-ink-soft">
        Check how your employee sounds in <b className="text-ink">{name}</b> before going live, in the voice you picked ({voiceName || "Priya"}). Your cards can stay in English —
        the employee speaks {name} on the call. Use this page to read and hear the {name}, and lock any line to your own wording.
      </div>
      {err && <div className="text-[12.5px] text-miss" role="alert">{err}</div>}

      <Card title="1 · Opening line — exactly what callers hear first" hint="Read word for word the moment the call connects." testId="preview-greeting">
        <div className="text-[13.5px] leading-relaxed">{g || <span className="text-ink-soft">No greeting yet — add one on the Script tab.</span>}</div>
        {g && spoken(g) !== g && <div className="text-[12px] text-ink-soft mt-1">Spoken as: <span className="text-ink">{spoken(g)}</span></div>}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {playBtn("greeting", g, "▶ Hear the opening")}
          {mixed && (
            <button type="button" onClick={fixGreetingScript} disabled={busy === "script"} className="border border-signal text-signal rounded-lg px-2.5 py-1 text-[12px] font-semibold flex items-center gap-1.5" data-testid="fix-script">
              {busy === "script" ? <Spinner /> : null} Write it in {name} letters so the voice reads it right
            </button>
          )}
          {undo !== null && <button type="button" onClick={() => { set({ greeting: undo }); setUndo(null); }} className="text-[12px] text-ink-soft underline">Undo</button>}
        </div>
        {mixed && <div className="text-[11.5px] text-ink-soft mt-2">This line has words in English letters. If some of them are {name} words (like “nenu … matladutunnanu”), the voice may read them like English. The button above writes them in {name} script and keeps your English words and names.</div>}
      </Card>

      <Card title={`2 · Your whole call plan in ${name}`} hint={`The ${name} your employee will use for each card, line by line.`} testId="preview-plan">
        {!data ? (
          <button type="button" onClick={build} disabled={busy === "preview" || language === "en"} className="bg-signal text-on-accent rounded-lg px-4 py-2 text-[13px] font-semibold disabled:opacity-40 flex items-center gap-2" data-testid="build-preview">
            {busy === "preview" ? <><Spinner /> Writing it in {name}… (20–40 seconds)</> : language === "en" ? "This employee speaks English — nothing to translate" : `✦ Show my call plan in ${name}`}
          </button>
        ) : (
          <div className="flex flex-col gap-2" data-testid="preview-lines">
            {data.lines.map((l: any) => (
              <div key={l.id} className="border border-line rounded-lg p-2.5 bg-paper">
                <div className="text-[11px] font-mono uppercase tracking-wide text-ink-soft">{l.section}</div>
                <div className="grid md:grid-cols-2 gap-2 mt-1">
                  <div className="text-[12.5px] text-ink-soft">{l.en}</div>
                  <div className="text-[13.5px]">{l.text || <span className="text-ink-soft">—</span>}</div>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {playBtn(l.id, l.text)}
                  {l.text && !l.used && <button type="button" onClick={() => useLine(l.id, l.text)} className="border border-line rounded-lg px-2.5 py-1 text-[12px] font-semibold hover:border-signal" data-testid={`use-${l.id}`}>Use this {name} wording</button>}
                  {l.used && <span className="text-[12px] text-signal font-semibold">✓ Card now uses this wording</span>}
                </div>
              </div>
            ))}
            <button type="button" onClick={build} disabled={busy === "preview"} className="self-start text-[12.5px] font-semibold text-ink-soft underline mt-1">{busy === "preview" ? "Updating…" : "Refresh after changes"}</button>
          </div>
        )}
      </Card>

      {data?.sample?.length > 0 && (
        <Card title={`3 · A sample call in ${name}`} hint="How a typical call could go, using only your facts. Real calls follow the caller." testId="preview-sample">
          <div className="flex flex-col gap-2">
            {data.sample.map((t: any, i: number) => (
              <div key={i} className={`flex gap-2 items-start ${t.who === "caller" ? "pl-6" : ""}`}>
                <span className={`shrink-0 text-[10.5px] font-mono rounded-full px-1.5 py-0.5 border ${t.who === "agent" ? "text-signal border-signal/50" : "text-ink-soft border-line"}`}>{t.who === "agent" ? (voiceName || "RANA").split(" - ")[0].toUpperCase() : "CALLER"}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px]">{t.text}</div>
                  {t.en && <div className="text-[11.5px] text-ink-soft">{t.en}</div>}
                </div>
                {t.who === "agent" && playBtn(`s${i}`, t.text)}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title="4 · A word sounds wrong? Fix it here" hint={`Type the word as written, then how it should sound (in ${name} letters works best). Every call and preview uses the fix.`} testId="preview-fix">
        <div className="flex flex-wrap gap-2">
          <input value={fix.word} onChange={(e) => setFix({ ...fix, word: e.target.value })} placeholder="Word, e.g. Bhatia" className="flex-1 min-w-[140px] border border-line rounded-lg px-2.5 py-1.5 text-[13px] bg-raised" data-testid="fix-word" />
          <input value={fix.sayAs} onChange={(e) => setFix({ ...fix, sayAs: e.target.value })} placeholder={language === "te" ? "Say as, e.g. భాటియా" : "Say as"} className="flex-1 min-w-[140px] border border-line rounded-lg px-2.5 py-1.5 text-[13px] bg-raised" data-testid="fix-say" />
          {playBtn("fix", fix.sayAs || fix.word)}
          <button type="button" onClick={addFix} disabled={!fix.word.trim() || !fix.sayAs.trim()} className="bg-ink text-paper rounded-lg px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-40" data-testid="fix-add">Save fix</button>
        </div>
        {(pronunciations || []).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {pronunciations.map((p: any) => <span key={p.word} className="text-[12px] border border-line rounded-full px-2.5 py-0.5">{p.word} → {p.sayAs}</span>)}
          </div>
        )}
      </Card>
    </div>
  );
}
