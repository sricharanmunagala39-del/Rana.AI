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
            {i < step ? "✓" : i + 1} {label}
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

  const scriptLabel = SCRIPTS.find((s) => s.id === scriptId)?.label ?? "";

  const canNext =
    (step === 0 && name.trim().length > 0) ||
    (step === 1 && !!scriptId) ||
    (step === 2 && !!file && !fileError) ||
    (step === 3 && !!startDate && days.length > 0) ||
    step === 4;

  function toggleDay(d: string) {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  function validateAndSetFile(f: File | null) {
    if (!f) return;
    const okType = /\.(csv|xlsx|xls)$/i.test(f.name);
    if (!okType) {
      setFileError("Please upload a .csv, .xlsx, or .xls file.");
      setFile(null);
      return;
    }
    if (f.size > MAX_FILE_BYTES) {
      setFileError(`That file is ${formatBytes(f.size)} — the limit is 100 MB.`);
      setFile(null);
      return;
    }
    setFileError("");
    setFile(f);
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
        contactCountLabel: "Processing list…",
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
          <button
            onClick={() => router.push("/outbound")}
            className="text-[12.5px] text-ink-soft flex items-center gap-1 mb-3"
          >
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
              <div className="text-[13px] text-ink-soft">Taking you back to Outbound…</div>
            </div>
          ) : (
            <>
              {step === 0 && (
                <div className="flex flex-col gap-3">
                  <label className="text-[14px] font-semibold">What should we call this campaign?</label>
                  <div className="text-[12.5px] text-ink-soft -mt-1.5">
                    Name it however makes sense to you — college, city, batch, or anything else.
                  </div>
                  <input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Vijayawada INDRA — New batch, or Osmania College follow-up"
                    className="w-full border border-line rounded-lg px-3.5 py-3 text-sm bg-white outline-none focus:border-signal"
                  />
                </div>
              )}

              {step === 1 && (
                <div className="flex flex-col gap-3">
                  <label className="text-[14px] font-semibold">Which script should the agent use?</label>
                  <div className="flex flex-col gap-2.5">
                    {SCRIPTS.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setScriptId(s.id)}
                        className={`text-left border rounded-lg px-4 py-3 ${
                          scriptId === s.id ? "border-signal bg-signal-tint" : "border-line bg-white"
                        }`}
                      >
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

              {step === 2 && (
                <div className="flex flex-col gap-3">
                  <label className="text-[14px] font-semibold">Upload your contact list</label>
                  <div className="text-[12.5px] text-ink-soft -mt-1.5">CSV or Excel, up to 100 MB.</div>
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-line rounded-xl py-10 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-signal hover:bg-signal-tint/30"
                  >
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-ink-soft"><path d="M12 16V4M12 4l-4 4M12 4l4 4" strokeLinecap="round" strokeLinejoin="round" /><path d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    <div className="text-[13.5px] font-semibold">Click to upload, or drag a file here</div>
                    <div className="text-[12px] text-ink-soft">.csv, .xlsx, .xls · max 100 MB</div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      className="hidden"
                      onChange={(e) => validateAndSetFile(e.target.files?.[0] ?? null)}
                    />
                  </div>
                  {file && !fileError && (
                    <div className="flex items-center gap-2.5 border border-line rounded-lg px-3.5 py-2.5 bg-white">
                      <div className="w-8 h-8 rounded bg-signal-tint text-signal flex items-center justify-center text-[11px] font-bold">
                        {file.name.split(".").pop()?.toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <div className="text-[13px] font-semibold">{file.name}</div>
                        <div className="text-[11.5px] text-ink-soft">{formatBytes(file.size)}</div>
                      </div>
                      <button onClick={() => setFile(null)} className="text-[12px] text-miss font-semibold">Remove</button>
                    </div>
                  )}
                  {fileError && <div className="text-[12.5px] text-miss font-medium">{fileError}</div>}
                </div>
              )}

              {step === 3 && (
                <div className="flex flex-col gap-5">
                  <div>
                    <label className="text-[14px] font-semibold block mb-2">Start date</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="border border-line rounded-lg px-3.5 py-2.5 text-sm bg-white outline-none focus:border-signal"
                    />
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
                        <button
                          key={d}
                          onClick={() => toggleDay(d)}
                          className={`w-11 h-9 rounded-lg text-[12.5px] font-semibold border ${
                            days.includes(d) ? "bg-ink text-white border-ink" : "bg-white text-ink-soft border-line"
                          }`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[14px] font-semibold block mb-2">Dial rate</label>
                    <select
                      value={dialRate}
                      onChange={(e) => setDialRate(e.target.value)}
                      className="border border-line rounded-lg px-3.5 py-2.5 text-sm bg-white outline-none focus:border-signal"
                    >
                      <option value="1">1 call / sec — gentle</option>
                      <option value="2">2 calls / sec — recommended</option>
                      <option value="4">4 calls / sec — fast</option>
                    </select>
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="flex flex-col gap-4">
                  <label className="text-[14px] font-semibold">Review before you launch</label>
                  <div className="border border-line rounded-lg divide-y divide-line bg-white">
                    {[
                      ["Campaign name", name || "—"],
                      ["Script", scriptLabel],
                      ["Contact list", file ? `${file.name} (${formatBytes(file.size)})` : "—"],
                      ["Start date", startDate || "—"],
                      ["Calling window", `${windowStart} – ${windowEnd}`],
                      ["Days", days.join(", ") || "—"],
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
            <button
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
              className="text-[13.5px] font-semibold text-ink-soft disabled:opacity-0 px-4 py-2.5"
            >
              Back
            </button>
            {step < STEPS.length - 1 ? (
              <button
                onClick={() => setStep((s) => s + 1)}
                disabled={!canNext}
                className="bg-ink text-white rounded-lg px-5 py-2.5 text-[13.5px] font-semibold disabled:opacity-40"
              >
                Continue
              </button>
            ) : (
              <button
                onClick={handleLaunch}
                disabled={launching}
                className="bg-signal text-white rounded-lg px-6 py-2.5 text-[13.5px] font-semibold disabled:opacity-60"
              >
                {launching ? "Launching…" : "Launch campaign"}
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
