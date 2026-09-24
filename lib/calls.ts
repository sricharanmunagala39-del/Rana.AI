// Calls data layer — Supabase REST via the service key (server-side only).
import type { Client } from "./supabase";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY!;

export type LeadStatus = "new" | "cold" | "warm" | "hot" | "ready_to_close" | "not_interested" | "no_answer";
export type TranscriptTurn = { role: "agent" | "user"; text: string; indic_text?: string | null };

export type CallRow = {
  id: string;
  client_id: string;
  interaction_id: string | null;
  direction: "inbound" | "outbound";
  source: "deployment" | "campaign" | "instant_outbound" | "manual";
  campaign_id: string | null;
  deployment_id: string | null;
  engine_app_id: string | null;
  caller_phone: string | null;
  agent_phone: string | null;
  caller_name: string | null;
  duration_seconds: number;
  connectivity_status: string | null;
  completion_status: string | null;
  failure_reason: string | null;
  lead_status: LeadStatus;
  summary: string | null;
  notes: string | null;
  transcript: TranscriptTurn[];
  recording_url: string | null;
  agent_variables: Record<string, unknown>;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
};

async function sb(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Prefer: "return=representation",
      ...(opts.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Supabase ${path}: ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export async function getClientByWebhookSecret(secret: string): Promise<Client | null> {
  const r = await sb(`/clients?webhook_secret=eq.${encodeURIComponent(secret)}&limit=1`);
  return r?.[0] ?? null;
}
export async function getClientByAppId(appId: string): Promise<Client | null> {
  const r = await sb(`/clients?sarvam_app_id=eq.${encodeURIComponent(appId)}&limit=1`);
  return r?.[0] ?? null;
}
export async function getClientByCartesiaWebhookSecret(secret: string): Promise<Client | null> {
  const r = await sb(`/clients?cartesia_webhook_secret=eq.${encodeURIComponent(secret)}&limit=1`);
  return r?.[0] ?? null;
}

/** Insert or update by interaction_id (idempotent — Sarvam/Cartesia may retry webhooks). */
export async function upsertCall(row: Partial<CallRow>): Promise<CallRow> {
  const r = await sb(`/calls?on_conflict=interaction_id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ ...row, updated_at: new Date().toISOString() }),
  });
  return r[0];
}

export async function listCalls(clientId: string, opts: { direction?: string; lead?: string; limit?: number; since?: string } = {}): Promise<CallRow[]> {
  const q = new URLSearchParams();
  q.set("client_id", `eq.${clientId}`);
  if (opts.direction === "inbound" || opts.direction === "outbound") q.set("direction", `eq.${opts.direction}`);
  if (opts.lead) q.set("lead_status", `eq.${opts.lead}`);
  if (opts.since) q.set("created_at", `gte.${opts.since}`);
  q.set("order", "created_at.desc");
  q.set("limit", String(Math.min(opts.limit ?? 50, 500)));
  return await sb(`/calls?${q.toString()}`);
}

export async function getCall(clientId: string, id: string): Promise<CallRow | null> {
  const r = await sb(`/calls?id=eq.${id}&client_id=eq.${clientId}&limit=1`);
  return r?.[0] ?? null;
}

export async function updateCall(clientId: string, id: string, patch: Partial<Pick<CallRow, "lead_status" | "notes" | "caller_name">>): Promise<CallRow | null> {
  const r = await sb(`/calls?id=eq.${id}&client_id=eq.${clientId}`, {
    method: "PATCH",
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  return r?.[0] ?? null;
}

/* ───────── Webhook payload normalisation ───────── */

const NAME_KEYS = ["caller_name", "customer_name", "student_name", "doctor_name", "full_name", "name", "user_name"];
const LEAD_KEYS = ["lead_status", "lead_classification", "lead_type", "lead_temperature", "lead_quality", "lead", "interest_level", "call_outcome", "call_disposition", "disposition", "outcome"];
const SUMMARY_KEYS = ["summary", "call_summary", "conversation_summary"];

function pick(vars: Record<string, unknown>, keys: string[]): string | null {
  const lower: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(vars)) lower[k.toLowerCase()] = v;
  for (const k of keys) {
    const v = lower[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

export function classifyLead(vars: Record<string, unknown>, connectivity: string | null, duration: number): LeadStatus {
  if (connectivity && ["no_answer", "busy", "failed"].includes(connectivity)) return "no_answer";
  const raw = (pick(vars, LEAD_KEYS) || "").toLowerCase();
  if (raw) {
    if (/ready|close|enrol|enroll|book|convert/.test(raw)) return "ready_to_close";
    if (/hot|high/.test(raw)) return "hot";
    if (/warm|medium|interested|callback|follow/.test(raw)) return "warm";
    if (/not.?interested|decline|reject|dnd|do not/.test(raw)) return "not_interested";
    if (/cold|low/.test(raw)) return "cold";
  }
  if (duration < 15) return "cold";
  return "new";
}

export function normaliseTranscript(t: unknown): TranscriptTurn[] {
  if (!Array.isArray(t)) return [];
  return t
    .map((turn: any) => ({
      role: turn?.role === "agent" ? "agent" : "user",
      text: String(turn?.en_text ?? turn?.text ?? ""),
      indic_text: turn?.indic_text ?? null,
    }))
    .filter((x) => x.text.trim().length > 0) as TranscriptTurn[];
}

/** Turn any of Sarvam's three webhook shapes (deployment / campaign / instant outbound) into a CallRow. */
export function payloadToCall(p: any, clientId: string): Partial<CallRow> {
  const vars: Record<string, unknown> = { ...(p.initial_agent_variables ?? {}), ...(p.final_agent_variables ?? {}), ...(p.output_agent_variables ?? {}) };
  const connectivity: string | null = p.connectivity_status ?? p.status ?? null;
  const duration = Number(p.duration ?? 0) || 0;
  const transcript = normaliseTranscript(p.interaction_transcript);

  let source: CallRow["source"] = "deployment";
  let direction: CallRow["direction"] = "inbound";
  if (p.campaign_id) { source = "campaign"; direction = "outbound"; }
  else if (!p.deployment_id && p.attempt_id) { source = "instant_outbound"; direction = "outbound"; }

  const firstUser = transcript.find((t) => t.role === "user")?.text ?? null;
  const summary = pick(vars, SUMMARY_KEYS) ?? (firstUser ? firstUser.slice(0, 160) : null);

  return {
    client_id: clientId,
    interaction_id: p.interaction_id ?? p.attempt_id ?? null,
    direction,
    source,
    campaign_id: p.campaign_id ?? null,
    deployment_id: p.deployment_id ?? null,
    engine_app_id: p.app_id ?? null,
    caller_phone: p.user_phone_number ?? null,
    agent_phone: p.agent_phone_number ?? null,
    caller_name: pick(vars, NAME_KEYS),
    duration_seconds: duration,
    connectivity_status: connectivity,
    completion_status: p.completion_status ?? null,
    failure_reason: p.failure_reason ?? null,
    lead_status: classifyLead(vars, connectivity, duration),
    summary,
    transcript,
    agent_variables: vars,
    raw_payload: p,
    started_at: p.start_datetime ?? p.executed_at ?? null,
    ended_at: p.end_datetime ?? null,
  } as Partial<CallRow>;
}

/**
 * Turn a Cartesia call_completed / call_failed webhook event into a CallRow.
 *
 * Confirmed from Cartesia's docs: top-level `type`, `call_id`, `agent_id`, `webhook_id`,
 * `timestamp`, and a nested `call` object with `id`, `agent_id`, `agent_name`, `status`,
 * `end_reason`, `transcript`. NOT independently confirmed: the exact shape of each
 * `call.transcript` entry (guessed here as `{ role, text }`, mirroring the WebSocket
 * `turn_ended` event shape), and whether duration/phone-number fields are on `call` at all —
 * this raw payload is always kept in `raw_payload` regardless, so nothing is lost if these
 * guesses are wrong. Tighten this against a real delivery once one arrives.
 */
export function normaliseCartesiaTranscript(t: unknown): TranscriptTurn[] {
  if (!Array.isArray(t)) return [];
  return t
    .map((turn: any) => ({
      role: turn?.role === "assistant" ? "agent" : "user",
      text: String(turn?.text ?? turn?.content ?? ""),
      indic_text: null,
    }))
    .filter((x) => x.text.trim().length > 0) as TranscriptTurn[];
}

export function payloadToCallFromCartesia(p: any, clientId: string): Partial<CallRow> {
  const call = p?.call ?? p;
  const transcript = normaliseCartesiaTranscript(call?.transcript ?? p?.transcript);
  const duration = Number(call?.duration_seconds ?? call?.duration ?? 0) || 0;
  const endReason: string | null = call?.end_reason ?? p?.end_reason ?? null;
  const connectivity: string | null =
    endReason === "no_answer" || endReason === "busy" || endReason === "failed" ? endReason : (call?.status ?? null);

  const firstUser = transcript.find((t) => t.role === "user")?.text ?? null;

  return {
    client_id: clientId,
    interaction_id: call?.id ?? p?.call_id ?? null,
    direction: call?.direction === "outbound" ? "outbound" : "inbound",
    source: "deployment",
    campaign_id: null,
    deployment_id: null,
    engine_app_id: call?.agent_id ?? p?.agent_id ?? null,
    caller_phone: call?.from ?? call?.caller_phone_number ?? null,
    agent_phone: call?.to ?? call?.agent_phone_number ?? null,
    caller_name: null,
    duration_seconds: duration,
    connectivity_status: connectivity,
    completion_status: call?.status ?? null,
    failure_reason: endReason,
    lead_status: classifyLead({}, connectivity, duration),
    summary: firstUser ? firstUser.slice(0, 160) : null,
    transcript,
    agent_variables: {},
    recording_url: null,
    raw_payload: p,
    started_at: null,
    ended_at: null,
  } as Partial<CallRow>;
}

/* ── Cartesia List Calls → CallRow ──
   Shape confirmed against docs.cartesia.ai/api-reference/agents/calls/list-calls:
   { id, agent_id, agent_name, start_time, end_time, status (created|started|completed|failed),
     end_reason, transcript[] (with expand=transcript), summary, telephony_params {to, from, call_sid,
     direction, connection_type}, telephony_account_type, error_message, dynamic_variables }
*/

/** Reads Cartesia's auto-summary for buying signals. Duration and end_reason gate it first. */
export function classifyFromSummary(summary: string | null, endReason: string | null, duration: number, vars: Record<string, unknown> = {}): LeadStatus {
  const fromVars = classifyLead(vars, null, 999);
  if (fromVars !== "new") return fromVars;
  if (endReason && /dial_failed|no_answer|busy|failed|voicemail/.test(endReason)) return "no_answer";
  if (duration > 0 && duration < 15) return "cold";
  const s = (summary || "").toLowerCase();
  if (!s) return "new";
  if (/not interested|no interest|declined|do not call|dnd|wrong number|already (joined|enrolled|bought)/.test(s)) return "not_interested";
  if (/ready to (join|enrol|enroll|pay|book|buy)|wants to (join|enrol|enroll|pay|book|buy)|payment|site visit|schedule[d]? (a )?(visit|demo)|confirmed/.test(s)) return "ready_to_close";
  if (/fee|price|cost|batch|when (does|will)|interested|callback|call back|details|brochure|discount|emi|availability/.test(s)) return duration >= 60 ? "hot" : "warm";
  return duration >= 90 ? "warm" : "cold";
}

export function callFromCartesiaApi(call: any, clientId: string): Partial<CallRow> & { created_at?: string } {
  const tp = call?.telephony_params ?? {};
  const direction: "inbound" | "outbound" = tp.direction === "outbound" || call?.batch_id ? "outbound" : "inbound";
  const start = call?.start_time ?? null;
  const end = call?.end_time ?? null;
  const duration = start && end ? Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 1000)) : 0;
  const endReason: string | null = call?.end_reason ?? null;
  const transcript = normaliseCartesiaTranscript(call?.transcript);
  const vars = (call?.dynamic_variables ?? {}) as Record<string, unknown>;
  const connectivity =
    call?.status === "failed" || (endReason && /dial_failed|no_answer|busy/.test(endReason)) ? "failed"
    : duration > 0 ? "connected" : (call?.status ?? null);
  const firstUser = transcript.find((t) => t.role === "user")?.text ?? null;
  const summary: string | null = call?.summary || (firstUser ? firstUser.slice(0, 160) : null);
  const customerPhone = direction === "inbound" ? (tp.from ?? null) : (tp.to ?? null);
  const agentPhone = direction === "inbound" ? (tp.to ?? null) : (tp.from ?? null);

  return {
    client_id: clientId,
    interaction_id: call?.id ?? null,
    direction,
    source: direction === "outbound" ? (call?.batch_id ? "campaign" : "instant_outbound") : "deployment",
    campaign_id: call?.batch_id ?? null,
    deployment_id: null,
    engine_app_id: call?.agent_id ?? null,
    caller_phone: customerPhone,
    agent_phone: agentPhone,
    caller_name: (vars.name as string) ?? (vars.caller_name as string) ?? null,
    duration_seconds: duration,
    connectivity_status: connectivity,
    completion_status: call?.status ?? null,
    failure_reason: call?.error_message ?? endReason,
    lead_status: classifyFromSummary(summary, endReason, duration, vars),
    summary,
    transcript,
    agent_variables: vars,
    recording_url: null,
    raw_payload: call,
    started_at: start,
    ended_at: end,
    // Keep dashboard "today" counts honest: a call's row dates from when the call happened, not when we synced it.
    ...(start ? { created_at: start } : {}),
  } as any;
}

/** Newest start_time we already hold for this client's Cartesia calls — the sync resumes from here. */
export async function latestCartesiaCallStart(clientId: string): Promise<string | null> {
  const r = await sb(`/calls?client_id=eq.${clientId}&engine_app_id=like.agent_*&started_at=not.is.null&order=started_at.desc&limit=1&select=started_at`);
  return r?.[0]?.started_at ?? null;
}

/** Which of these Cartesia call ids we already hold, and whether that copy is final. Finished calls are never
 *  re-written, so a lead status or note a salesperson changed by hand survives every later sync. */
export async function existingCallState(ids: string[]): Promise<Record<string, { final: boolean }>> {
  if (!ids.length) return {};
  const list = ids.map((i) => `"${i.replace(/"/g, "")}"`).join(",");
  const r = await sb(`/calls?interaction_id=in.(${encodeURIComponent(list)})&select=interaction_id,completion_status`);
  const out: Record<string, { final: boolean }> = {};
  for (const row of r || []) out[row.interaction_id] = { final: row.completion_status === "completed" || row.completion_status === "failed" };
  return out;
}
