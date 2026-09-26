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
  lead_reason?: string | null;
  follow_up?: boolean;
  caller_turns?: number;
  handoff?: { rule: string; label: string; to_name: string | null; to_team: string | null; to_phone: string | null; quote: string; emailed: boolean; at: string } | null;
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
  return upsertCallRow(row);
}

/** The stored row for an interaction id (any client) — used to keep webhook retries from overwriting other data. */
export async function existingCall(interactionId: string): Promise<any | null> {
  const r = await sb(`/calls?interaction_id=eq.${encodeURIComponent(interactionId)}&select=client_id,lead_status,lead_reason,recording_url,handoff&limit=1`).catch(() => null);
  return r?.[0] ?? null;
}

async function upsertCallRow(row: Partial<CallRow>): Promise<CallRow> {
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
  q.set("source", "neq.manual"); // Talk-page tests never show up as real calls
  q.set("order", "created_at.desc");
  q.set("limit", String(Math.min(opts.limit ?? 50, 500)));
  return await sb(`/calls?${q.toString()}`);
}

export async function getCall(clientId: string, id: string): Promise<CallRow | null> {
  const r = await sb(`/calls?id=eq.${id}&client_id=eq.${clientId}&limit=1`);
  return r?.[0] ?? null;
}

export async function updateCall(clientId: string, id: string, patch: Partial<Pick<CallRow, "lead_status" | "notes" | "caller_name" | "lead_reason" | "follow_up">>): Promise<CallRow | null> {
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
    // Negatives first: "not_interested" contains "interested", "not_ready" contains "ready".
    if (/not.?interested|no.?interest|not.?ready|no.?book|decline|reject|dnd|do not/.test(raw)) return "not_interested";
    if (/ready|close|enrol|enroll|book|convert/.test(raw)) return "ready_to_close";
    if (/hot|high/.test(raw)) return "hot";
    if (/warm|medium|interested|callback|follow/.test(raw)) return "warm";
    if (/cold|low/.test(raw)) return "cold";
  }
  if (duration < 15) return "cold";
  return "new";
}

export function normaliseTranscript(t: unknown): TranscriptTurn[] {
  if (!Array.isArray(t)) return [];
  return t
    .map((turn: any) => ({
      // Sarvam labels the agent "bot"; others use "agent"/"assistant".
      role: ["agent", "bot", "assistant"].includes(String(turn?.role || "").toLowerCase()) ? "agent" : "user",
      // English text drives lead scoring; the original Telugu/Hindi is kept in indic_text.
      text: String(turn?.en_text || turn?.text || turn?.content || turn?.indic_text || ""),
      indic_text: turn?.indic_text ?? null,
    }))
    .filter((x) => x.text.trim().length > 0) as TranscriptTurn[];
}

/** Webhook payloads echo every agent variable back; drop the (long) compiled instructions before storing. */
function stripInstructions(p: any) {
  const clean = (v: any) => (v && typeof v === "object" ? Object.fromEntries(Object.entries(v).filter(([k]) => k !== "rana_instructions")) : v);
  return { ...p, initial_agent_variables: clean(p?.initial_agent_variables), final_agent_variables: clean(p?.final_agent_variables), output_agent_variables: clean(p?.output_agent_variables) };
}

