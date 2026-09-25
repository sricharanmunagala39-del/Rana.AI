// @ts-nocheck
"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { DEFAULT_AGENT_SETTINGS, getAgentSettings, LANGUAGES } from "@/lib/storage";
import { CartesiaVoiceCall } from "@/lib/cartesia-voice-client";
import { SarvamVoiceCall } from "@/lib/sarvam-voice-client";
import { LANG_NAMES, baseLang } from "@/lib/playbook";

type CallStatus = "idle" | "connecting" | "live" | "ending" | "error";

// What a counsellor should hear the employee handle before it goes near a real customer.
const TEST_CHECKS = [
  { key: "greeting", label: "Greets correctly and says who it is", tryThis: "Hello, who is this?" },
  { key: "facts", label: "Answers the main questions correctly", tryThis: "What's the fee? When does the next batch start?" },
  { key: "language", label: "Switches language when the caller does", tryThis: "Telugu lo cheppandi / Hindi mein bataiye" },
  { key: "objection", label: "Handles 'not interested' and 'call me later' politely", tryThis: "I'm busy, call me tomorrow" },
  { key: "unknown", label: "Doesn't make things up when it doesn't know", tryThis: "Ask something not in the script" },
];

function TalkInner() {
  const params = useSearchParams();
  const scriptId = params.get("scriptId");

  const [agentName, setAgentName] = useState(DEFAULT_AGENT_SETTINGS.agentName);
  const [language, setLanguage] = useState(DEFAULT_AGENT_SETTINGS.startingLanguage);
  const [publishInfo, setPublishInfo] = useState<{ agentId?: string; hasWebhook?: boolean } | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  // Opening language + switching rule, and whether the live agent is behind the latest edits.
  const [policy, setPolicy] = useState<{ mode: string; allowed: string[] } | null>(null);
  const [stale, setStale] = useState(false);
  const [republishing, setRepublishing] = useState(false);
  const [republishMsg, setRepublishMsg] = useState("");

  // Test sign-off (named employees only): an employee must be tested before it can be deployed.
  const [testedAt, setTestedAt] = useState<string | null>(null);
  const [testNotes, setTestNotes] = useState("");
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [testsRun, setTestsRun] = useState(0);
  const [savingTest, setSavingTest] = useState(false);
  const [testMsg, setTestMsg] = useState("");

  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [callError, setCallError] = useState("");
  const [callDuration, setCallDuration] = useState(0);
  const [transcript, setTranscript] = useState<{ role: "agent" | "user"; text: string }[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const cartesiaCallRef = useRef<CartesiaVoiceCall | SarvamVoiceCall | null>(null);
  // Which voice engine runs this employee: Sarvam (India, Telugu/Hindi) or Cartesia.
  const [engine, setEngine] = useState<"sarvam" | "cartesia">("cartesia");
  const [liveLanguage, setLiveLanguage] = useState("");
  const [phoneTo, setPhoneTo] = useState("");
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneMsg, setPhoneMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const durationRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setStatusLoading(true);
    if (scriptId) {
      // A specific named agent, created via "Create Your Own Agent".
      (async () => {
        try {
          const res = await fetch(`/api/scripts/${scriptId}`);
          const data = await res.json();
          if (!res.ok) { setNotFound(true); return; }
          const s = data.script;
          setAgentName(s.name || "Agent");
          setLanguage(s.starting_language || "en-IN");
          if (s.cartesia_agent_id) setPublishInfo({ agentId: s.cartesia_agent_id, hasWebhook: true });
          setEngine(s.engine === "cartesia" ? "cartesia" : "sarvam");
          setPolicy(s.language_policy || null);
          setStale(!!(s.cartesia_agent_id && s.edited_at && s.published_at && new Date(s.edited_at) > new Date(s.published_at)));
          setTestedAt(s.tested_at || null);
          setTestNotes(s.test_notes || "");
          setChecks(s.test_checklist || {});
        } catch { setNotFound(true); }
        finally { setStatusLoading(false); }
      })();
    } else {
      // Legacy single default agent.
      const settings = getAgentSettings();
      setAgentName(settings.agentName);
      setLanguage(settings.startingLanguage);
      (async () => {
        try {
          const res = await fetch("/api/admin/cartesia-agent");
          const data = await res.json();
          if (res.ok && data.agentId) setPublishInfo({ agentId: data.agentId, hasWebhook: data.hasWebhook });
        } catch { /* stays "Not published" */ }
        finally { setStatusLoading(false); }
      })();
    }
  }, [scriptId]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [transcript]);

  const startCall = useCallback(async () => {
    if (callStatus !== "idle" && callStatus !== "error") return;
    if (!publishInfo?.agentId) {
      setCallStatus("error");
      setCallError("This employee hasn't been published yet — open their page and hit Publish first.");
      return;
    }
    setCallError("");
    setTranscript([]);
    setCallDuration(0);
    setCallStatus("connecting");

    setLiveLanguage("");
    const onEvent = (evt: any) => {
      if (evt.type === "language") { setLiveLanguage(evt.language); return; }
      if (evt.type === "live") {
        setCallStatus("live");
        durationRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
      } else if (evt.type === "transcript") {
        setTranscript((t) => {
          const last = t[t.length - 1];
          if (last && last.role === evt.role) {
            return [...t.slice(0, -1), { role: evt.role, text: `${last.text} ${evt.text}`.trim() }];
          }
          return [...t, { role: evt.role, text: evt.text }];
        });
      } else if (evt.type === "ended") {
        setCallStatus("idle");
        setTestsRun((n) => n + 1);
        if (durationRef.current) { clearInterval(durationRef.current); durationRef.current = null; }
      } else if (evt.type === "error") {
        setCallStatus("error");
        setCallError(evt.message);
        if (durationRef.current) { clearInterval(durationRef.current); durationRef.current = null; }
      }
    };
    const call = engine === "sarvam" && scriptId ? new SarvamVoiceCall(onEvent) : new CartesiaVoiceCall(onEvent);

    cartesiaCallRef.current = call;
    try {
      await call.start(engine === "sarvam" && scriptId ? scriptId : publishInfo.agentId);
    } catch (err: any) {
      setCallStatus("error");
      setCallError(err?.message || "Failed to start call");
      cartesiaCallRef.current = null;
    }
  }, [callStatus, publishInfo, engine, scriptId]);

  // Real phone test (Sarvam): the employee calls this number from the Sarvam Indian number.
  async function callMyPhone() {
    if (!scriptId) return;
    setPhoneBusy(true); setPhoneMsg(null);
    try {
      const res = await fetch("/api/sarvam/call", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scriptId, phone: phoneTo }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Couldn't place the call.");
      setPhoneMsg({ ok: true, text: `Calling ${phoneTo} now${d.from ? ` from ${d.from}` : ""}. Pick up to talk to ${agentName}. The call appears in Inbound/Outbound results a minute after it ends.` });
    } catch (e: any) { setPhoneMsg({ ok: false, text: e.message }); }
    finally { setPhoneBusy(false); }
  }

  const endCall = useCallback(async () => {
    if (!cartesiaCallRef.current) return;
    setCallStatus("ending");
    cartesiaCallRef.current.stop();
    cartesiaCallRef.current = null;
    if (durationRef.current) { clearInterval(durationRef.current); durationRef.current = null; }
    setCallStatus("idle");
    setIsMuted(false);
    setTestsRun((n) => n + 1);
  }, []);

  const toggleMute = useCallback(() => {
    if (!cartesiaCallRef.current) return;
    if (isMuted) { cartesiaCallRef.current.unmute(); setIsMuted(false); }
    else { cartesiaCallRef.current.mute(); setIsMuted(true); }
  }, [isMuted]);

  useEffect(() => () => {
    cartesiaCallRef.current?.stop();
    if (durationRef.current) clearInterval(durationRef.current);
  }, []);

  function fmtDuration(s: number) {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  }

  const isLive = callStatus === "live";
  const isConnecting = callStatus === "connecting";
  const isIdleOrError = callStatus === "idle" || callStatus === "error";
  const langLabel = LANGUAGES.find((l) => l.code === language)?.label ?? language;
  const isPublished = !!publishInfo?.agentId;
  const profileHref = scriptId ? `/agents/new?id=${scriptId}` : "/employees";

  async function republish(thenCall = false) {
    if (!scriptId) return;
    setRepublishing(true); setRepublishMsg("");
    try {
      const res = await fetch(`/api/scripts/${scriptId}/publish`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Publish failed.");
      setPublishInfo({ agentId: data.agentId, hasWebhook: true });
      setStale(false);
      setRepublishMsg("Updated — the call now uses your latest script.");
    } catch (e: any) { setRepublishMsg(e.message); }
    finally { setRepublishing(false); }
  }

  const openBase = baseLang(language);
  const switchNames = policy?.mode === "match_caller" ? (policy.allowed || []).filter((l) => l !== openBase).map((l) => LANG_NAMES[l]).filter(Boolean) : [];

  const allChecked = TEST_CHECKS.every((c) => checks[c.key]);
  async function saveTest(approve: boolean) {
    if (!scriptId) return;
    setSavingTest(true); setTestMsg("");
    try {
      const res = await fetch(`/api/scripts/${scriptId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test_checklist: checks, test_notes: testNotes, tested_at: approve ? new Date().toISOString() : null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't save");
      setTestedAt(data.script?.tested_at || null);
      setTestMsg(approve ? "Signed off — ready to deploy." : "Sign-off removed. Deploying is blocked until it's tested again.");
    } catch (e: any) { setTestMsg(e.message); }
    finally { setSavingTest(false); }
  }

  if (notFound) {
    return (
      <div className="flex min-h-screen bg-paper">
        <Sidebar active="talk" />
        <div className="flex-1 flex items-center justify-center text-[13px] text-ink-soft">Couldn't find that agent.</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar active="talk" />
      <div className="flex-1 flex flex-col">
        <div className="border-b border-line px-6 py-3.5 flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Who</span>
          <div className="flex items-center gap-2 border border-line rounded-full pl-1 pr-3 py-1 bg-raised">
            <div className="w-6 h-6 rounded-full bg-signal-tint flex items-center justify-center text-signal font-display font-bold text-[11px]">
              {agentName.charAt(0)}
            </div>
            <span className="text-[12.5px] font-semibold">{agentName}</span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${isPublished ? "bg-signal-tint text-signal" : "bg-paper text-ink-soft border border-line"}`}>
              {statusLoading ? "…" : isPublished ? "LIVE" : "NOT HIRED"}
            </span>
          </div>
        </div>

        {scriptId && (stale || republishMsg) && (
          <div className="px-8 pt-6 flex justify-center">
            <div className={`w-full max-w-[640px] rounded-xl border px-4 py-3 flex items-center justify-between gap-3 text-[12.5px] ${stale ? "bg-hot-tint border-hot/30" : "bg-signal-tint border-signal/20 text-signal"}`} data-testid="stale-banner">
              <span>{stale ? <><b>You edited {agentName} after publishing.</b> Calls still use the older version until you publish again.</> : republishMsg}</span>
              {stale && (
                <button onClick={() => republish()} disabled={republishing || isLive || isConnecting}
                  className="shrink-0 bg-ink text-paper rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold disabled:opacity-50">
                  {republishing ? "Publishing…" : "Publish latest"}
                </button>
              )}
            </div>
          </div>
        )}

        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-[640px] rounded-3xl stage-glow text-white overflow-hidden relative">
            <div className="px-8 py-14 flex flex-col items-center text-center gap-1">

              <div className="relative w-[120px] h-[120px] mb-7">
                {isLive && <div className="absolute inset-0 rounded-full bg-signal/25 animate-ping" />}
                {isConnecting && <div className="absolute inset-0 rounded-full bg-white/10 animate-pulse" />}
                <div className="absolute inset-3 rounded-full border-2 border-white/15" />
                <div className="absolute inset-0 rounded-full flex items-center justify-center">
                  <div className="w-[74px] h-[74px] rounded-full bg-gradient-to-br from-signal to-violet flex items-center justify-center text-2xl font-display font-bold">
                    {agentName.charAt(0)}
                  </div>
                </div>
              </div>

              <div className="text-[11px] font-semibold tracking-[0.2em] text-white/40 mb-2">RANA AI</div>
              <div className="text-[26px] font-display font-semibold">Talk to {agentName}</div>
              <div className="text-[13.5px] text-white/60 mt-2 max-w-[420px] leading-relaxed">
                A real call with your employee — same script, same voice a customer hears, right in your browser.
              </div>

              {callStatus === "error" && callError && (
                <div className="mt-5 text-[12.5px] text-red-200 bg-red-500/10 border border-red-500/20 rounded-lg px-3.5 py-2.5 max-w-[420px]">
                  {callError}
                </div>
              )}

              {isIdleOrError && (
                <button onClick={startCall} disabled={statusLoading}
                  className="mt-7 bg-raised text-ink rounded-full px-6 py-3 text-[14px] font-semibold flex items-center gap-2 disabled:opacity-50">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4"/>
                  </svg>
                  {statusLoading ? "Checking…" : callStatus === "error" ? "Try again" : "Start talking"}
                </button>
              )}

              {isConnecting && (
                <div className="mt-7 text-[13px] text-white/60">Connecting…</div>
              )}

              {isLive && (
                <div className="mt-6 w-full flex flex-col items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-signal animate-pulse" />
                    <span className="text-[12.5px] font-semibold text-signal">LIVE</span>
                    <span className="text-white/40 text-[12px] font-mono ml-1">{fmtDuration(callDuration)}</span>
                  </div>

                  <div ref={transcriptRef} className="w-full max-w-[440px] max-h-[180px] overflow-y-auto flex flex-col gap-2 text-left px-1">
                    {transcript.length === 0 && (
                      <div className="text-center text-[12.5px] text-white/40 py-4 animate-pulse">Speak — {agentName} is listening…</div>
                    )}
                    {transcript.map((t, i) => (
                      <div key={i} className={`flex ${t.role === "agent" ? "justify-start" : "justify-end"}`}>
                        <div className={`max-w-[85%] rounded-xl px-3.5 py-2 text-[12.5px] leading-relaxed ${t.role === "agent" ? "bg-white/10 text-on-accent" : "bg-signal text-on-accent"}`}>
                          {t.text}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-3 mt-2">
                    <button onClick={toggleMute}
                      className={`flex items-center gap-1.5 text-[12px] font-semibold px-3.5 py-2 rounded-full border ${isMuted ? "bg-red-500/15 border-red-500/30 text-red-200" : "bg-white/10 border-white/10 text-white/70 hover:text-white"}`}>
                      {isMuted ? "Muted" : "Mute"}
                    </button>
                    <button onClick={endCall}
                      className="bg-red-500 text-white rounded-full px-5 py-2 text-[12.5px] font-semibold">
                      End call
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 mt-8 flex-wrap justify-center">
                <span className="text-[10.5px] font-semibold px-2.5 py-1 rounded-full bg-white/10 text-white/70" data-testid="talk-lang">Opens in {langLabel}</span>
                {policy && (
                  <span className="text-[10.5px] font-semibold px-2.5 py-1 rounded-full bg-white/10 text-white/70" data-testid="talk-policy">
                    {policy.mode === "fixed" || switchNames.length === 0 ? `Stays in ${langLabel}` : `Switches to ${switchNames.join(" / ")} when you do`}
                  </span>
                )}
                <span className={`text-[10.5px] font-semibold px-2.5 py-1 rounded-full ${isPublished ? "bg-signal/20 text-signal" : "bg-amber-500/15 text-amber-300"}`}>
                  {statusLoading ? "Checking status…" : isPublished ? (engine === "sarvam" ? "Live" : "Published") : "Not published — hit Publish on their page first"}
                </span>
              </div>

              {liveLanguage && isLive && <div className="mt-3 text-[11.5px] text-white/60" data-testid="live-language">Speaking {liveLanguage} now</div>}

              {scriptId && engine === "sarvam" && isPublished && !isLive && (
                <div className="mt-7 w-full max-w-[420px] rounded-2xl bg-white/5 border border-white/10 p-4 text-left" data-testid="call-my-phone">
                  <div className="text-[12.5px] font-semibold">Or take a real phone call</div>
                  <div className="text-[11.5px] text-white/50 mt-0.5">{agentName} calls your mobile from your Indian business number — the real caller experience.</div>
                  <div className="flex gap-2 mt-3">
                    <input value={phoneTo} onChange={(e) => setPhoneTo(e.target.value)} placeholder="98765 43210" inputMode="tel"
                      className="flex-1 bg-white/10 border border-white/15 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-white/40 placeholder:text-white/30" />
                    <button onClick={callMyPhone} disabled={phoneBusy || phoneTo.replace(/\D/g, "").length < 10}
                      className="bg-raised text-ink rounded-lg px-4 text-[12.5px] font-semibold disabled:opacity-40">{phoneBusy ? "Calling…" : "Call me"}</button>
                  </div>
                  {phoneMsg && <div className={`text-[11.5px] mt-2 ${phoneMsg.ok ? "text-signal" : "text-red-300"}`}>{phoneMsg.text}</div>}
                </div>
              )}

              <a href={profileHref} className="mt-6 text-[12.5px] font-semibold text-white/60 hover:text-white flex items-center gap-1">
                Open {agentName}'s page →
              </a>
            </div>
          </div>
        </div>

        {!isLive && transcript.length > 0 && (
          <div className="px-8 pb-6 flex justify-center">
            <div className="w-full max-w-[640px] bg-raised border border-line rounded-2xl p-5">
              <div className="text-[13px] font-semibold mb-3">Last test conversation</div>
              <div className="flex flex-col gap-2 max-h-[260px] overflow-y-auto">
                {transcript.map((t, i) => (
                  <div key={i} className={`max-w-[85%] rounded-xl px-3 py-2 text-[12.5px] leading-relaxed ${t.role === "agent" ? "bg-signal-tint self-start" : "bg-paper self-end"}`}>
                    <div className="text-[10px] uppercase tracking-wide text-ink-soft">{t.role === "agent" ? agentName : "You"}</div>{t.text}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {scriptId && isPublished && (
          <div className="px-8 pb-10 flex justify-center">
            <div className="w-full max-w-[640px] bg-raised border border-line rounded-2xl p-6 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[15px] font-semibold">Test before you deploy</div>
                  <div className="text-[12.5px] text-ink-soft mt-0.5 leading-relaxed">
                    Call {agentName} a few times and play the customer. Tick each check once you've heard it handled well — then sign off.
                  </div>
                </div>
                {testedAt ? (
                  <span className="shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-signal-tint text-signal">Signed off {new Date(testedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                ) : (
                  <span className="shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-paper border border-line text-ink-soft">Not signed off</span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                {TEST_CHECKS.map((c) => (
                  <label key={c.key} className="flex items-start gap-2.5 text-[13px] cursor-pointer">
                    <input type="checkbox" className="accent-signal mt-0.5" checked={!!checks[c.key]} onChange={(e) => setChecks({ ...checks, [c.key]: e.target.checked })} />
                    <span><span className="font-semibold">{c.label}</span> <span className="text-ink-soft">— try: “{c.tryThis}”</span></span>
                  </label>
                ))}
              </div>
              <textarea value={testNotes} onChange={(e) => setTestNotes(e.target.value)} rows={2} placeholder="Notes — what to fix, what worked (optional)"
                className="w-full border border-line rounded-lg px-3 py-2 text-[13px] bg-paper outline-none focus:border-signal" />
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={() => saveTest(true)} disabled={savingTest || !allChecked || (testsRun === 0 && !testedAt)}
                  className="bg-signal text-on-accent rounded-lg px-4 py-2 text-[12.5px] font-semibold disabled:opacity-40">
                  {testedAt ? "Re-confirm sign-off" : "Sign off — ready to deploy"}
                </button>
                {testedAt && <a href={`/employees?deploy=${scriptId}`} className="border border-line rounded-lg px-4 py-2 text-[12.5px] font-semibold hover:bg-paper">Deploy {agentName} →</a>}
                {testedAt && <button onClick={() => saveTest(false)} disabled={savingTest} className="text-[12px] text-ink-soft hover:text-miss">Remove sign-off</button>}
                {!allChecked && <span className="text-[11.5px] text-ink-soft">Tick all {TEST_CHECKS.length} checks to sign off.</span>}
                {allChecked && testsRun === 0 && !testedAt && <span className="text-[11.5px] text-ink-soft">Make at least one test call first.</span>}
              </div>
              {testMsg && <div className="text-[12.5px] text-signal">{testMsg}</div>}
              <div className="text-[11.5px] text-ink-soft">Practice here in the browser is free — it never uses your plan minutes. "Call me" rings a real phone and counts as a call.</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TalkPage() {
  return (
    <Suspense fallback={null}>
      <TalkInner />
    </Suspense>
  );
}
