// @ts-nocheck
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import VoiceCloneModal from "@/components/VoiceCloneModal";

export type PickerVoice = {
  id: string;
  name: string;
  tagline?: string | null;
  description?: string | null;
  language?: string | null;
  gender?: string | null;
  country?: string | null;
  previewUrl?: string | null;
  accents?: { accent: string; locale: string; isNative: boolean }[];
  /** A voice this client cloned from its own recordings (private to the client). */
  custom?: boolean;
  customId?: string | null;
};

const GENDER_LABELS: Record<string, string> = {
  feminine: "Feminine",
  masculine: "Masculine",
  gender_neutral: "Gender neutral",
};

// Covers every language Cartesia's Managed Agents / voice catalog currently supports.
const LANGUAGE_NAMES: Record<string, string> = {
  en: "English", de: "German", pt: "Portuguese", zh: "Chinese", ja: "Japanese",
  fr: "French", es: "Spanish", hi: "Hindi", it: "Italian", ko: "Korean",
  nl: "Dutch", pl: "Polish", ru: "Russian", sv: "Swedish", tr: "Turkish",
  tl: "Tagalog", bg: "Bulgarian", ro: "Romanian", ar: "Arabic", cs: "Czech",
  el: "Greek", fi: "Finnish", hr: "Croatian", ms: "Malay", sk: "Slovak",
  da: "Danish", ta: "Tamil", uk: "Ukrainian", hu: "Hungarian", no: "Norwegian",
  vi: "Vietnamese", bn: "Bengali", th: "Thai", he: "Hebrew", ka: "Georgian",
  id: "Indonesian", te: "Telugu", gu: "Gujarati", kn: "Kannada", ml: "Malayalam",
  mr: "Marathi", pa: "Punjabi", or: "Odia", ur: "Urdu",
};
function languageName(code: string) { return LANGUAGE_NAMES[code] || code; }

// The line every voice reads in the preview, so voices are compared on the same sentence.
// Mirrors lib/voicePreview.ts (the server fills in each voice's own name and gendered verb forms).
const SAMPLE_HINT: Record<string, string> = {
  en: "Hi, this is <name> from RANA. I'm calling about the new batch you asked about. Do you have two minutes to talk?",
  te: "నమస్కారం! నేను RANA నుంచి <name> మాట్లాడుతున్నాను. మీరు అడిగిన కొత్త బ్యాచ్ గురించి రెండు నిమిషాలు మాట్లాడవచ్చా?",
  hi: "नमस्ते! मैं RANA से <name> बोल रही/रहा हूँ। आपने जिस नए बैच के बारे में पूछा था, क्या हम दो मिनट बात कर सकते हैं?",
  ta: "வணக்கம்! நான் RANA-விலிருந்து <name> பேசுகிறேன். நீங்கள் கேட்ட புதிய பேட்ச் பற்றி இரண்டு நிமிடம் பேசலாமா?",
  kn: "ನಮಸ್ಕಾರ! ನಾನು RANA ಇಂದ <name> ಮಾತಾಡ್ತಾ ಇದ್ದೀನಿ. ನೀವು ಕೇಳಿದ ಹೊಸ ಬ್ಯಾಚ್ ಬಗ್ಗೆ ಎರಡು ನಿಮಿಷ ಮಾತಾಡಬಹುದಾ?",
  ml: "നമസ്കാരം! ഞാൻ RANA-യിൽ നിന്ന് <name> ആണ് സംസാരിക്കുന്നത്…",
  mr: "नमस्कार! मी RANA कडून <name> बोलत आहे…",
  bn: "নমস্কার! আমি RANA থেকে <name> বলছি…",
  gu: "નમસ્તે! હું RANA તરફથી <name> બોલું છું…",
  pa: "ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਮੈਂ RANA ਤੋਂ <name> ਬੋਲ ਰਹੀ/ਰਿਹਾ ਹਾਂ…",
  ur: "السلام علیکم! میں RANA سے <name> بول رہی/رہا ہوں…",
  ar: "مرحباً! معك <name> من RANA…",
  es: "¡Hola! Soy <name>, de RANA. Te llamo por el nuevo curso que consultaste…",
  fr: "Bonjour ! Ici <name>, de RANA…",
  de: "Hallo! Hier ist <name> von RANA…",
  pt: "Olá! Aqui é <name>, da RANA…",
};
const baseLang = (l?: string | null) => String(l || "").toLowerCase().split(/[-_]/)[0] || "en";

