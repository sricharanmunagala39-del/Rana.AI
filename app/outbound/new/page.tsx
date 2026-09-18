"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { SCRIPTS } from "@/lib/scripts";
import { Campaign, ScriptId, addCampaign, formatBytes } from "@/lib/storage";

const STEPS = ["Name", "Script", "Contacts", "Schedule", "Review"];
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const DAY_OPTIONS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function StepDots({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[12.5px] font-semibold ${
              i === step
                ? "bg-ink text-white"
                : i < step
                ? "bg-signal-tint text-signal"
                : "bg-[#E9EBE5] text-ink-soft"
            }`}
          >
            {i < step ? "\u2713" : i + 1} {label}
          </div>
          {i < STEPS.length - 1 && <div className="w-5 h-px bg-line" />}
        </div>
      ))}
    </div>
  );
}

export default function NewCampaignPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [scriptId, setScriptId] = useState<ScriptId>("neet-reactivation");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [startDate, setStartDate] = useState("");
  const [windowStart, setWindowStart] = useState("09:00");
  const [windowEnd, setWindowEnd] = useState("18:00");
  const [days, setDays] = useState<string[]>(["Mon", "Tue", "Wed", "Thu", "Fri"]);
  const [dialRate, setDialRate] = useState("2");
  const [launching, setLaunching] = useState(false);
  const [launched, setLaunched] = useState(false);

  /* CSV parse state */
  const [csvRows,        setCsvRows]        = useState<string[][]>([]);
  const [csvHeaders,     setCsvHeaders]     = useState<string[]>([]);
  const [csvColMap,      setCsvColMap]      = useState<{ name: number; phone: number }>({ name: -1, phone: -1 });
  const [csvError,       setCsvError]       = useState("");
  const [csvParsing,     setCsvParsing]     = useState(false);
  const [csvPreviewOpen, setCsvPreviewOpen] = useState(false);

  const scriptLabel = SCRIPTS.find((s) => s.id === scriptId)?.label ?? "";

  const canNext =
    (step === 0 && name.trim().length > 0) ||
    (step === 1 && !!scriptId) ||
    (step === 2 && !!file && !fileError && !csvParsing && (csvHeaders.length === 0 || csvColMap.phone !== -1)) ||
    (step === 3 && !!startDate && days.length > 0) ||
    step === 4;

  function toggleDay(d: string) {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  function parseCSVText(text: string): string[][] {
    const rows: string[][] = [];
    const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      const cells: string[] = [];
      let cur = ""; let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { inQ = !inQ; continue; }
        if (ch === "," && !inQ) { cells.push(cur.trim()); cur = ""; continue; }
        cur += ch;
      }
      cells.push(cur.trim());
      rows.push(cells);
    }
    return rows;
  }

  function guessColIndex(headers: string[], keywords: string[]): number {
    const h = headers.map((x) => x.toLowerCase());
    for (const kw of keywords) {
      const idx = h.findIndex((x) => x.includes(kw));
      if (idx !== -1) return idx;
    }
    return -1;
  }

  function parseAndPreviewFile(f: File) {
    setCsvParsing(true); setCsvError(""); setCsvRows([]); setCsvHeaders([]); setCsvPreviewOpen(false);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rows = parseCSVText(text);
      if (rows.length < 2) { setCsvError("File appears empty or has no data rows."); setCsvParsing(false); return; }
      const headers = rows[0];
      setCsvHeaders(headers);
      setCsvRows(rows);
      const nameCol  = guessColIndex(headers, ["name","contact","student","lead","first"]);
      const phoneCol = guessColIndex(headers, ["phone","mobile","number","cell","tel","whatsapp"]);
      setCsvColMap({ name: nameCol, phone: phoneCol });
      if (phoneCol === -1) setCsvError("Couldn't auto-detect a phone column. Please map it below.");
      setCsvParsing(false); setCsvPreviewOpen(true);
    };
    reader.onerror = () => { setCsvError("Failed to read file."); setCsvParsing(false); };
    reader.readAsText(f);
  }

  function validateAndSetFile(f: File | null) {
    if (!f) return;
    const okType = /\.(csv|xlsx|xls)$/i.test(f.name);
    if (!okType) {
      setFileError("Please upload a .csv, .xlsx, or .xls file.");
      setFile(null); setCsvRows([]); setCsvHeaders([]);
      return;
    }
    if (f.size > MAX_FILE_BYTES) {
      setFileError(`That file is ${formatBytes(f.size)} \u2014 the limit is 100 MB.`);
      setFile(null); setCsvRows([]); setCsvHeaders([]);
      return;
    }
    setFileError("");
    setFile(f);
    if (/\.csv$/i.test(f.name)) {
      parseAndPreviewFile(f);
    } else {
      setCsvRows([]); setCsvHeaders([]); setCsvParsing(false); setCsvPreviewOpen(false); setCsvError("");
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    validateAndSetFile(e.dataTransfer.files?.[0] ?? null);
  }

  function handleLaunch() {
    setLaunching(true);
    setTimeout(() => {
      const campaign: Campaign = {
        id: `c_${Date.now()}`,
        name: name.trim(),
        scriptId,
        scriptLabel,
        fileName: file?.name ?? "",
        fileSizeLabel: file ? formatBytes(file.size) : "",
        contactCountLabel: csvRows.length > 1 ? `${csvRows.length - 1} contacts` : "Processing list\u2026",
        startDate,
        windowStart,
        windowEnd,
        days,
        dialRate: `${dialRate} / sec`,
        status: "Scheduled",
        createdAt: Date.now(),
      };
      addCampaign(campaign);
      setLaunching(false);
      setLaunched(true);
      setTimeout(() => router.push("/outbound"), 1600);
    }, 1100);
  }

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar active="outbound" />

      <main className="flex-1 box-border p-11 flex flex-col gap-7 max-w-[900px]">
        <div>
          <button onClick={() => router.push("/outbound")} className="text-[12.5px] text-ink-soft flex items-center gap-1 mb-3">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
            Back to Outbound
          </button>
          <h1 className="font-display text-[26px] font-semibold m-0">Start a campaign</h1>
          <div className="text-[13px] text-ink-soft mt-1">Set it up in five quick steps.</div>
        </div>

        <StepDots step={step} />

        <div className="bg-raised border border-line rounded-[10px] p-7 min-h-[340px] flex flex-col">
          {launched ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
              <div className="w-14 h-14 rounded-full bg-signal-tint text-signal flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              </div>
              <div className="text-[16px] font-semibold">Campaign launched</div>
              <div className="text-[13px] text-ink-soft">Taking you back to Outbound\u2026</div>
            </div>
          ) : (
            <>
              {/* STEP 0 — Name */}
              {step === 0 && (
                <div className="flex flex-col gap-3">
                  <label className="text-[14px] font-semibold">What should we call this campaign?</label>
                  <div className="text-[12.5px] text-ink-soft -mt-1.5">Name it however makes sense to you \u2014 college, city, batch, or anything else.</div>
                  <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Vijayawada INDRA \u2014 New batch, or Osmania College follow-up"
                    className="w-full border border-line rounded-lg px-3.5 py-3 text-sm bg-white outline-none focus:border-signal" />
                </div>
              )}

              {/* STEP 1 — Script */}
              {step === 1 && (
                <div className="flex flex-col gap-3">
                  <label className="text-[14px] font-semibold">Which script should the agent use?</label>
                  <div className="flex flex-col gap-2.5">
                    {SCRIPTS.map((s) => (
                      <button key={s.id} onClick={() => setScriptId(s.id)}
                        className={`text-left border rounded-lg px-4 py-3 ${scriptId === s.id ? "border-signal bg-signal-tint" : "border-line bg-white"}`}>
                        <div className="flex items-center gap-2">
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${scriptId === s.id ? "border-signal" : "border-line"}`}>
                            {scriptId === s.id && <div className="w-2 h-2 rounded-full bg-signal" />}
                          </div>
                          <span className="text-[13.5px] font-semibold">{s.label}</span>
                        </div>
                        <div className="text-[12.5px] text-ink-soft mt-1 ml-6">{s.description}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* STEP 2 — Contacts */}
              {step === 2 && (
                <div className="flex flex-col gap-3">
                  <label className="text-[14px] font-semibold">Upload your contact list</label>
                  <div className="text-[12.5px] text-ink-soft -mt-1.5">CSV or Excel, up to 100 MB. Column headers must be on row 1.</div>

                  {/* Drop zone — hidden once file is selected */}
                  {!file && (
                    <div onDragOver={(e) => e.preventDefault()} onDrop={handleDrop} onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-line rounded-xl py-10 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-signal hover:bg-signal-tint/30">
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-ink-soft"><path d="M12 16V4M12 4l-4 4M12 4l4 4" strokeLinecap="round" strokeLinejoin="round" /><path d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      <div className="text-[13.5px] font-semibold">Click to upload, or drag a file here</div>
                      <div className="text-[12px] text-ink-soft">.csv, .xlsx, .xls \u00b7 max 100 MB</div>
                    </div>
                  )}
                  <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
                    onChange={(e) => validateAndSetFile(e.target.files?.[0] ?? null)} />

                  {/* Parsing spinner */}
                  {csvParsing && <div className="text-[13px] text-ink-soft animate-pulse py-2">Reading file\u2026</div>}

                  {/* File chip */}
                  {file && !fileError && (
                    <div className="flex items-center gap-2.5 border border-line rounded-lg px-3.5 py-2.5 bg-white">
                      <div className="w-8 h-8 rounded bg-signal-tint text-signal flex items-center justify-center text-[11px] font-bold">
                        {file.name.split(".").pop()?.toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <div className="text-[13px] font-semibold">{file.name}</div>
                        <div className="text-[11.5px] text-ink-soft">
                          {formatBytes(file.size)}
                          {csvRows.length > 1 && <span className="ml-2 text-signal font-semibold">{csvRows.length - 1} contacts found</span>}
                        </div>
                      </div>
                      <button onClick={() => { setFile(null); setCsvRows([]); setCsvHeaders([]); setCsvError(""); setCsvPreviewOpen(false); }}
                        className="text-[12px] text-miss font-semibold">Remove</button>
                    </div>
                  )}

                  {/* Column mapping card — only for parsed CSVs */}
                  {csvHeaders.length > 0 && (
                    <div className="border border-line rounded-xl p-4 bg-white flex flex-col gap-3">
                      <div className="text-[13px] font-semibold">Column mapping</div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[12px] text-ink-soft block mb-1">\uD83D\uDCDE Phone column <span className="text-miss">*</span></label>
                          <select value={csvColMap.phone} onChange={(e) => setCsvColMap((m) => ({ ...m, phone: Number(e.target.value) }))}
                            className={`w-full border rounded-lg px-2.5 py-2 text-[13px] bg-white outline-none ${csvColMap.phone === -1 ? "border-miss" : "border-signal"}`}>
                            <option value={-1}>\u2014 select column \u2014</option>
                            {csvHeaders.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[12px] text-ink-soft block mb-1">\uD83D\uDC64 Name column (optional)</label>
                          <select value={csvColMap.name} onChange={(e) => setCsvColMap((m) => ({ ...m, name: Number(e.target.value) }))}
                            className="w-full border border-line rounded-lg px-2.5 py-2 text-[13px] bg-white outline-none focus:border-signal">
                            <option value={-1}>\u2014 none \u2014</option>
                            {csvHeaders.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                          </select>
                        </div>
                      </div>

                      {/* Preview toggle */}
                      <button onClick={() => setCsvPreviewOpen((v) => !v)}
                        className="text-[12px] text-signal font-semibold text-left flex items-center gap-1">
                        {csvPreviewOpen ? "\u25BE Hide preview" : "\u25B8 Show first 5 rows"}
                      </button>
                      {csvPreviewOpen && csvRows.length > 1 && (
                        <div className="overflow-x-auto rounded-lg border border-line">
                          <table className="text-[11.5px] w-full">
                            <thead>
                              <tr className="bg-paper">
                                {csvHeaders.map((h, i) => (
                                  <th key={i} className={`text-left px-2.5 py-1.5 font-semibold border-b border-line whitespace-nowrap
                                    ${i === csvColMap.phone || i === csvColMap.name ? "text-signal" : "text-ink-soft"}`}>
                                    {h || `Col ${i + 1}`}
                                    {i === csvColMap.phone && " \uD83D\uDCDE"}
                                    {i === csvColMap.name && " \uD83D\uDC64"}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {csvRows.slice(1, 6).map((row, ri) => (
                                <tr key={ri} className="border-b border-line last:border-0">
                                  {row.map((cell, ci) => (
                                    <td key={ci} className={`px-2.5 py-1.5 max-w-[160px] truncate
                                      ${ci === csvColMap.phone ? "font-semibold text-ink" : "text-ink-soft"}`}>
                                      {cell || "\u2014"}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {csvRows.length > 6 && (
                            <div className="text-[11.5px] text-ink-soft px-2.5 py-1.5 bg-paper border-t border-line">
                              + {csvRows.length - 6} more rows not shown
                            </div>
                          )}
                        </div>
                      )}
                      {csvColMap.phone === -1 && (
                        <div className="text-[12px] text-miss font-medium">Select a phone column to continue.</div>
                      )}
                    </div>
                  )}

                  {(fileError || csvError) && (
                    <div className="text-[12.5px] text-miss font-medium">{fileError || csvError}</div>
                  )}
                </div>
              )}

              {/* STEP 3 — Schedule */}
              {step === 3 && (
                <div className="flex flex-col gap-5">
                  <div>
                    <label className="text-[14px] font-semibold block mb-2">Start date</label>
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                      className="border border-line rounded-lg px-3.5 py-2.5 text-sm bg-white outline-none focus:border-signal" />
                  </div>
                  <div>
                    <label className="text-[14px] font-semibold block mb-2">Calling window</label>
                    <div className="flex items-center gap-3">
                      <input type="time" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} className="border border-line rounded-lg px-3.5 py-2.5 text-sm bg-white outline-none focus:border-signal" />
                      <span className="text-ink-soft text-sm">to</span>
                      <input type="time" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} className="border border-line rounded-lg px-3.5 py-2.5 text-sm bg-white outline-none focus:border-signal" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[14px] font-semibold block mb-2">Days to call</label>
                    <div className="flex gap-2">
                      {DAY_OPTIONS.map((d) => (
                        <button key={d} onClick={() => toggleDay(d)}
                          className={`w-11 h-9 rounded-lg text-[12.5px] font-semibold border ${days.includes(d) ? "bg-ink text-white border-ink" : "bg-white text-ink-soft border-line"}`}>
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[14px] font-semibold block mb-2">Dial rate</label>
                    <select value={dialRate} onChange={(e) => setDialRate(e.target.value)}
                      className="border border-line rounded-lg px-3.5 py-2.5 text-sm bg-white outline-none focus:border-signal">
                      <option value="1">1 call / sec \u2014 gentle</option>
                      <option value="2">2 calls / sec \u2014 recommended</option>
                      <option value="4">4 calls / sec \u2014 fast</option>
                    </select>
                  </div>
                </div>
              )}

              {/* STEP 4 — Review */}
              {step === 4 && (
                <div className="flex flex-col gap-4">
                  <label className="text-[14px] font-semibold">Review before you launch</label>
                  <div className="border border-line rounded-lg divide-y divide-line bg-white">
                    {[
                      ["Campaign name", name || "\u2014"],
                      ["Script", scriptLabel],
                      ["Contact list", file ? `${file.name} \u00b7 ${csvRows.length > 1 ? `${csvRows.length - 1} contacts` : formatBytes(file.size)}` : "\u2014"],
                      ["Start date", startDate || "\u2014"],
                      ["Calling window", `${windowStart} \u2013 ${windowEnd}`],
                      ["Days", days.join(", ") || "\u2014"],
                      ["Dial rate", `${dialRate} / sec`],
                    ].map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between px-4 py-3">
                        <span className="text-[13px] text-ink-soft">{k}</span>
                        <span className="text-[13px] font-semibold text-right">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {!launched && (
          <div className="flex items-center justify-between">
            <button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}
              className="text-[13.5px] font-semibold text-ink-soft disabled:opacity-0 px-4 py-2.5">Back</button>
            {step < STEPS.length - 1 ? (
              <button onClick={() => setStep((s) => s + 1)} disabled={!canNext}
                className="bg-ink text-white rounded-lg px-5 py-2.5 text-[13.5px] font-semibold disabled:opacity-40">Continue</button>
            ) : (
              <button onClick={handleLaunch} disabled={launching}
                className="bg-signal text-white rounded-lg px-6 py-2.5 text-[13.5px] font-semibold disabled:opacity-60">
                {launching ? "Launching\u2026" : "Launch campaign"}
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
