// @ts-nocheck
"use client";
// Small building blocks for the Script Studio cards.

import { useEffect, useRef } from "react";

export function AutoText({ value, onChange, placeholder, rows = 1, className = "", ...rest }: any) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea ref={ref} value={value} rows={rows} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
      className={`w-full resize-none outline-none bg-transparent leading-relaxed ${className}`} {...rest} />
  );
}

export function Card({ title, hint, badge, children, tone = "default", right, testId }: any) {
  const toneCls = tone === "warn" ? "border-hot/40 bg-hot-tint/40" : "border-line bg-white";
  return (
    <div className={`border rounded-xl p-4 ${toneCls}`} data-testid={testId}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <div className="text-[13px] font-semibold flex items-center gap-2">
            {title}
            {badge != null && <span className="text-[10.5px] font-semibold text-ink-soft bg-paper border border-line rounded-full px-1.5">{badge}</span>}
          </div>
          {hint && <div className="text-[11.5px] text-ink-soft mt-0.5">{hint}</div>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

/** Editable list of short lines (questions, pitch points, facts, "never" rules). */
export function ListEditor({ items, onChange, placeholder, addLabel = "+ Add", numbered = false, testId }: any) {
  const set = (i: number, v: string) => onChange(items.map((x: string, k: number) => (k === i ? v : x)));
  const del = (i: number) => onChange(items.filter((_: any, k: number) => k !== i));
  const move = (i: number, d: number) => {
    const j = i + d; if (j < 0 || j >= items.length) return;
    const n = [...items]; [n[i], n[j]] = [n[j], n[i]]; onChange(n);
  };
  return (
    <div className="flex flex-col gap-1.5" data-testid={testId}>
      {items.map((it: string, i: number) => (
        <div key={i} className="group flex items-start gap-2 border-b border-line/70 focus-within:border-signal">
          <span className="text-ink-soft text-[12px] mt-[7px] w-4 shrink-0 text-right">{numbered ? `${i + 1}.` : "•"}</span>
          <AutoText value={it} onChange={(v: string) => set(i, v)} placeholder={placeholder} className="text-[13.5px] py-1" />
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 shrink-0 mt-1">
            {numbered && <button type="button" onClick={() => move(i, -1)} className="text-[10px] text-ink-soft px-0.5" aria-label="Move up">▲</button>}
            {numbered && <button type="button" onClick={() => move(i, 1)} className="text-[10px] text-ink-soft px-0.5" aria-label="Move down">▼</button>}
            <button type="button" onClick={() => del(i)} className="text-miss text-[11px] font-semibold px-1" aria-label="Remove">✕</button>
          </div>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, ""])} className="text-[12.5px] font-semibold text-signal text-left mt-1">{addLabel}</button>
    </div>
  );
}

/** Editable list of pairs: objection → response, question → answer. */
export function PairEditor({ items, onChange, left, right, leftKey, rightKey, leftPh, rightPh, addLabel, testId }: any) {
  const set = (i: number, k: string, v: string) => onChange(items.map((x: any, j: number) => (j === i ? { ...x, [k]: v } : x)));
  const del = (i: number) => onChange(items.filter((_: any, j: number) => j !== i));
  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      {items.map((it: any, i: number) => (
        <div key={i} className="border border-line rounded-lg p-3 bg-paper/40 relative group">
          <button type="button" onClick={() => del(i)} className="absolute top-2 right-2 text-miss text-[11px] font-semibold opacity-60 hover:opacity-100" aria-label="Remove">✕</button>
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-soft">{left}</div>
          <AutoText value={it[leftKey]} onChange={(v: string) => set(i, leftKey, v)} placeholder={leftPh} className="text-[13.5px] font-medium pr-6" />
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-signal mt-2">{right}</div>
          <AutoText value={it[rightKey]} onChange={(v: string) => set(i, rightKey, v)} placeholder={rightPh} className="text-[13.5px]" />
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, { [leftKey]: "", [rightKey]: "" }])} className="text-[12.5px] font-semibold text-signal text-left">{addLabel}</button>
    </div>
  );
}

export function Spinner({ className = "" }: any) {
  return <span className={`inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin ${className}`} />;
}