/** Turn any of Sarvam's three webhook shapes (deployment / campaign / instant outbound) into a CallRow. */
export function payloadToCall(p: any, clientId: string): Partial<CallRow> {
  const vars: Record<string, unknown> = { ...(p.initial_agent_variables ?? {}), ...(p.final_agent_variables ?? {}), ...(p.output_agent_variables ?? {}) };
  // The compiled instructions travel as a variable on every RANA call — never store them on each call row.
  delete vars.rana_instructions;
  const connectivity: string | null = p.connectivity_status ?? p.status ?? null;
  const duration = Number(p.duration ?? 0) || 0;
  const transcript = normaliseTranscript(p.interaction_transcript);

  let source: CallRow["source"] = "deployment";
  let direction: CallRow["direction"] = "inbound";
  if (p.campaign_id) { source = "campaign"; direction = "outbound"; }
  else if (!p.deployment_id && p.attempt_id) { source = "instant_outbound"; direction = "outbound"; }
  // Browser sessions from the Talk page (and RANA's own diagnostics) are tests, never results.
  const uid = String(p.user_identifier ?? p.user_id ?? "");
  const phoneish = /\d{6,}/.test(String(p.user_phone_number ?? ""));
  if (!p.campaign_id && (/^rana-(test|diagnose)/.test(uid) || (!phoneish && !p.attempt_id))) source = "manual";

  const firstUser = transcript.find((t) => t.role === "user")?.text ?? null;
  const summary = pick(vars, SUMMARY_KEYS) ?? (firstUser ? firstUser.slice(0, 160) : null);
  const callerTurns = transcript.filter((t) => t.role === "user");
  const notConnected = connectivity && ["no_answer", "busy", "failed"].includes(connectivity);
  const verdict = classifyCall({
    summary, callerText: callerTurns.map((t) => t.text).join(" "), endReason: notConnected ? connectivity : (p.failure_reason ?? null),
    status: notConnected ? "failed" : "completed", duration, vars,
  });

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
    lead_status: verdict.status,
    lead_reason: verdict.reason,
    follow_up: verdict.followUp,
    caller_turns: callerTurns.length,
    summary,
    transcript,
    agent_variables: vars,
    raw_payload: stripInstructions(p),
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

/* ── How RANA decides what a call was ──
   One ordered rule list; the first rule that matches wins and its sentence is stored in
   calls.lead_reason, so every number on the dashboard can be traced to a plain reason.
   Text scanned = Cartesia's call summary + everything the caller said (English plus common
   Telugu/Hindi transliterations). */
const RX = {
  unreachable: /dial_failed|no_answer|busy|voicemail|failed|rejected|unreachable/,
  refusal: /not interested|no interest|don'?t call (me|again)|don'?t want (it|this|to join|the course)|do not call|dnd|wrong number|already (joined|enrolled|bought|taken)|stop calling|vaddu|interest ledu|avasaram ledu|nahi chahiye|mat karo|zaroorat nahi/,
  commit: /ready to (join|enrol|enroll|pay|book|buy|visit)|wants? to (join|enrol|enroll|pay|book|buy)|send (me )?(the )?(payment|upi) link|how (do|can) i pay|payment link|site visit|book(ed)? (a )?(seat|slot|visit|demo)|confirmed|join chest|join karunga|pay chest/,
  buying: /fee|fees|price|cost|batch|timing|schedule|syllabus|discount|emi|installment|scholarship|availability|location|address|brochure|details|when (does|will|is)|entha|kitna|eppudu|kab se/,
  callback: /call (me )?back|callback|call later|call tomorrow|busy now|follow ?up|tarvata call|repu call|baad mein|kal call/,
};

export type Classification = { status: LeadStatus; reason: string; followUp: boolean };

export function classifyCall(input: {
  summary: string | null; callerText: string; endReason: string | null; status: string | null;
  duration: number; vars?: Record<string, unknown>;
}): Classification {
  const { summary, callerText, endReason, status, duration, vars = {} } = input;
  const text = `${summary || ""} ${callerText || ""}`.toLowerCase();
  const followUp = RX.callback.test(text);

  const agentSaid = pick(vars, LEAD_KEYS);
  if (agentSaid) {
    const s = classifyLead(vars, null, 999);
    if (s !== "new") return { status: s, reason: `The agent recorded the outcome as "${agentSaid}".`, followUp };
  }
  if (status === "failed" || (endReason && RX.unreachable.test(endReason)) || duration <= 0) {
    return { status: "no_answer", reason: `Not connected${endReason ? ` (${endReason.replace(/_/g, " ")})` : ""} — counted as DNP.`, followUp: false };
  }
  if (duration < 15) return { status: "cold", reason: `Connected but ended within ${duration}s — too short to qualify.`, followUp };
  const refusal = text.match(RX.refusal);
  if (refusal) return { status: "not_interested", reason: `Caller declined ("${refusal[0]}").`, followUp: false };
  const commit = text.match(RX.commit);
  if (commit) return { status: "ready_to_close", reason: `Commitment signal ("${commit[0]}") — hand to sales now.`, followUp: true };
  const buying = text.match(RX.buying);
  if (buying && duration >= 60) return { status: "hot", reason: `Asked about "${buying[0]}" and talked ${Math.round(duration)}s (≥60s).`, followUp };
  if (buying) return { status: "warm", reason: `Asked about "${buying[0]}" but the call was short (${Math.round(duration)}s).`, followUp };
  if (followUp) return { status: "warm", reason: "Asked to be called back later.", followUp: true };
  if (duration >= 90) return { status: "warm", reason: `Long conversation (${Math.round(duration)}s) without a clear buying question.`, followUp };
  return { status: "cold", reason: `Connected ${Math.round(duration)}s with no interest signal.`, followUp };
}

/** Kept for older call sites: status only. */
export function classifyFromSummary(summary: string | null, endReason: string | null, duration: number, vars: Record<string, unknown> = {}): LeadStatus {
  return classifyCall({ summary, callerText: "", endReason, status: null, duration, vars }).status;
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
  const callerTurns = transcript.filter((t) => t.role === "user");
  const verdict = classifyCall({
    summary, callerText: callerTurns.map((t) => t.text).join(" "), endReason,
    status: call?.status ?? null, duration, vars,
  });
  const customerPhone = direction === "inbound" ? (tp.from ?? null) : (tp.to ?? null);
  const agentPhone = direction === "inbound" ? (tp.to ?? null) : (tp.from ?? null);
  // No phone on either side = a browser test from the Talk page. Kept, but never counted in results.
  const isTest = !call?.batch_id && ((!tp.to && !tp.from) || tp.connection_type === "websocket" || tp.from === "websocket" || String(tp.call_sid ?? "").startsWith("web_"));

  return {
    client_id: clientId,
    interaction_id: call?.id ?? null,
    direction,
    source: isTest ? "manual" : direction === "outbound" ? (call?.batch_id ? "campaign" : "instant_outbound") : "deployment",
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
    lead_status: verdict.status,
    lead_reason: isTest ? `Test call from the Talk page (would have been: ${verdict.status.replace(/_/g, " ")}). Not counted in results.` : verdict.reason,
    follow_up: verdict.followUp,
    caller_turns: callerTurns.length,
    summary,
    transcript,
    agent_variables: vars,
    recording_url: call?.recording_url ?? call?.recording?.url ?? null,
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

/** Lean rows for dashboard maths — no transcript / raw payload. */
export type LeanCall = Pick<CallRow, "id" | "direction" | "source" | "campaign_id" | "caller_name" | "caller_phone" | "duration_seconds" | "connectivity_status" | "completion_status" | "failure_reason" | "lead_status" | "summary" | "created_at"> & { lead_reason: string | null; follow_up: boolean; caller_turns: number };

export async function listCallsLean(clientId: string, fromIso: string, toIso: string, max = 20000): Promise<LeanCall[]> {
  const cols = "id,direction,source,campaign_id,caller_name,caller_phone,duration_seconds,connectivity_status,completion_status,failure_reason,lead_status,lead_reason,follow_up,caller_turns,summary,created_at";
  const out: LeanCall[] = [];
  for (let offset = 0; offset < max; offset += 1000) {
    const q = `/calls?client_id=eq.${clientId}&created_at=gte.${encodeURIComponent(fromIso)}&created_at=lt.${encodeURIComponent(toIso)}&select=${cols}&order=created_at.desc&limit=1000&offset=${offset}`;
    const page: LeanCall[] = await sb(q);
    out.push(...(page || []));
    if (!page || page.length < 1000) break;
  }
  return out;
}

export type CampaignRow = { id: string; name: string; cartesia_batch_id: string | null; status: string; total_contacts: number; created_at: string };
export async function listCampaigns(clientId: string): Promise<CampaignRow[]> {
  return (await sb(`/campaigns?client_id=eq.${clientId}&select=id,name,cartesia_batch_id,status,total_contacts,created_at&order=created_at.desc&limit=500`)) || [];
}
