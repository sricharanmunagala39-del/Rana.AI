"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

/** "Get set up" card on the client dashboard until every step is done (or dismissed). */
export default function SetupChecklist() {
  const [d, setD] = useState<any>(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try { if (localStorage.getItem("rana_setup_hidden") === "1") setHidden(true); } catch {}
    fetch("/api/account/setup").then((r) => (r.ok ? r.json() : null)).then(setD).catch(() => {});
  }, []);
  if (!d || d.done || hidden || !d.items?.length) return null;
  const pct = Math.round((d.completed / d.items.length) * 100);
  return (
    <div className="border border-line rounded-xl bg-raised p-5 flex flex-col gap-3" data-testid="setup-checklist">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[15px] font-semibold">Get set up — {d.completed} of {d.items.length} done</div>
          <div className="text-[12px] text-ink-soft">Finish these and your AI employees are ready to call.</div>
        </div>
        <button onClick={() => { setHidden(true); try { localStorage.setItem("rana_setup_hidden", "1"); } catch {} }} className="text-[12px] text-ink-soft">Hide</button>
      </div>
      <div className="h-2 rounded-full bg-paper overflow-hidden"><div className="h-full bg-signal" style={{ width: `${pct}%` }} /></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
        {d.items.map((i: any) => (
          <Link key={i.key} href={i.href} className={`flex items-center gap-2 text-[13px] rounded-lg px-2 py-1.5 hover:bg-paper ${i.done ? "text-ink-soft line-through" : "font-semibold"}`}>
            <span className={`w-4 h-4 rounded-full border flex items-center justify-center text-[10px] ${i.done ? "bg-signal border-signal text-on-accent" : "border-line"}`}>{i.done ? "✓" : ""}</span>
            {i.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
