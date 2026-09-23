// @ts-nocheck
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type PickerVoice = {
  id: string;
  name: string;
  tagline?: string | null;
  description?: string | null;
  language?: string | null;
  gender?: string | null;
  country?: string | null;
  previewUrl?: string | null;
};

const GENDER_LABELS: Record<string, string> = {
  feminine: "Feminine",
  masculine: "Masculine",
  gender_neutral: "Gender neutral",
};

export default function VoicePickerModal({
  voices,
  currentId,
  onSelect,
  onClose,
}: {
  voices: PickerVoice[];
  currentId?: string;
  onSelect: (v: PickerVoice) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [gender, setGender] = useState("");
  const [language, setLanguage] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const languages = useMemo(() => {
    const set = new Set(voices.map((v) => v.language).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [voices]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return voices.filter((v) => {
      if (gender && v.gender !== gender) return false;
      if (language && v.language !== language) return false;
      if (q && !`${v.name} ${v.tagline ?? ""} ${v.description ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [voices, query, gender, language]);

  function togglePlay(v: PickerVoice) {
    if (!v.previewUrl) return;
    if (playingId === v.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    if (!audioRef.current) audioRef.current = new Audio();
    audioRef.current.src = v.previewUrl;
    audioRef.current.onended = () => setPlayingId(null);
    audioRef.current.play().catch(() => setPlayingId(null));
    setPlayingId(v.id);
  }

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-6" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-[640px] max-h-[80vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-line flex items-center justify-between shrink-0">
          <div className="text-[15px] font-semibold">Select a voice</div>
          <button onClick={onClose} className="text-ink-soft hover:text-ink text-lg leading-none">×</button>
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
              {languages.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            <div className="text-[11.5px] text-ink-soft ml-auto">{filtered.length} of {voices.length} voices</div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {filtered.length === 0 && <div className="text-center text-[12.5px] text-ink-soft py-10">No voices match — try clearing a filter.</div>}
          {filtered.map((v) => (
            <div key={v.id} onClick={() => onSelect(v)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-paper ${currentId === v.id ? "bg-signal-tint" : ""}`}>
              <button onClick={(e) => { e.stopPropagation(); togglePlay(v); }} disabled={!v.previewUrl}
                className="w-9 h-9 rounded-full bg-ink text-white flex items-center justify-center shrink-0 disabled:opacity-25">
                {playingId === v.id ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>
                )}
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-semibold truncate">
                  {v.name}{v.tagline ? <span className="font-normal text-ink-soft"> — {v.tagline}</span> : null}
                </div>
                {v.description && <div className="text-[12px] text-ink-soft mt-0.5 truncate">{v.description}</div>}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {v.country && <span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded bg-paper border border-line text-ink-soft">{v.country}</span>}
                {currentId === v.id && <span className="text-signal">✓</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
