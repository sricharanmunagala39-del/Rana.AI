"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";

const STATUS: [string, string, string][] = [
  ["new", "New — call back", "text-hot border-hot/50 bg-hot/10"],
  ["contacted", "Contacted", "text-ink border-line"],
  ["demo_booked", "Demo booked", "text-signal border-signal/50 bg-signal/10"],
  ["won", "Won", "text-signal border-signal bg-signal/20"],
  ["lost", "Lost", "text-ink-soft border-line"],
];
const WANTS: Record<string, string> = { answer: "Answer calls", call: "Call leads", both: "Answer + call" };
const when = (d: string) => {
  const s = (Date.now() - Date.parse(d)) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

/** RANA HQ → Demo requests from the website's "Book a demo" form. */
export default function HqDemosPage() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("open");
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = () => fetch("/api/hq/demos").then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setRows(j.rows); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, []);

  async function save(id: string, body: any) {
    const r = await fetch("/api/hq/demos", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }) });
    const j = await r.json(); if (!r.ok) { setErr(j.error); return; }
    setRows((xs) => (xs || []).map((x) => (x.id === id ? j.row : x)));
  }

  const shown = (rows || []).filter((r) => filter === "all" || (filter === "open" ? ["new", "contacted", "demo_booked"].includes(r.status) : r.status === filter));
  const count = (s: string) => (rows || []).filter((r) => r.status === s).length;

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar active="hq" />
      <div className="flex-1 p-6 md:p-10 min-w-0">
        <div className="max-w-[1100px] flex flex-col gap-5">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-signal"><Link href="/hq">RANA HQ</Link> · Demo requests</div>
            <div className="text-[22px] font-display font-semibold">People who asked for a demo</div>
            <div className="text-[13px] text-ink-soft mt-0.5">From the “Book a demo” form on ranaai.in. You also get an email for each one. Call new requests within the hour.</div>
          </div>
          {err && <div className="text-[13px] text-miss">{err}</div>}
          <div className="flex flex-wrap gap-2 text-[12.5px]">
            {[["open", `Open (${count("new") + count("contacted") + count("demo_booked")})`], ["new", `New (${count("new")})`], ["demo_booked", `Demo booked (${count("demo_booked")})`], ["won", `Won (${count("won")})`], ["lost", `Lost (${count("lost")})`], ["all", `All (${(rows || []).length})`]].map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)} className={`rounded-full border px-3 py-1 ${filter === k ? "bg-ink text-paper border-ink font-semibold" : "border-line text-ink-soft hover:text-ink"}`}>{l}</button>
            ))}
          </div>
          {!rows && !err && <div className="text-[13px] text-ink-soft">Loading…</div>}
          {rows && shown.length === 0 && <div className="border border-dashed border-line rounded-xl p-6 text-[13px] text-ink-soft">Nothing here yet. New requests from the website appear here and in your inbox.</div>}
          <div className="flex flex-col gap-3" data-testid="demo-list">
            {shown.map((r) => {
              const st = STATUS.find((s) => s[0] === r.status) || STATUS[0];
              return (
                <div key={r.id} className="border border-line rounded-xl bg-raised p-4 flex flex-col gap-2.5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-[15px] font-semibold">{r.company} <span className="text-ink-soft font-normal">· {r.name}</span></div>
                      <div className="text-[13px] mt-0.5 flex flex-wrap gap-x-3">
                        <a href={`tel:${r.phone}`} className="text-signal font-semibold">📞 {r.phone}</a>
                        {r.email && <a href={`mailto:${r.email}`} className="text-signal">✉️ {r.email}</a>}
                        <span className="text-ink-soft">{when(r.created_at)}{r.best_time ? ` · best time: ${r.best_time}` : ""}</span>
                      </div>
                    </div>
                    <span className={`text-[11.5px] font-semibold border rounded-full px-2.5 py-0.5 ${st[2]}`}>{st[1]}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[12px]">
                    {r.industry && <span className="rounded-md bg-sunken px-2 py-0.5">{r.industry}</span>}
                    {r.wants && <span className="rounded-md bg-sunken px-2 py-0.5">{WANTS[r.wants] || r.wants}</span>}
                    {(r.languages || []).length > 0 && <span className="rounded-md bg-sunken px-2 py-0.5">{r.languages.join(", ")}</span>}
                    {r.volume && <span className="rounded-md bg-sunken px-2 py-0.5">{r.volume}</span>}
                  </div>
                  {r.message && <div className="text-[13px] text-ink-soft">“{r.message}”</div>}
                  <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-line/60">
                    <select value={r.status} onChange={(e) => save(r.id, { status: e.target.value })} className="border border-line rounded-lg px-2 py-1 text-[12.5px] bg-sunken" aria-label="Status">
                      {STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                    <input value={notes[r.id] ?? r.note ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))} placeholder="Note (e.g. demo Tue 4 pm, wants Telugu + Hindi)" className="flex-1 min-w-[200px] border border-line rounded-lg px-2.5 py-1 text-[12.5px] bg-sunken" />
                    {notes[r.id] !== undefined && notes[r.id] !== (r.note ?? "") && <button onClick={() => save(r.id, { note: notes[r.id] })} className="text-[12.5px] font-semibold text-signal">Save note</button>}
                    {r.updated_by && <span className="text-[11px] text-ink-soft">updated {when(r.updated_at)} by {r.updated_by}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
