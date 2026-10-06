"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { R1_LANGS, R1_USECASES, r1Blurb, type R1Voice } from "@/lib/sarvamVoiceCatalog";

export type R1Row = R1Voice & { live: boolean; sample: boolean; agent?: string; wanted?: number; builtin?: boolean };

const chip = (on: boolean) => `rounded-full border px-3 py-1 text-[12.5px] whitespace-nowrap ${on ? "bg-ink text-paper border-ink font-semibold" : "border-line text-ink-soft hover:text-ink"}`;

/**
 * Every R1 voice (v3 + v4) with search and filters: gender, version, language, use case.
 * Used by the employee builder (pick a voice) and RANA HQ (connect voices to agents, via `extra`).
 */
export default function R1VoiceBrowser({ voices, selected, onSelect, lang = "en", extra, sortWanted = false }: {
  voices: R1Row[]; selected?: string | null; onSelect?: (v: R1Row) => void; lang?: string;
  extra?: (v: R1Row) => ReactNode; sortWanted?: boolean;
}) {
  const [q, setQ] = useState("");
  const [gender, setGender] = useState<"" | "feminine" | "masculine">("");
  const [model, setModel] = useState<0 | 3 | 4>(0);
  const [language, setLanguage] = useState("");
  const [usecase, setUsecase] = useState("");
  const [liveOnly, setLiveOnly] = useState(false);
  const [limit, setLimit] = useState(48);
  const [playing, setPlaying] = useState("");
  const [noSample, setNoSample] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => { audio.current?.pause(); }, []);
  useEffect(() => { setLimit(48); }, [q, gender, model, language, usecase, liveOnly]);

  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const out = voices.filter((v) => {
      if (gender && v.gender !== gender) return false;
      if (model && v.model !== model) return false;
      if (language && !v.langs.includes(language)) return false;
      if (usecase && v.usecase !== usecase) return false;
      if (liveOnly && !v.live) return false;
      const hay = `${v.name} ${v.usecase} ${v.tone} ${v.best} ${v.langs.join(" ")}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    if (sortWanted) out.sort((a, b) => (b.wanted || 0) - (a.wanted || 0) || Number(a.live) - Number(b.live));
    return out;
  }, [voices, q, gender, model, language, usecase, liveOnly, sortWanted]);

  async function play(v: R1Row) {
    if (playing === v.id) { audio.current?.pause(); setPlaying(""); return; }
    audio.current?.pause(); setNoSample("");
    if (!v.sample) { setNoSample(v.id); return; }
    setPlaying(v.id);
    try {
      const r = await fetch(`/api/voices/preview?${new URLSearchParams({ engine: "sarvam", voice: v.id, lang })}`);
      if (!r.ok) throw new Error();
      const a = new Audio(URL.createObjectURL(await r.blob())); audio.current = a;
      a.onended = () => setPlaying(""); a.onerror = () => setPlaying("");
      await a.play();
    } catch { setPlaying(""); setNoSample(v.id); }
  }

  const counts = { all: voices.length, v3: voices.filter((v) => v.model === 3).length, v4: voices.filter((v) => v.model === 4).length, live: voices.filter((v) => v.live).length };
  return (
    <div className="flex flex-col gap-3" data-testid="r1-browser">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: Telugu, support, calm, Kavitha…" className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-[13.5px] outline-none focus:border-signal" data-testid="r1-search" />
      <div className="flex flex-wrap gap-1.5">
        {([["", "Any gender"], ["feminine", "Female"], ["masculine", "Male"]] as const).map(([g, l]) => <button key={l} type="button" onClick={() => setGender(g)} className={chip(gender === g)}>{l}</button>)}
        <span className="w-2" />
        {([[0, `All versions (${counts.all})`], [3, `v3 (${counts.v3})`], [4, `v4 (${counts.v4})`]] as const).map(([m, l]) => <button key={l} type="button" onClick={() => setModel(m)} className={chip(model === m)} data-testid={`r1-model-${m}`}>{l}</button>)}
        <span className="w-2" />
        <button type="button" onClick={() => setLiveOnly((x) => !x)} className={chip(liveOnly)} data-testid="r1-live-only">Ready now ({counts.live})</button>
      </div>
      <div className="flex flex-wrap gap-2">
        <select value={language} onChange={(e) => setLanguage(e.target.value)} className="rounded-lg border border-line bg-paper px-2.5 py-1.5 text-[12.5px]" data-testid="r1-lang" aria-label="Best language">
          <option value="">Best in any language</option>
          {R1_LANGS.map((l) => <option key={l} value={l}>Best in {l}</option>)}
        </select>
        <select value={usecase} onChange={(e) => setUsecase(e.target.value)} className="rounded-lg border border-line bg-paper px-2.5 py-1.5 text-[12.5px]" data-testid="r1-usecase" aria-label="Use case">
          <option value="">Any use</option>
          {R1_USECASES.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
        <span className="text-[12px] text-ink-soft self-center" data-testid="r1-count">{list.length} of {voices.length} voices</span>
      </div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
        {list.slice(0, limit).map((v) => {
          const on = selected === v.id;
          return (
            <div key={v.id} data-testid={`r1-voice-${v.id}`} className={`border rounded-xl p-3 flex flex-col gap-2 bg-paper ${on ? "border-signal ring-1 ring-signal" : "border-line"}`}>
              <div className="flex items-start gap-2.5">
                <button type="button" onClick={() => play(v)} className={`shrink-0 w-8 h-8 rounded-full grid place-items-center text-[12px] ${v.sample ? "bg-signal text-on-accent" : "border border-line text-ink-soft"}`} aria-label={`Hear ${v.name}`}>{playing === v.id ? "❚❚" : "▶"}</button>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold leading-snug">{v.first}{v.role && <span className="font-normal text-ink-soft"> · {v.role}</span>}</div>
                  <div className="text-[11.5px] text-ink-soft leading-snug">{r1Blurb(v)}</div>
                  <div className="text-[11px] text-ink-soft mt-0.5">Best in {v.langs.join(", ") || "Hindi"}{v.intl ? " · Western accent" : ""}{v.best ? ` · for ${v.best}` : ""}</div>
                </div>
                <span className={`shrink-0 text-[10px] font-mono rounded-full px-1.5 py-0.5 border ${v.live ? "text-signal border-signal/50" : "text-ink-soft border-line"}`}>{v.live ? "READY" : "ON REQUEST"}</span>
              </div>
              {noSample === v.id && <div className="text-[11.5px] text-ink-soft">No sample for this one yet — pick it and use Test call to hear it.</div>}
              {typeof v.wanted === "number" && v.wanted > 0 && <div className="text-[11.5px] text-hot">Picked by {v.wanted} employee{v.wanted > 1 ? "s" : ""}</div>}
              {onSelect && <button type="button" onClick={() => onSelect(v)} className={`self-start rounded-lg border px-3 py-1 text-[12.5px] font-semibold ${on ? "border-signal text-signal" : "border-line hover:border-signal"}`} data-testid={`r1-pick-${v.id}`}>{on ? "✓ Selected" : "Use this voice"}</button>}
              {extra?.(v)}
            </div>
          );
        })}
      </div>
      {list.length > limit && <button type="button" onClick={() => setLimit((n) => n + 60)} className="self-center rounded-lg border border-line px-4 py-1.5 text-[13px] font-semibold" data-testid="r1-more">Show more ({list.length - limit} left)</button>}
      {list.length === 0 && <div className="text-[13px] text-ink-soft">No voices match. Clear a filter.</div>}
    </div>
  );
}
