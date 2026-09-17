"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { AgentSettings, DEFAULT_AGENT_SETTINGS, getAgentSettings, saveAgentSettings } from "@/lib/storage";

const SUGGESTION_CHIPS = [
  "Always confirm the caller's name before continuing",
  "Speak in Telugu if the caller prefers it",
  "Never mention pricing over the phone — offer a callback instead",
  "Ask which exam and attempt number before anything else",
  "Keep the call under 3 minutes unless the caller wants to talk longer",
];

type CallState = "idle" | "dialing" | "ringing" | "connected" | "ended";

export default function AgentPage() {
  const [settings, setSettings] = useState<AgentSettings>(DEFAULT_AGENT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [testNumber, setTestNumber] = useState("");
  const [callState, setCallState] = useState<CallState>("idle");
  const [callSeconds, setCallSeconds] = useState(0);

  useEffect(() => {
    setSettings(getAgentSettings());
  }, []);

  useEffect(() => {
    if (callState !== "connected") return;
    const t = setInterval(() => setCallSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [callState]);

  function handleSave() {
    saveAgentSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  }

  function addChip(text: string) {
    setSettings((s) => ({
      ...s,
      instructions: s.instructions.trim().length ? `${s.instructions.trim()}\n- ${text}` : `- ${text}`,
    }));
  }

  function startTestCall() {
    if (!testNumber.trim()) return;
    setCallState("dialing");
    setCallSeconds(0);
    setTimeout(() => setCallState("ringing"), 1200);
    setTimeout(() => setCallState("connected"), 2600);
  }

  function endTestCall() {
    setCallState("ended");
    setTimeout(() => setCallState("idle"), 1800);
  }

  const callStateLabel: Record<CallState, string> = {
    idle: "",
    dialing: "Dialing…",
    ringing: "Ringing…",
    connected: "Connected",
    ended: "Call ended",
  };

  const mm = String(Math.floor(callSeconds / 60)).padStart(2, "0");
  const ss = String(callSeconds % 60).padStart(2, "0");

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar active="agent" />

      <main className="flex-1 box-border p-11 flex flex-col gap-7 max-w-[1100px]">
        <div>
          <h1 className="font-display text-[26px] font-semibold m-0">Agent</h1>
          <div className="text-[13px] text-ink-soft mt-1">
            Tell your AI agent how to talk — then hear it for yourself before it ever calls a real lead.
          </div>
        </div>

        <div className="grid grid-cols-[1.4fr_1fr] gap-5 items-start">
          <div className="bg-raised border border-line rounded-[10px] p-6 flex flex-col gap-4">
            <div>
              <label className="text-[13px] font-semibold block mb-1.5">Agent name</label>
              <input
                value={settings.agentName}
                onChange={(e) => setSettings((s) => ({ ...s, agentName: e.target.value }))}
                className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-signal"
              />
            </div>

            <div>
              <label className="text-[13px] font-semibold block mb-1.5">Opening greeting</label>
              <textarea
                value={settings.greeting}
                onChange={(e) => setSettings((s) => ({ ...s, greeting: e.target.value }))}
                rows={2}
                className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-signal resize-none"
              />
            </div>

            <div>
              <label className="text-[13px] font-semibold block mb-1.5">
                Instructions <span className="font-normal text-ink-soft">— how it should behave on the call</span>
              </label>
              <textarea
                value={settings.instructions}
                onChange={(e) => setSettings((s) => ({ ...s, instructions: e.target.value }))}
                rows={9}
                className="w-full border border-line rounded-lg px-3 py-2.5 text-sm bg-white outline-none focus:border-signal resize-none leading-relaxed"
              />
            </div>

            <div>
              <div className="text-xs text-ink-soft mb-2">Quick add</div>
              <div className="flex flex-wrap gap-2">
                {SUGGESTION_CHIPS.map((c) => (
                  <button
                    key={c}
                    onClick={() => addChip(c)}
                    className="text-xs px-3 py-1.5 rounded-full border border-line bg-paper hover:bg-signal-tint hover:border-signal hover:text-signal text-ink-soft"
                  >
                    + {c}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={handleSave}
                className="bg-ink text-white rounded-lg px-5 py-2.5 text-[13.5px] font-semibold"
              >
                Save changes
              </button>
              {saved && <span className="text-[13px] text-signal font-medium">Saved ✓</span>}
            </div>
          </div>

          <div className="bg-raised border border-line rounded-[10px] p-6 flex flex-col gap-4">
            <div>
              <div className="text-[15px] font-semibold">Test this agent</div>
              <div className="text-[12.5px] text-ink-soft mt-1">
                Call your own phone using the instructions above, exactly as a lead would hear them.
              </div>
            </div>

            {callState === "idle" && (
              <>
                <div>
                  <label className="text-[13px] font-semibold block mb-1.5">Your phone number</label>
                  <input
                    value={testNumber}
                    onChange={(e) => setTestNumber(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-signal"
                  />
                </div>
                <button
                  onClick={startTestCall}
                  disabled={!testNumber.trim()}
                  className="bg-signal text-white rounded-lg px-5 py-2.5 text-[13.5px] font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7 17L17 7" /><path d="M8 7h9v9" />
                  </svg>
                  Call me to test
                </button>
              </>
            )}

            {callState !== "idle" && (
              <div className="flex flex-col items-center justify-center gap-3 py-6">
                <div
                  className={`w-16 h-16 rounded-full flex items-center justify-center ${
                    callState === "connected" ? "bg-signal-tint text-signal" : "bg-warm-tint text-warm"
                  } ${callState === "dialing" || callState === "ringing" ? "animate-pulse" : ""}`}
                >
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.95.36 1.87.68 2.75a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.33-1.34a2 2 0 0 1 2.11-.45c.88.32 1.8.55 2.75.68A2 2 0 0 1 22 16.92z" />
                  </svg>
                </div>
                <div className="text-[14px] font-semibold">{callStateLabel[callState]}</div>
                {callState === "connected" && (
                  <div className="font-display text-2xl font-bold tabular-nums">{mm}:{ss}</div>
                )}
                {callState === "connected" && (
                  <button
                    onClick={endTestCall}
                    className="bg-miss text-white rounded-lg px-5 py-2 text-[13px] font-semibold mt-1"
                  >
                    End test call
                  </button>
                )}
              </div>
            )}

            <div className="text-[11.5px] text-ink-soft border-t border-line pt-3 mt-1">
              Preview mode — this simulates the call flow in your browser. Real test calls will use this exact wording once your agent is connected to calling.
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
