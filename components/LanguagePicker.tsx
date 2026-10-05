"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TALK_LANGS, type TalkLang } from "@/app/landing/talkContent";

/** One compact button that opens every language Rana speaks (Indian and global) to pick from. */
export default function LanguagePicker({ value, onChange, globalFirst = false, testId = "lang-picker" }: {
  value: string; onChange: (code: TalkLang) => void; globalFirst?: boolean; testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open]);
  const cur = TALK_LANGS.find((l) => l.code === value) || TALK_LANGS[0];
  const groups: [string, typeof TALK_LANGS][] = [["Indian languages", TALK_LANGS.filter((l) => l.indian)], ["Global languages", TALK_LANGS.filter((l) => !l.indian)]];
  if (globalFirst) groups.reverse();
  const pick = (c: TalkLang) => { onChange(c); setOpen(false); };
  return (
    <div ref={box} className="relative inline-block" data-testid={testId}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-white/15 bg-white/[.04] px-4 py-2 text-[14px] hover:border-signal/60">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg>
        <span className="font-semibold">{cur.label}</span>{cur.label !== cur.name && <span className="text-ink-soft text-[12.5px]">{cur.name}</span>}
        <span className="text-ink-soft text-[11px]">{open ? "▲" : "▼"}</span>
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
        <div role="listbox" aria-label="Language" className="relative w-full max-w-[480px] max-h-[80vh] overflow-y-auto overscroll-contain rounded-2xl border border-white/10 bg-[#0d121b] shadow-2xl p-4" data-testid="lang-sheet">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[15px] font-semibold">Choose a language</div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="w-8 h-8 rounded-full border border-white/10 text-ink-soft hover:text-ink text-[18px] leading-none">&times;</button>
          </div>
          {groups.map(([title, list]) => (
            <div key={title} className="mb-3 last:mb-0">
              <div className="font-mono text-[10.5px] tracking-[0.14em] text-ink-soft/80 mb-2">{title.toUpperCase()}</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {list.map((l) => (
                  <button key={l.code} type="button" role="option" aria-selected={l.code === value} onClick={() => pick(l.code)} data-testid={`lang-${l.code}`}
                    className={`text-left rounded-xl border px-3 py-2 ${l.code === value ? "border-signal/60 bg-signal/10" : "border-white/10 hover:border-white/30"}`}>
                    <div className={`text-[14px] ${l.code === value ? "text-signal font-semibold" : ""}`}>{l.label}</div>
                    {l.label !== l.name && <div className="text-[11px] text-ink-soft">{l.name}</div>}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="text-[11.5px] text-ink-soft mt-2">Rana starts the conversation in this language.</div>
        </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
