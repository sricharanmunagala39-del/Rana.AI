// @ts-nocheck
"use client";
// Words the voice says wrong (brand names, Telugu place names, acronyms) and words the ear mishears.
// "Say it as" is spelled the way it should sound; the employee writes that form whenever it speaks
// the word. Every row can be played in the chosen voice to compare before and after.

import { useRef, useState } from "react";
import { Spinner } from "./Editors";
import { LANG_NAMES } from "@/lib/playbook";

const NATIVE_LABEL: Record<string, string> = { te: "తెలుగు", hi: "हिन्दी", ta: "தமிழ்", kn: "ಕನ್ನಡ", ml: "മലയാളം", mr: "मराठी", bn: "বাংলা", gu: "ગુજરાતી", pa: "ਪੰਜਾਬੀ", en: "English" };

export default function PronunciationPanel({ items, onChange, keyterms, onKeytermsChange, voiceId, voiceName, language, allowedLanguages, speed, engine }: any) {
  // Test as a caller of this language: the word is spoken inside a short native sentence, in the chosen voice.
  const testLangs: string[] = Array.from(new Set([language, ...(allowedLanguages || [])])).filter((l: string) => LANG_NAMES[l]);
  const [testLang, setTestLang] = useState<string>(language);
  const lang = testLangs.includes(testLang) ? testLang : language;
  const [writing, setWriting] = useState<number | null>(null);
  const [playing, setPlaying] = useState<string>("");
  const [loadingKey, setLoadingKey] = useState<string>("");
  const [err, setErr] = useState("");
  const [term, setTerm] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const set = (i: number, k: string, v: string) => onChange(items.map((x: any, j: number) => (j === i ? { ...x, [k]: v } : x)));
  const del = (i: number) => onChange(items.filter((_: any, j: number) => j !== i));

  async function play(key: string, text: string) {
    setErr("");
    audioRef.current?.pause();
    if (playing === key) { setPlaying(""); return; }
    if (!voiceId && engine !== "sarvam") { setErr("Pick a voice in step 2 to hear how it sounds."); return; }
    if (!text.trim()) return;
    setLoadingKey(key);
    try {
      const q = new URLSearchParams(engine === "sarvam" ? { engine: "sarvam", lang, say: text, speed: String(speed || 1) } : { voiceId, lang, say: text, speed: String(speed || 1) });
      const res = await fetch(`/api/voices/preview?${q}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't play that.");
      const url = URL.createObjectURL(await res.blob());
      const a = new Audio(url);
      audioRef.current = a;
      a.onended = () => { setPlaying(""); URL.revokeObjectURL(url); };
      await a.play();
      setPlaying(key);
    } catch (e: any) { setErr(e.message); }
    finally { setLoadingKey(""); }
  }

  const PlayBtn = ({ k, text, label }: any) => (
    <button type="button" onClick={() => play(k, text)} disabled={!text?.trim()}
      className="text-[11.5px] font-semibold border border-line rounded-md px-2 py-1 bg-white disabled:opacity-40 flex items-center gap-1 whitespace-nowrap">
      {loadingKey === k ? <Spinner /> : playing === k ? "■" : "▶"} {label}
    </button>
  );

  // Spell the word by sound in the test language's own script (e.g. DBMCI → డి బి ఎం సి ఐ).
  async function writeNative(i: number) {
    const p = items[i];
    const source = (p.sayAs || p.word || "").trim();
    if (!source) return;
    setWriting(i); setErr("");
    try {
      const res = await fetch("/api/studio/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: p.word || source, to: lang, mode: "transliterate" }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Couldn't write it.");
      set(i, "sayAs", String(d.text || "").trim());
    } catch (e: any) { setErr(e.message); }
    finally { setWriting(null); }
  }

  function addTerm() {
    const t = term.trim();
    if (t && !keyterms.includes(t)) onKeytermsChange([...keyterms, t]);
    setTerm("");
  }

  return (
    <div className="flex flex-col gap-6" data-testid="pronunciation">
      <div>
        <div className="text-[13px] font-semibold">How to say it</div>
        <div className="text-[12px] text-ink-soft mt-0.5 mb-3">
          If the voice says a word wrong, write it the way it should sound. For Telugu or Hindi callers, write it in <b>Telugu / Hindi script</b> — English letters are read with an English accent. e.g. <span className="font-semibold text-ink">DBMCI → డి బి ఎం సి ఐ</span>. Press ▶ to hear it in a sentence.
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-3 text-[12px]" data-testid="pron-test-lang">
          <span className="text-ink-soft">Hear it as a</span>
          {testLangs.map((l) => (
            <button key={l} type="button" onClick={() => setTestLang(l)} data-testid={`pron-lang-${l}`}
              className={`font-semibold px-2.5 py-0.5 rounded-full border ${lang === l ? "bg-ink text-white border-ink" : "bg-white text-ink-soft border-line"}`}>{LANG_NAMES[l]}</button>
          ))}
          <span className="text-ink-soft">caller{engine === "sarvam" || voiceId ? <> · in <b className="text-ink">{voiceName || "your chosen"}</b>'s voice</> : " · pick a voice in step 2"}</span>
        </div>
        <div className="flex flex-col gap-2">
          {items.length > 0 && (
            <div className="grid grid-cols-[1fr_1.3fr_auto_auto] gap-2 text-[10.5px] font-semibold uppercase tracking-wide text-ink-soft px-1">
              <span>Word in script</span><span>Say it as</span><span /><span />
            </div>
          )}
          {items.map((p: any, i: number) => (
            <div key={i} className="grid grid-cols-[1fr_1.3fr_auto_auto] gap-2 items-center" data-testid="pron-row">
              <div className="flex items-center gap-1.5 border border-line rounded-lg bg-white px-2">
                <input value={p.word} onChange={(e) => set(i, "word", e.target.value)} placeholder="DBMCI" className="flex-1 min-w-0 py-1.5 text-[13.5px] outline-none bg-transparent" />
                <PlayBtn k={`w${i}`} text={p.word} label="" />
              </div>
              <div className="flex items-center gap-1.5 border border-signal/40 rounded-lg bg-white px-2">
                <input value={p.sayAs} onChange={(e) => set(i, "sayAs", e.target.value)} placeholder={lang === "te" ? "డి బి ఎం సి ఐ" : lang === "hi" ? "डी बी एम सी आई" : "D B M C I"} className="flex-1 min-w-0 py-1.5 text-[13.5px] outline-none bg-transparent" />
                <PlayBtn k={`s${i}`} text={p.sayAs} label="Test" />
              </div>
              {lang !== "en" ? (
                <button type="button" onClick={() => writeNative(i)} disabled={writing === i || !(p.word || p.sayAs)} title={`Spell it by sound in ${LANG_NAMES[lang]} script`} data-testid="pron-native"
                  className="text-[11.5px] font-semibold border border-line rounded-md px-2 py-1.5 bg-white disabled:opacity-40 whitespace-nowrap flex items-center gap-1">
                  {writing === i ? <Spinner /> : null} Write in {NATIVE_LABEL[lang] || LANG_NAMES[lang]}
                </button>
              ) : <span />}
              <button type="button" onClick={() => del(i)} className="text-miss text-[12px] font-semibold px-1" aria-label="Remove">✕</button>
            </div>
          ))}
          <button type="button" onClick={() => onChange([...items, { word: "", sayAs: "" }])} className="text-[12.5px] font-semibold text-signal text-left mt-1">+ Add a word</button>
        </div>
        {err && <div className="text-[12px] text-miss mt-2">{err}</div>}
      </div>

      <div>
        <div className="text-[13px] font-semibold">Words to listen for</div>
        <div className="text-[12px] text-ink-soft mt-0.5 mb-2">Names the caller might say — course names, exams, places, your brand. The employee's ear is tuned to catch these correctly.</div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {keyterms.map((k: string) => (
            <span key={k} className="text-[12.5px] bg-white border border-line rounded-full pl-2.5 pr-1.5 py-0.5 flex items-center gap-1">
              {k}
              <button type="button" onClick={() => onKeytermsChange(keyterms.filter((x: string) => x !== k))} className="text-ink-soft hover:text-miss text-[11px] px-0.5" aria-label={`Remove ${k}`}>✕</button>
            </span>
          ))}
          {keyterms.length === 0 && <span className="text-[12px] text-ink-soft">None yet.</span>}
        </div>
        <div className="flex gap-2 max-w-[420px]">
          <input value={term} onChange={(e) => setTerm(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTerm(); } }}
            placeholder="e.g. NEET PG, FMGE, Ameerpet" className="flex-1 border border-line rounded-lg px-3 py-1.5 text-[13.5px] bg-white outline-none focus:border-signal" />
          <button type="button" onClick={addTerm} className="border border-line bg-white rounded-lg px-3 text-[12.5px] font-semibold">Add</button>
        </div>
      </div>
    </div>
  );
}