export default function VoicePickerModal({
  voices,
  currentId,
  onSelect,
  onClose,
  language: agentLanguage,
  speed = 1,
}: {
  voices: PickerVoice[];
  currentId?: string;
  onSelect: (v: PickerVoice) => void;
  onClose: () => void;
  /** The agent's language (e.g. "te-IN"); previews are spoken in it unless a language filter is picked. */
  language?: string | null;
  /** The agent's pace, so the preview sounds like the real call. */
  speed?: number;
}) {
  const [query, setQuery] = useState("");
  const [gender, setGender] = useState("");
  const [language, setLanguage] = useState("");
  const [accent, setAccent] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [heard, setHeard] = useState<Record<string, boolean>>({});
  const [line, setLine] = useState("");
  const [cloneOpen, setCloneOpen] = useState(false);
  const [added, setAdded] = useState<PickerVoice[]>([]);
  const [removed, setRemoved] = useState<Record<string, boolean>>({});
  const [mineOnly, setMineOnly] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const clips = useRef<Map<string, string>>(new Map()); // preview key -> object URL
  const requestSeq = useRef(0);

  // Voices cloned in this session go first; deleted ones disappear immediately.
  const all = useMemo(() => {
    const seen = new Set(added.map((v) => v.id));
    return [...added, ...voices.filter((v) => !seen.has(v.id))]
      .filter((v) => !removed[v.id])
      .sort((a, b) => Number(!!b.custom) - Number(!!a.custom));
  }, [voices, added, removed]);
  const myCount = all.filter((v) => v.custom).length;

  async function removeVoice(v: PickerVoice) {
    if (!confirm(`Delete the cloned voice "${v.name}"? This can't be undone.`)) return;
    setDeleting(v.id);
    try {
      const res = await fetch(`/api/voices/custom/${encodeURIComponent(v.customId || v.id)}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Couldn't delete");
      setRemoved((r) => ({ ...r, [v.id]: true }));
    } catch (e: any) { alert(e.message); } finally { setDeleting(null); }
  }

  const languages = useMemo(() => {
    const set = new Set(all.map((v) => v.language).filter(Boolean) as string[]);
    return Array.from(set).sort((a, b) => languageName(a).localeCompare(languageName(b)));
  }, [all]);

  const accents = useMemo(() => {
    const set = new Set<string>();
    all.forEach((v) => (v.accents || []).forEach((a) => a.accent && set.add(a.accent)));
    return Array.from(set).sort();
  }, [all]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((v) => {
      if (mineOnly && !v.custom) return false;
      if (gender && v.gender !== gender) return false;
      if (language && v.language !== language) return false;
      if (accent && !(v.accents || []).some((a) => a.accent === accent)) return false;
      if (q && !`${v.name} ${v.tagline ?? ""} ${v.description ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [all, query, gender, language, accent, mineOnly]);

  // Preview language: the language filter if one is picked, else the agent's language, else the voice's own.
  const previewLang = (v: PickerVoice) => baseLang(language || agentLanguage || v.language);
  const hintLang = baseLang(language || agentLanguage || "en");
  const hint = SAMPLE_HINT[hintLang] ?? SAMPLE_HINT.en;

  function stop() {
    audioRef.current?.pause();
    setPlayingId(null);
  }

  async function togglePlay(v: PickerVoice) {
    if (playingId === v.id) { stop(); return; }
    if (loadingId === v.id) return;
    audioRef.current?.pause();
    setPlayingId(null);
    const lang = previewLang(v);
    const text = line.trim();
    const key = `${v.id}|${lang}|${speed}|${text}`;
    const seq = ++requestSeq.current;
    let url = clips.current.get(key);
    if (!url) {
      setLoadingId(v.id);
      try {
        const qs = new URLSearchParams({ voiceId: v.id, lang, name: v.name || "", gender: v.gender || "", speed: String(speed) });
        if (text) qs.set("text", text);
        const res = await fetch(`/api/voices/preview?${qs}`);
        if (!res.ok) throw new Error(String(res.status));
        url = URL.createObjectURL(await res.blob());
        clips.current.set(key, url);
      } catch {
        // Fall back to Cartesia's own sample clip when there is one.
        url = v.previewUrl || undefined;
        if (!url) { setFailed((f) => ({ ...f, [v.id]: true })); setLoadingId(null); return; }
      }
      setLoadingId(null);
    }
    if (seq !== requestSeq.current) return; // another voice was clicked while this one was loading
    setFailed((f) => ({ ...f, [v.id]: false }));
    if (!audioRef.current) audioRef.current = new Audio();
    audioRef.current.src = url!;
    audioRef.current.onended = () => setPlayingId(null);
    audioRef.current.play().then(() => { setPlayingId(v.id); setHeard((h) => ({ ...h, [v.id]: true })); }).catch(() => setPlayingId(null));
  }

  useEffect(() => () => {
    audioRef.current?.pause();
    clips.current.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-6" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-[640px] max-h-[80vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-line flex items-center justify-between shrink-0">
          <div className="text-[15px] font-semibold">Select a voice</div>
          <div className="flex items-center gap-3">
            <button onClick={() => setCloneOpen(true)} className="bg-signal text-white rounded-lg px-3 py-1.5 text-[12.5px] font-semibold">+ Clone a voice</button>
            <button onClick={onClose} className="text-ink-soft hover:text-ink text-lg leading-none" aria-label="Close">×</button>
          </div>
        </div>

        <div className="px-5 py-3 border-b border-line flex flex-col gap-2.5 shrink-0">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search voices…"
            className="w-full border border-line rounded-lg px-3 py-2 text-[13.5px] bg-paper outline-none focus:border-signal" />
          <div className="flex items-center gap-2">
            <select value={gender} onChange={(e) => setGender(e.target.value)}
              className="border border-line rounded-lg px-2.5 py-1.5 text-[12.5px] bg-white outline-none">
              <option value="">Any gender</option>
              {Object.entries(GENDER_LABELS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
            <select value={language} onChange={(e) => setLanguage(e.target.value)}
              className="border border-line rounded-lg px-2.5 py-1.5 text-[12.5px] bg-white outline-none">
              <option value="">Any language</option>
              {languages.map((l) => <option key={l} value={l}>{languageName(l)}</option>)}
            </select>
            <select value={accent} onChange={(e) => setAccent(e.target.value)}
              className="border border-line rounded-lg px-2.5 py-1.5 text-[12.5px] bg-white outline-none">
              <option value="">Any accent</option>
              {accents.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            {myCount > 0 && (
              <button onClick={() => setMineOnly((m) => !m)} aria-pressed={mineOnly}
                className={`border rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold ${mineOnly ? "bg-ink text-white border-ink" : "border-line text-ink-soft"}`}>My voices · {myCount}</button>
            )}
            <div className="text-[11.5px] text-ink-soft ml-auto">{filtered.length} of {all.length} voices</div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11.5px] text-ink-soft">
              Every voice says the same line, so you hear only the difference in voice. Type your own greeting to test it instead.
            </label>
            <div className="flex gap-2">
              <input value={line} onChange={(e) => setLine(e.target.value.slice(0, 240))} placeholder={hint}
                className="flex-1 min-w-0 border border-line rounded-lg px-3 py-1.5 text-[12.5px] bg-white outline-none focus:border-signal" />
              {line && <button onClick={() => setLine("")} className="text-[12px] text-ink-soft hover:text-ink px-1">Reset</button>}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {filtered.length === 0 && <div className="text-center text-[12.5px] text-ink-soft py-10">No voices match — try clearing a filter.</div>}
          {filtered.map((v) => (
            <div key={v.id} onClick={() => onSelect(v)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-paper ${currentId === v.id ? "bg-signal-tint" : ""}`}>
              <button onClick={(e) => { e.stopPropagation(); togglePlay(v); }}
                aria-label={playingId === v.id ? `Stop ${v.name}` : `Play ${v.name}`}
                className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${playingId === v.id ? "bg-signal text-white" : heard[v.id] ? "bg-ink/70 text-white" : "bg-ink text-white hover:bg-signal"}`}>
                {loadingId === v.id ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="animate-spin"><path d="M12 3a9 9 0 1 0 9 9" strokeLinecap="round"/></svg>
                ) : playingId === v.id ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>
                )}
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-semibold truncate">
                  {v.name}{v.tagline ? <span className="font-normal text-ink-soft"> — {v.tagline}</span> : null}
                </div>
                {failed[v.id]
                  ? <div className="text-[12px] text-miss mt-0.5">Couldn&apos;t play this voice — try again.</div>
                  : v.description && <div className="text-[12px] text-ink-soft mt-0.5 truncate">{v.description}</div>}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {v.custom && <span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded bg-signal-tint text-signal">Cloned</span>}
                {v.custom && (
                  <button onClick={(e) => { e.stopPropagation(); removeVoice(v); }} disabled={deleting === v.id}
                    className="text-[11px] text-ink-soft hover:text-miss font-semibold px-1 disabled:opacity-40" aria-label={`Delete ${v.name}`}>
                    {deleting === v.id ? "…" : "Delete"}
                  </button>
                )}
                {v.country && <span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded bg-paper border border-line text-ink-soft">{v.country}</span>}
                {playingId === v.id && <span className="text-[10.5px] font-semibold text-signal">Playing</span>}
                {currentId === v.id && <span className="text-signal">✓</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
      {cloneOpen && (
        <VoiceCloneModal
          defaultLanguage={language || agentLanguage}
          onClose={() => setCloneOpen(false)}
          onAdded={(v) => {
            const pv: PickerVoice = { ...v, country: null, previewUrl: null, accents: [], custom: true };
            setAdded((a) => (a.some((x) => x.id === pv.id) ? a : [pv, ...a]));
          }}
          onCreated={(v) => {
            setCloneOpen(false);
            onSelect({ ...v, country: null, previewUrl: null, accents: [], custom: true });
          }}
        />
      )}
    </div>
  );
}
