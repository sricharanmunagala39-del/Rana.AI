// @ts-nocheck
"use client";

import { useMemo, useState } from "react";

export type PickerModelPricing = {
  currency: string;
  inputPerM: string;
  outputPerM: string;
  cacheReadPerM: string;
  cacheWritePerM: string;
};

export type PickerModel = {
  id: string;
  name: string;
  provider?: string | null;
  description?: string | null;
  avgLatencyMs?: number | null;
  pricing?: PickerModelPricing | null;
};

function money(v?: string | null) {
  if (v == null) return "—";
  const n = parseFloat(v);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : v;
}

export default function ModelPickerModal({
  models,
  currentId,
  onSelect,
  onClose,
}: {
  models: PickerModel[];
  currentId?: string;
  onSelect: (m: PickerModel) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("");

  const providers = useMemo(() => {
    const set = new Set(models.map((m) => m.provider).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [models]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return models.filter((m) => {
      if (provider && m.provider !== provider) return false;
      if (q && !`${m.name} ${m.provider ?? ""} ${m.description ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [models, query, provider]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-6" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-[680px] max-h-[80vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-line flex items-center justify-between shrink-0">
          <div className="text-[15px] font-semibold">Select a model</div>
          <button onClick={onClose} className="text-ink-soft hover:text-ink text-lg leading-none">×</button>
        </div>

        <div className="px-5 py-3 border-b border-line flex flex-col gap-2.5 shrink-0">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search models…"
            className="w-full border border-line rounded-lg px-3 py-2 text-[13.5px] bg-paper outline-none focus:border-signal" />
          <div className="flex items-center gap-2">
            <select value={provider} onChange={(e) => setProvider(e.target.value)}
              className="border border-line rounded-lg px-2.5 py-1.5 text-[12.5px] bg-white outline-none">
              <option value="">Any provider</option>
              {providers.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <div className="text-[11.5px] text-ink-soft ml-auto">{filtered.length} of {models.length} models</div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {filtered.length === 0 && <div className="text-center text-[12.5px] text-ink-soft py-10">No models match — try clearing a filter.</div>}
          {filtered.map((m) => (
            <div key={m.id} onClick={() => onSelect(m)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-paper ${currentId === m.id ? "bg-signal-tint" : ""}`}>
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-semibold truncate">
                  {m.name}{m.provider ? <span className="font-normal text-ink-soft"> — {m.provider}</span> : null}
                </div>
                {m.description && <div className="text-[12px] text-ink-soft mt-0.5 truncate">{m.description}</div>}
                {m.pricing && (
                  <div className="text-[11px] text-ink-soft mt-1 font-mono">
                    in {money(m.pricing.inputPerM)}/M · out {money(m.pricing.outputPerM)}/M
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {typeof m.avgLatencyMs === "number" && (
                  <span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded bg-paper border border-line text-ink-soft">{m.avgLatencyMs}ms</span>
                )}
                {currentId === m.id && <span className="text-signal">✓</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
