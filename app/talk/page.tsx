// @ts-nocheck
"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { DEFAULT_AGENT_SETTINGS, getAgentSettings, LANGUAGES } from "@/lib/storage";
import { CartesiaVoiceCall } from "@/lib/cartesia-voice-client";

type CallStatus = "idle" | "connecting" | "live" | "ending" | "error";

function TalkInner() {
  const params = useSearchParams();
  const scriptId = params.get("scriptId");

  const [agentName, setAgentName] = useState(DEFAULT_AGENT_SETTINGS.agentName);
  const [language, setLanguage] = useState(DEFAULT_AGENT_SETTINGS.startingLanguage);
  const [publishInfo, setPublishInfo] = useState<{ agentId?: string; hasWebhook?: boolean } | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [callError, setCallError] = useState("");
  const [callDuration, setCallDuration] = useState(0);
  const [transcript, setTranscript] = useState<{ role: "agent" | "user"; text: string }[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const cartesiaCallRef = useRef<CartesiaVoiceCall | null>(null);
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
      setCallError("This employee hasn't been published to Cartesia yet — open their page and hit Publish first.");
      return;
    }
    setCallError("");
    setTranscript([]);
    setCallDuration(0);
    setCallStatus("connecting");

    const call = new CartesiaVoiceCall((evt) => {
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
        if (durationRef.current) { clearInterval(durationRef.current); durationRef.current = null; }
      } else if (evt.type === "error") {
        setCallStatus("error");
        setCallError(evt.message);
        if (durationRef.current) { clearInterval(durationRef.current); durationRef.current = null; }
      }
    });

    cartesiaCallRef.current = call;
    try {
      await call.start(publishInfo.agentId);
    } catch (err: any) {
      setCallStatus("error");
      setCallError(err?.message || "Failed to start call");
      cartesiaCallRef.current = null;
    }
  }, [callStatus, publishInfo]);

  const endCall = useCallback(async () => {
    if (!cartesiaCallRef.current) return;
    setCallStatus("ending");
    cartesiaCallRef.current.stop();
    cartesiaCallRef.current = null;
    if (durationRef.current) { clearInterval(durationRef.current); durationRef.current = null; }
    setCallStatus("idle");
    setIsMuted(false);
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
  const profileHref = scriptId ? `/agents/new?id=${scriptId}` : "/agent";

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
          <div className="flex items-center gap-2 border border-line rounded-full pl-1 pr-3 py-1 bg-white">
            <div className="w-6 h-6 rounded-full bg-signal-tint flex items-center justify-center text-signal font-display font-bold text-[11px]">
              {agentName.charAt(0)}
            </div>
            <span className="text-[12.5px] font-semibold">{agentName}</span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${isPublished ? "bg-signal-tint text-signal" : "bg-paper text-ink-soft border border-line"}`}>
              {statusLoading ? "…" : isPublished ? "LIVE" : "NOT HIRED"}
            </span>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-[640px] rounded-3xl bg-ink text-white overflow-hidden relative">
            <div className="px-8 py-14 flex flex-col items-center text-center gap-1">

              <div className="relative w-[120px] h-[120px] mb-7">
                {isLive && <div className="absolute inset-0 rounded-full bg-signal/25 animate-ping" />}
                {isConnecting && <div className="absolute inset-0 rounded-full bg-white/10 animate-pulse" />}
                <div className="absolute inset-3 rounded-full border-2 border-white/15" />
                <div className="absolute inset-0 rounded-full flex items-center justify-center">
                  <div className="w-[74px] h-[74px] rounded-full bg-gradient-to-br from-signal to-purple-500 flex items-center justify-center text-2xl font-display font-bold">
                    {agentName.charAt(0)}
                  </div>
                </div>
              </div>

              <div className="text-[11px] font-semibold tracking-[0.2em] text-white/40 mb-2">RANA AI</div>
              <div className="text-[26px] font-display font-semibold">Talk to {agentName}</div>
              <div className="text-[13.5px] text-white/60 mt-2 max-w-[420px] leading-relaxed">
                A real call on your Cartesia agent — same script, same voice as a real one, right in your browser.
              </div>

              {callStatus === "error" && callError && (
                <div className="mt-5 text-[12.5px] text-red-200 bg-red-500/10 border border-red-500/20 rounded-lg px-3.5 py-2.5 max-w-[420px]">
                  {callError}
                </div>
              )}

              {isIdleOrError && (
                <button onClick={startCall} disabled={statusLoading}
                  className="mt-7 bg-white text-ink rounded-full px-6 py-3 text-[14px] font-semibold flex items-center gap-2 disabled:opacity-50">
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
                        <div className={`max-w-[85%] rounded-xl px-3.5 py-2 text-[12.5px] leading-relaxed ${t.role === "agent" ? "bg-white/10 text-white" : "bg-signal text-white"}`}>
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
                <span className="text-[10.5px] font-semibold px-2.5 py-1 rounded-full bg-white/10 text-white/70">{langLabel}</span>
                <span className={`text-[10.5px] font-semibold px-2.5 py-1 rounded-full ${isPublished ? "bg-signal/20 text-signal" : "bg-amber-500/15 text-amber-300"}`}>
                  {statusLoading ? "Checking status…" : isPublished ? "Published on Cartesia" : "Not published — hit Publish on their page first"}
                </span>
              </div>

              <a href={profileHref} className="mt-6 text-[12.5px] font-semibold text-white/60 hover:text-white flex items-center gap-1">
                Open {agentName}'s page →
              </a>
            </div>
          </div>
        </div>
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
