"use client";

import { useMemo, useState } from "react";
import { analyse, parseText, readXlsx, FIELD_LABELS, type FieldKey, type Contact, type ImportResult } from "@/lib/leadImport";

const input = "border border-line rounded-lg px-3 py-2 text-[13px] bg-paper outline-none focus:border-signal";
const SAMPLE = `Customer Name,Mobile,Program,Counsellor
Dr Priya Reddy,98480 12345,NEET PG,Anita
RAHUL VARMA,+91 90000 54321,FMGE,Anita
Sita,09848012346 / 9000012345,NEET PG,Raj`;
const PICKABLE: FieldKey[] = ["name", "first_name", "last_name", "phone", "alt_phone", "email", "course", "status", "owner", "date", "city", "extra", "ignore"];
const fmt = (n: number) => n.toLocaleString("en-IN");

/**
 * Paste or upload a lead list (CSV or Excel), see what RANA understood and what it would correct,
 * and approve it. Nothing reaches the campaign until the user presses Approve.
 */
export default function LeadListImport({ onApproved }: { onApproved: (contacts: Contact[] | null) => void }) {
  const [rows, setRows] = useState<string[][]>([]);
  const [source, setSource] = useState("");
  const [paste, setPaste] = useState("");
  const [override, setOverride] = useState<Record<number, FieldKey>>({});
  const [tidyNames, setTidyNames] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);
  const [readError, setReadError] = useState("");
  const [reading, setReading] = useState(false);

  const result: ImportResult | null = useMemo(() => (rows.length ? analyse(rows, override, { tidyNames }) : null), [rows, override, tidyNames]);

  function reset(next: string[][], src: string) {
    setRows(next); setSource(src); setOverride({}); setApproved(false); setOpen(null); onApproved(null);
  }
  function change(fn: () => void) { fn(); setApproved(false); onApproved(null); }

  async function onFile(f?: File | null) {
    if (!f) return;
    setReadError(""); setReading(true);
    try {
      const lower = f.name.toLowerCase();
      if (lower.endsWith(".xls")) throw new Error("Old .xls files can't be read — in Excel choose File → Save As → Excel Workbook (.xlsx) or CSV, then upload again.");
      if (f.size > 15 * 1024 * 1024) throw new Error("That file is over 15 MB — split it into smaller lists.");
      const data = lower.endsWith(".xlsx") || lower.endsWith(".xlsm") ? await readXlsx(await f.arrayBuffer()) : parseText(await f.text());
      if (!data.some((r) => r.some((c) => String(c).trim()))) throw new Error("That file is empty.");
      setPaste(""); reset(data, f.name);
    } catch (e: any) { setReadError(e?.message || "Couldn't read that file."); }
    finally { setReading(false); }
  }

  function downloadProblems() {
    if (!result) return;
    const lines = [["Row", "Problem"], ...result.problems.map((p) => [String(p.row), p.detail])];
    const csv = lines.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "list-problems.csv"; a.click(); URL.revokeObjectURL(url);
  }

  const c = result?.counts;
  const nameCol = result?.columns.find((g) => g.field === "name") || result?.columns.find((g) => g.field === "first_name");
  const phoneCol = result?.columns.find((g) => g.field === "phone");
  const rowsOf = (kinds: string[]) => [
    ...(result?.problems.filter((p) => kinds.includes(p.kind)).map((p) => ({ row: p.row, text: p.detail })) || []),
    ...(result?.fixes.filter((f) => kinds.includes(f.kind)).map((f) => ({ row: f.row, text: `${f.field}: “${f.from}” → “${f.to}”` })) || []),
  ].sort((a, b) => a.row - b.row);

  const checks: { key: string; tone: "ok" | "warn" | "info" | "bad"; text: React.ReactNode; kinds?: string[]; toggle?: boolean }[] = [];
  if (result) {
    checks.push(phoneCol ? { key: "phone", tone: "ok", text: <>Phone numbers found in <b>{phoneCol.header}</b></> } : { key: "phone", tone: "bad", text: <>No phone column found — pick it in the columns above</> });
    checks.push(nameCol ? { key: "name", tone: "ok", text: <>Names found in <b>{nameCol.header}</b>{result.columns.some((g) => g.field === "last_name") ? " + last name" : ""}</> } : { key: "name", tone: "warn", text: <>No name column — people will be called without their name. Pick it above if there is one.</> });
    if (c!.duplicate) checks.push({ key: "dup", tone: "warn", text: <>{fmt(c!.duplicate)} duplicate number{c!.duplicate > 1 ? "s" : ""} — each person is called once (first row kept)</>, kinds: ["duplicate"] });
    if (c!.invalid_phone) checks.push({ key: "inv", tone: "bad", text: <>{fmt(c!.invalid_phone)} invalid phone number{c!.invalid_phone > 1 ? "s" : ""} — left out</>, kinds: ["invalid_phone"] });
    if (c!.missing_phone) checks.push({ key: "nophone", tone: "bad", text: <>{fmt(c!.missing_phone)} row{c!.missing_phone > 1 ? "s" : ""} with no phone number — left out</>, kinds: ["missing_phone"] });
    if (c!.missing_name && nameCol) checks.push({ key: "noname", tone: "warn", text: <>{fmt(c!.missing_name)} without a name — called without one</>, kinds: ["missing_name"] });
    if (c!.phone_format) checks.push({ key: "fmt", tone: "info", text: <>{fmt(c!.phone_format)} number{c!.phone_format > 1 ? "s" : ""} written in calling format (+91…) — spaces, 0, 91 or Excel's 9.8E+09 style removed; the number itself doesn't change</>, kinds: ["phone_format"] });
    if (c!.second_number) checks.push({ key: "two", tone: "info", text: <>{fmt(c!.second_number)} cell{c!.second_number > 1 ? "s have" : " has"} two numbers — the first is dialled, the second is kept as {"{{second_phone}}"}</>, kinds: ["second_number"] });
    if (c!.name_from_parts) checks.push({ key: "parts", tone: "info", text: <>First + last name joined into one name for {fmt(c!.name_from_parts)} row{c!.name_from_parts > 1 ? "s" : ""}</>, kinds: ["name_from_parts"] });
    if (c!.name_case || c!.spaces) checks.push({ key: "tidy", tone: "info", toggle: true, text: <>Tidy {fmt(c!.name_case + c!.spaces)} name{c!.name_case + c!.spaces > 1 ? "s" : ""} (e.g. “RAVI  KUMAR” → “Ravi Kumar”)</>, kinds: ["name_case", "spaces"] });
    if (c!.bad_email) checks.push({ key: "email", tone: "warn", text: <>{fmt(c!.bad_email)} email{c!.bad_email > 1 ? "s look" : " looks"} wrong — kept as is</>, kinds: ["bad_email"] });
    if (result.emptyRows) checks.push({ key: "empty", tone: "info", text: <>{fmt(result.emptyRows)} empty row{result.emptyRows > 1 ? "s" : ""} skipped</> });
  }
  const icon = { ok: <span className="text-signal">✓</span>, warn: <span className="text-hot">!</span>, bad: <span className="text-miss">✕</span>, info: <span className="text-ink-soft">i</span> };
  const ready = result?.ready.length || 0;
  const tooMany = ready > 5000;
  const vars = result ? Array.from(new Set(result.ready.flatMap((r) => Object.keys(r.variables)))) : [];

  return (
    <div className="flex flex-col gap-3" data-testid="lead-import">
      <div className="text-[12.5px] text-ink-soft">Upload an Excel or CSV file, or paste straight from Excel / Google Sheets. Any column names work — RANA works out which is the name, phone, course, counsellor and so on, checks every row and shows you what it would fix before anything is used.</div>
      <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
        <label className="bg-ink text-paper rounded-lg px-3.5 py-2 font-semibold cursor-pointer">{reading ? "Reading…" : "Upload Excel or CSV"}
          <input type="file" accept=".xlsx,.xlsm,.xls,.csv,.txt,.tsv" className="hidden" data-testid="lead-file" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        <span className="text-ink-soft">or paste below</span>
        <button type="button" onClick={() => { setPaste(SAMPLE); reset(parseText(SAMPLE), "sample"); }} className="text-ink-soft hover:text-ink underline">Try a sample</button>
        {source && source !== "sample" && <span className="text-ink-soft">· {source}</span>}
      </div>
      {readError && <div className="text-[12.5px] text-miss bg-miss-tint border border-miss/20 rounded-lg px-3 py-2">{readError}</div>}
      <textarea value={paste} rows={paste ? 5 : 3} placeholder={SAMPLE} data-testid="lead-paste"
        onChange={(e) => { setPaste(e.target.value); reset(e.target.value.trim() ? parseText(e.target.value) : [], e.target.value.trim() ? "pasted list" : ""); }}
        className={`${input} font-mono text-[12px]`} />

      {result && result.totalRows > 0 && (
        <div className="border border-line rounded-xl bg-paper p-4 flex flex-col gap-3" data-testid="lead-report">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <div className="text-[14px] font-semibold">List check — {fmt(result.totalRows)} row{result.totalRows > 1 ? "s" : ""} read{result.headerRow > 0 ? ` (headings found on row ${result.headerRow + 1})` : ""}</div>
            {result.problems.length > 0 && <button type="button" onClick={downloadProblems} className="text-[12px] font-semibold text-signal">Download problem rows</button>}
          </div>

          <div>
            <div className="text-[11.5px] uppercase tracking-wide text-ink-soft mb-1.5">What each column is</div>
            <div className="flex flex-wrap gap-2">
              {result.columns.filter((g) => g.field !== "ignore" || override[g.index]).map((g) => (
                <label key={g.index} title={g.why ? `Because ${g.why}` : ""} className={`flex items-center gap-1.5 border rounded-lg pl-2.5 pr-1 py-1 text-[12px] ${["phone", "name"].includes(g.field) ? "border-signal/50 bg-signal-tint/40" : "border-line bg-raised"}`}>
                  <span className="font-semibold max-w-[160px] truncate">{g.header}</span><span className="text-ink-soft">→</span>
                  <select value={g.field} data-testid={`map-${g.index}`} onChange={(e) => change(() => setOverride((o) => ({ ...o, [g.index]: e.target.value as FieldKey })))} className="bg-transparent outline-none font-medium">
                    {PICKABLE.map((f) => <option key={f} value={f}>{FIELD_LABELS[f]}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            {checks.map((k) => (
              <div key={k.key} className="text-[12.5px]">
                <div className="flex items-start gap-2">
                  <span className="w-4 text-center font-bold shrink-0">{icon[k.tone]}</span>
                  {k.toggle
                    ? <label className="flex items-start gap-2 cursor-pointer"><input type="checkbox" checked={tidyNames} onChange={(e) => change(() => setTidyNames(e.target.checked))} className="mt-0.5 accent-signal" data-testid="tidy-names" /><span>{k.text}</span></label>
                    : <span>{k.text}</span>}
                  {k.kinds && <button type="button" onClick={() => setOpen(open === k.key ? null : k.key)} className="text-signal font-semibold shrink-0 ml-auto">{open === k.key ? "Hide" : "See rows"}</button>}
                </div>
                {open === k.key && k.kinds && (
                  <div className="ml-6 mt-1 border border-line rounded-lg bg-raised max-h-48 overflow-auto">
                    {rowsOf(k.kinds).slice(0, 200).map((r, i) => <div key={i} className="px-2.5 py-1 border-b border-line last:border-0 text-[12px]"><span className="text-ink-soft font-mono mr-2">row {r.row}</span>{r.text}</div>)}
                    {rowsOf(k.kinds).length > 200 && <div className="px-2.5 py-1 text-[11.5px] text-ink-soft">+ {fmt(rowsOf(k.kinds).length - 200)} more — use Download problem rows</div>}
                  </div>
                )}
              </div>
            ))}
            <div className="flex items-start gap-2 text-[13px] font-semibold pt-1">
              <span className="w-4 text-center shrink-0">{ready ? icon.ok : icon.bad}</span>
              <span data-testid="ready-count">{fmt(ready)} {ready === 1 ? "person" : "people"} ready to call</span>
            </div>
            {vars.length > 0 && <div className="text-[11.5px] text-ink-soft ml-6">The employee can use: {vars.map((v) => <span key={v} className="font-mono bg-raised border border-line rounded px-1 py-0.5 mr-1">{`{{${v}}}`}</span>)}</div>}
            {tooMany && <div className="text-[12px] text-miss ml-6">Up to 5,000 people per campaign — split this list into smaller campaigns.</div>}
          </div>

          {result.ready.length > 0 && (
            <div className="border border-line rounded-lg overflow-hidden">
              <table className="w-full text-[12px]">
                <thead className="bg-raised text-ink-soft text-left"><tr><th className="px-2.5 py-1.5 font-medium">Row</th><th className="px-2.5 py-1.5 font-medium">Name</th><th className="px-2.5 py-1.5 font-medium">Phone</th><th className="px-2.5 py-1.5 font-medium">Details</th></tr></thead>
                <tbody>
                  {result.ready.slice(0, 5).map((r) => (
                    <tr key={r.row} className="border-t border-line"><td className="px-2.5 py-1.5 text-ink-soft">{r.row}</td><td className="px-2.5 py-1.5">{r.name || "—"}</td><td className="px-2.5 py-1.5 font-mono">{r.phone}</td><td className="px-2.5 py-1.5 text-ink-soft truncate max-w-[280px]">{Object.values(r.variables).join(" · ") || "—"}</td></tr>
                  ))}
                </tbody>
              </table>
              {result.ready.length > 5 && <div className="px-2.5 py-1 text-[11.5px] text-ink-soft border-t border-line">+ {fmt(result.ready.length - 5)} more</div>}
            </div>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            {approved
              ? <><span className="text-[13px] font-semibold text-signal" data-testid="list-approved">✓ Approved — {fmt(ready)} people will be called</span><button type="button" onClick={() => { setApproved(false); onApproved(null); }} className="text-[12px] text-ink-soft underline">Change</button></>
              : <button type="button" disabled={!ready || tooMany || !phoneCol} data-testid="approve-list"
                  onClick={() => { setApproved(true); onApproved(result.ready); }}
                  className="bg-signal text-on-accent rounded-lg px-4 py-2 text-[13px] font-semibold disabled:opacity-40">
                  Looks right — use these {fmt(ready)}
                </button>}
            {!approved && ready > 0 && <span className="text-[11.5px] text-ink-soft">Your file isn't changed. Only the approved list is used for this campaign.</span>}
          </div>
        </div>
      )}
      {result && result.totalRows === 0 && rows.length > 0 && <div className="text-[12.5px] text-ink-soft">Only headings found — add some rows.</div>}
    </div>
  );
}
