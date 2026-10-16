// RANA's own voice engine ("rana"): the self-hosted agent in voice-agent/ talks to the dashboard through
// two signed endpoints, so it never holds database keys:
//   POST /api/voice/agent-config     → which client and AI employee answer this call, with the compiled script
//   POST /api/webhooks/rana-voice    → the finished call, stored and processed like any Sarvam call
// Every request is signed: header x-rana-signature = hex HMAC-SHA256(RANA_VOICE_SECRET, `${timestamp}.${rawBody}`),
// header x-rana-timestamp = unix ms. Requests older than 5 minutes are refused (replay protection).

import crypto from "crypto";
import { classifyCall, type CallRow } from "../calls";
import { normalisePhone } from "../campaigns";

export const MAX_SKEW_MS = 5 * 60_000;

export function voiceSecret(): string | null {
  const s = process.env.RANA_VOICE_SECRET;
  return s && s.length >= 32 ? s : null; // a short secret is treated as not configured
}

export function sign(secret: string, timestamp: string, rawBody: string): string {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

/** Constant-time check of a signed request. Returns null when valid, otherwise the reason. */
export function verify(secret: string | null, headers: { signature: string | null; timestamp: string | null }, rawBody: string, now = Date.now()): string | null {
  if (!secret) return "RANA voice engine is not configured (RANA_VOICE_SECRET missing or shorter than 32 characters).";
  const ts = headers.timestamp || "";
  if (!/^\d{10,16}$/.test(ts)) return "Missing or malformed x-rana-timestamp.";
  if (Math.abs(now - Number(ts)) > MAX_SKEW_MS) return "Request timestamp is too old or in the future.";
  const want = Buffer.from(sign(secret, ts, rawBody), "hex");
  const got = Buffer.from(String(headers.signature || ""), "hex");
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return "Bad signature.";
  return null;
}

export type RanaTurn = { role: "agent" | "user"; text: string; at?: number };
export type RanaCallPayload = {
  call_id: string;                 // LiveKit room / SIP call id: stable, so a retried webhook updates the same row
  client_id: string;
  script_id?: string | null;
  direction: "inbound" | "outbound";
  source?: "deployment" | "campaign" | "instant_outbound" | "manual";
  campaign_id?: string | null;
  caller_phone?: string | null;
  agent_phone?: string | null;
  caller_name?: string | null;
  started_at: string;
  ended_at: string;
  answered: boolean;               // false: never connected (no answer / busy / failed)
  end_reason?: string | null;      // caller_hangup | agent_hangup | no_answer | busy | failed | error
  transcript: RanaTurn[];
  metrics?: Record<string, number>; // e.g. avg_reply_ms, stt_ms, llm_ttft_ms, tts_ttfb_ms
  models?: Record<string, string>;  // which STT / LLM / TTS answered, for quality tracking
};

/** Shape the agent's report into a calls row, using the same classifier as every other engine. */
export function ranaPayloadToCall(p: RanaCallPayload): Partial<CallRow> {
  const transcript = (Array.isArray(p.transcript) ? p.transcript : [])
    .filter((t) => t && (t.role === "agent" || t.role === "user") && String(t.text || "").trim())
    .map((t) => ({ role: t.role, text: String(t.text).trim().slice(0, 4000) }));
  const duration = Math.max(0, Math.round((Date.parse(p.ended_at) - Date.parse(p.started_at)) / 1000)) || 0;
  const callerTurns = transcript.filter((t) => t.role === "user");
  const failed = !p.answered;
  const connectivity = failed ? (["no_answer", "busy", "failed"].includes(String(p.end_reason)) ? String(p.end_reason) : "failed") : "connected";
  const firstUser = callerTurns[0]?.text ?? null;
  const verdict = classifyCall({
    summary: null,
    callerText: callerTurns.map((t) => t.text).join(" "),
    endReason: failed ? connectivity : (p.end_reason ?? null),
    status: failed ? "failed" : "completed",
    duration: failed ? 0 : duration,
  });
  return {
    client_id: p.client_id,
    interaction_id: `rana-${p.call_id}`,
    direction: p.direction === "outbound" ? "outbound" : "inbound",
    source: p.source ?? (p.direction === "outbound" ? "instant_outbound" : "deployment"),
    campaign_id: p.campaign_id ?? null,
    caller_phone: p.caller_phone ? normalisePhone(p.caller_phone) || p.caller_phone : null,
    agent_phone: p.agent_phone ? normalisePhone(p.agent_phone) || p.agent_phone : null,
    caller_name: p.caller_name ?? null,
    duration_seconds: failed ? 0 : duration,
    connectivity_status: connectivity,
    completion_status: failed ? "failed" : "completed",
    failure_reason: failed ? (p.end_reason ?? "failed") : null,
    lead_status: verdict.status,
    lead_reason: verdict.reason,
    follow_up: verdict.followUp,
    caller_turns: callerTurns.length,
    summary: firstUser ? firstUser.slice(0, 160) : null,
    transcript,
    agent_variables: { ...(p.script_id ? { rana_script_id: p.script_id } : {}), ...(p.models ? { models: p.models } : {}), ...(p.metrics ? { metrics: p.metrics } : {}) },
    raw_payload: { engine: "rana", call_id: p.call_id, end_reason: p.end_reason ?? null, metrics: p.metrics ?? null, models: p.models ?? null },
    started_at: p.started_at,
    ended_at: p.ended_at,
  } as Partial<CallRow>;
}

/** Basic shape check before anything is stored. Returns the problem, or null. */
export function payloadProblem(p: any): string | null {
  if (!p || typeof p !== "object") return "Body must be a JSON object.";
  if (!/^[\w.:-]{6,128}$/.test(String(p.call_id || ""))) return "call_id is missing or malformed.";
  if (!/^[0-9a-f-]{36}$/i.test(String(p.client_id || ""))) return "client_id must be a UUID.";
  if (p.direction !== "inbound" && p.direction !== "outbound") return "direction must be inbound or outbound.";
  if (!Number.isFinite(Date.parse(p.started_at)) || !Number.isFinite(Date.parse(p.ended_at))) return "started_at and ended_at must be timestamps.";
  if (!Array.isArray(p.transcript)) return "transcript must be an array.";
  if (p.transcript.length > 2000) return "transcript is too long.";
  return null;
}
