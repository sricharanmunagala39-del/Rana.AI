"use client";
import { useEffect, useRef } from "react";

/** Full-screen "Approved ✓" confirmation shown in RANA HQ after a sign-up is approved. Closes by itself or on click/Esc. */
export default function ApprovedOverlay({ name, onClose }: { name: string; onClose: () => void }) {
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const t = setTimeout(() => close.current(), 2800);
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") close.current(); };
    window.addEventListener("keydown", k);
    return () => { clearTimeout(t); window.removeEventListener("keydown", k); };
  }, []);
  return (
    <div role="status" aria-live="polite" onClick={onClose} data-testid="approved-overlay"
      className="approved-overlay fixed inset-0 z-[200] flex flex-col items-center justify-center gap-5 bg-paper/85 backdrop-blur-md cursor-pointer px-6 text-center">
      <svg viewBox="0 0 120 120" className="w-40 h-40 sm:w-48 sm:h-48" aria-hidden="true">
        <circle cx="60" cy="60" r="54" className="approved-ring" fill="rgb(var(--c-signal) / .12)" stroke="rgb(var(--c-signal))" strokeWidth="5" />
        <path d="M36 62 L53 78 L85 44" className="approved-tick" fill="none" stroke="rgb(var(--c-signal))" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="approved-text flex flex-col gap-1.5">
        <div className="font-display text-[40px] sm:text-[52px] font-semibold tracking-tight text-signal">Approved</div>
        <div className="text-[16px] sm:text-[18px] text-ink font-semibold">{name}</div>
        <div className="text-[13.5px] text-ink-soft">14-day free trial is on · welcome email sent</div>
      </div>
      <div className="text-[11.5px] text-ink-soft mt-2">Click anywhere to close</div>
    </div>
  );
}
