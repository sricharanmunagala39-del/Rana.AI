// Sarvam voice engine. RANA keeps every employee's script; Sarvam runs the call.
//
// Sarvam's public API can start calls, campaigns and browser sessions but cannot edit an agent's prompt,
// so RANA uses one "RANA Runtime" agent in Sarvam whose instructions are a single input variable,
// `rana_instructions`. Every call (browser test, phone call, campaign) passes that employee's compiled
// instructions, greeting and opening language, so publishing in RANA takes effect on the next call.
//
// Keys: Voice Agents keys (sk_samvaad_…) are separate from Sarvam API keys (sk_…) — RANA_SARVAM_AGENTS_API_KEY.
import { LANG_NAMES, baseLang } from "./playbook";

const APPS = "https://apps.sarvam.ai/api";

export type SarvamConfig = {
  apiKey: string; orgId: string; workspaceId: string; appId: string; appVersion: number;
  connectionId: string | null; agentNumber: string | null;
};

export function sarvamConfig(): SarvamConfig | null {
  const apiKey = process.env.RANA_SARVAM_AGENTS_API_KEY || "";
  const orgId = process.env.RANA_SARVAM_ORG_ID || "";
  const workspaceId = process.env.RANA_SARVAM_WORKSPACE_ID || "";
  const appId = process.env.RANA_SARVAM_APP_ID || "";
  if (!apiKey || !orgId || !workspaceId || !appId) return null;
  return {
    apiKey, orgId, workspaceId, appId,
    appVersion: Number(process.env.RANA_SARVAM_APP_VERSION || "1") || 1,
    connectionId: process.env.RANA_SARVAM_CONNECTION_ID || null,
    agentNumber: process.env.RANA_SARVAM_AGENT_NUMBER || null,
  };
}

/** A client with its own number calls from it; everyone else uses RANA's shared Sarvam number. */
export function withClientNumber(cfg: SarvamConfig, client: any): SarvamConfig {
  const own = String(client?.sarvam_agent_number || "").trim();
  return own ? { ...cfg, agentNumber: own } : cfg;
}

export function sarvamMissing(): string[] {
  return ["RANA_SARVAM_AGENTS_API_KEY", "RANA_SARVAM_ORG_ID", "RANA_SARVAM_WORKSPACE_ID", "RANA_SARVAM_APP_ID"].filter((k) => !process.env[k]);
}

/** The voice set on the RANA Runtime agent in Sarvam (Settings → Voice). Shown in RANA and used for previews. */
export const SARVAM_AGENT_VOICE = { name: "Priya", speaker: "priya", gender: "feminine" };

/** Sarvam names languages in full ("Telugu"); RANA stores codes ("te-IN"). */
export function sarvamLanguageName(code: string | null | undefined): string {
  const name = LANG_NAMES[baseLang(code)] || "English";
  return ["English", "Hindi", "Telugu", "Tamil", "Kannada", "Malayalam", "Marathi", "Bengali", "Gujarati", "Punjabi", "Odia"].includes(name) ? name : "English";
}

/** What every call of this employee sends to Sarvam. Caller details are appended to the instructions so they work without extra agent variables. */
export function sessionPayload(script: any, caller?: { name?: string | null; variables?: Record<string, string> }) {
  const base = String(script.instructions || "").trim();
  const details = [
    caller?.name ? `- Name: ${caller.name}` : "",
    ...Object.entries(caller?.variables || {}).filter(([, v]) => String(v || "").trim()).map(([k, v]) => `- ${k.replace(/_/g, " ")}: ${v}`),
  ].filter(Boolean);
  const rana_instructions = (details.length ? `${base}\n\n# About this caller\n${details.join("\n")}` : base).slice(0, 30000);
  return {
    agent_variables: { rana_instructions },
    initial_bot_message: String(script.greeting || "").trim() || undefined,
    initial_language_name: sarvamLanguageName(script.starting_language),
  };
}

async function call<T = any>(url: string, init: RequestInit & { key: string }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", "X-API-Key": init.key, ...(init.headers || {}) },
    signal: AbortSignal.timeout(30000),
    cache: "no-store",
  });
  const text = await res.text();
  let data: any; try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) {
    const detail = data?.error?.data?.details || data?.error?.message || data?.detail || data?.message || text.slice(0, 200);
    throw new Error(`Sarvam ${res.status}: ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 200)}`);
  }
  return data as T;
}

/** Sarvam names: letters, numbers, spaces, underscores and hyphens only, max 50. */
export function sarvamName(name: string, fallback = "RANA campaign"): string {
  const clean = String(name || "").normalize("NFKD").replace(/[^\w\- ]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 50).trim();
  return clean || fallback;
}

/** Ways Sarvam has accepted a phone connection (its docs and live API differ); tried in order, moving on only when Sarvam rejects the shape (422). */
function connectionShapes(cfg: SarvamConfig): Record<string, any>[] {
  const n = cfg.agentNumber;
  if (!n) return [{ connection_id: cfg.connectionId }];
  return [
    { connection_id: cfg.connectionId, phone_numbers: [n] },
    { connection_id: cfg.connectionId, agent_phone_number: n, phone_numbers: [n] },
    { connection_id: cfg.connectionId, agent_phone_number: n },
  ];
}

async function postWithConnection<T>(url: string, cfg: SarvamConfig, build: (conn: Record<string, any>) => any): Promise<T> {
  let last: any = null;
  for (const conn of connectionShapes(cfg)) {
    try { return await call<T>(url, { method: "POST", key: cfg.apiKey, body: JSON.stringify(build(conn)) }); }
    catch (e: any) { last = e; if (!/Sarvam 422/.test(String(e?.message))) throw e; }
  }
  throw last;
}

/** A single-use WebSocket URL for one browser voice session (the API key never reaches the browser). */
export async function signedSessionUrl(cfg: SarvamConfig, userId: string): Promise<{ url: string; referenceId: string; expiresAt: number | null }> {
  const q = new URLSearchParams({ interaction_type: "call", version: String(cfg.appVersion) });
  const d = await call<any>(`${APPS}/app-runtime/orgs/${cfg.orgId}/workspaces/${cfg.workspaceId}/apps/${cfg.appId}/url?${q}`, { method: "GET", key: cfg.apiKey });
  if (!d?.url) throw new Error("Sarvam didn't return a session URL — is the RANA Runtime agent committed?");
  return { url: sessionWsUrl(d.url, userId), referenceId: d.reference_id, expiresAt: d.expires_at ?? null };
}

/** The WebSocket URL exactly as Sarvam's SDK builds it: signed URL + user identifier, sample rate and interaction type. */
export function sessionWsUrl(signedUrl: string, userId: string, sampleRate = 16000): string {
  const u = new URL(signedUrl);
  u.searchParams.set("user_identifier", userId);
  u.searchParams.set("user_identifier_type", "custom");
  u.searchParams.set("sample_rate", String(sampleRate));
  u.searchParams.set("interaction_type", "call");
  return u.toString();
}

export function webhookUrl(clientSecret: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://ranaai.in").replace(/\/$/, "");
  return `${base}/api/webhooks/sarvam?key=${encodeURIComponent(clientSecret)}`;
}

/** One outbound phone call right now. */
export async function placeOutboundCall(cfg: SarvamConfig, input: { phone: string; script: any; caller?: { name?: string | null; variables?: Record<string, string> }; webhook?: string | null; metadata?: Record<string, string> }) {
  if (!cfg.connectionId) throw new Error("No Sarvam phone connection is set (RANA_SARVAM_CONNECTION_ID).");
  const p = sessionPayload(input.script, input.caller);
  const body = {
    app_config: {
      app_id: cfg.appId, app_version: cfg.appVersion, app_type: "agent",
      connection_config: null as any,
      agent_variables: p.agent_variables,
      app_overrides: { initial_bot_message: p.initial_bot_message, initial_language_name: p.initial_language_name },
    },
    user_config: { user_phone_number: input.phone },
    ...(input.webhook ? { webhook_config: { url: input.webhook, metadata: input.metadata || {} } } : {}),
  };
  return postWithConnection<{ attempt_id: string }>(`${APPS}/outbounds/v1/orgs/${cfg.orgId}/workspaces/${cfg.workspaceId}/outbounds`, cfg,
    (conn) => ({ ...body, app_config: { ...body.app_config, connection_config: conn } }));
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const hhmm = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

/** A Sarvam campaign for one RANA campaign; contacts are streamed in afterwards. */
export async function createSarvamCampaign(cfg: SarvamConfig, input: {
  name: string; startAt: Date; rules: { startMin: number; endMin: number; days: number[]; timezone: string };
  attemptsPerSecond: number; webhook: string | null; metadata?: Record<string, string>;
}) {
  if (!cfg.connectionId) throw new Error("No Sarvam phone connection is set (RANA_SARVAM_CONNECTION_ID).");
  const end = new Date(input.startAt.getTime() + 30 * 86400000);
  const body = {
    name: sarvamName(input.name), description: `RANA AI - ${input.name}`.slice(0, 150),
    start_timestamp: input.startAt.toISOString(), end_timestamp: end.toISOString(),
    allowed_schedule: {
      allowed_start_time: hhmm(input.rules.startMin), allowed_end_time: hhmm(Math.min(input.rules.endMin, 23 * 60 + 59)),
      allowed_days: (input.rules.days.length ? input.rules.days : [1, 2, 3, 4, 5, 6]).map((d) => DAY_NAMES[d]),
      timezone: input.rules.timezone || "Asia/Kolkata",
    },
    ...(input.webhook ? { webhook_config: { url: input.webhook, metadata: input.metadata || {} } } : {}),
    app_config: {
      app_id: cfg.appId, app_version: cfg.appVersion, app_type: "agent",
      attempts_per_second: Math.max(0.1, Math.min(10, input.attemptsPerSecond)),
      connection_configs: [] as any[],
      retry_config: {
        max_retries: 2, retry_interval_minutes: 60,
        retry_on: { busy: { enabled: true }, no_answer: { enabled: true }, failed: { enabled: false }, short_duration: { enabled: false, threshold_seconds: 10 } },
      },
    },
  };
  return postWithConnection<{ campaign_id: string; status: string }>(`${APPS}/scheduling/v1/orgs/${cfg.orgId}/workspaces/${cfg.workspaceId}/campaigns`, cfg,
    (conn) => ({ ...body, app_config: { ...body.app_config, connection_configs: [conn] } }));
}

/** Adds contacts (max 1,000 per request) with each person's instructions and greeting. */
export async function streamCampaignContacts(cfg: SarvamConfig, campaignId: string, script: any, contacts: { name: string | null; phone: string; variables: Record<string, string> }[], label: string) {
  const results: any[] = [];
  for (let i = 0; i < contacts.length; i += 1000) {
    const users = contacts.slice(i, i + 1000).map((c) => {
      const p = sessionPayload(script, { name: c.name, variables: c.variables });
      return {
        user_phone_number: c.phone,
        user_identifier: c.phone,
        app_variables: p.agent_variables,
        app_overrides: { initial_bot_message: p.initial_bot_message, initial_language_name: p.initial_language_name },
      };
    });
    results.push(await call(`${APPS}/scheduling/v1/orgs/${cfg.orgId}/workspaces/${cfg.workspaceId}/campaigns/${campaignId}/cohorts/stream`, {
      method: "POST", key: cfg.apiKey, body: JSON.stringify({ name: sarvamName(`${sarvamName(label).slice(0, 44)} ${Math.floor(i / 1000) + 1}`, "RANA contacts"), users }),
    }));
  }
  return results;
}

export async function getSarvamCampaign(cfg: SarvamConfig, campaignId: string) {
  return call<any>(`${APPS}/scheduling/v1/orgs/${cfg.orgId}/workspaces/${cfg.workspaceId}/campaigns/${campaignId}`, { method: "GET", key: cfg.apiKey });
}

export async function setSarvamCampaignStatus(cfg: SarvamConfig, campaignId: string, action: "pause" | "resume" | "cancel") {
  return call<any>(`${APPS}/scheduling/v1/orgs/${cfg.orgId}/workspaces/${cfg.workspaceId}/campaigns/${campaignId}/status`, { method: "PUT", key: cfg.apiKey, body: JSON.stringify({ action }) });
}

/** Best-effort recording link for a finished call. Never throws. */
export async function recordingUrl(cfg: SarvamConfig, appId: string, interactionId: string): Promise<string | null> {
  try {
    const d = await call<any>(`${APPS}/analytics/v1/${cfg.orgId}/${cfg.workspaceId}/${appId}/recordings/${interactionId}`, { method: "GET", key: cfg.apiKey });
    const url = d?.recording_url ?? d?.url ?? d?.audio_url ?? d?.signed_url ?? d?.download_url ?? null;
    return typeof url === "string" && url ? url : null;
  } catch { return null; }
}

/** Plain Sarvam TTS (Bulbul v3) for voice previews and pronunciation tests. Uses the Sarvam API key, not the agents key. */
export async function sarvamTts(opts: { text: string; language: string; speaker?: string; pace?: number }): Promise<ArrayBuffer> {
  const key = process.env.SARVAM_CHAT_API_KEY || process.env.SARVAM_API_KEY;
  if (!key) throw new Error("SARVAM_CHAT_API_KEY is not set");
  const lang = baseLang(opts.language);
  const code = ["en", "hi", "te", "ta", "kn", "ml", "mr", "bn", "gu", "pa", "od"].includes(lang) ? `${lang}-IN` : "en-IN";
  const res = await fetch("https://api.sarvam.ai/text-to-speech", {
    method: "POST",
    headers: { "api-subscription-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      text: opts.text.slice(0, 2400), target_language_code: code,
      speaker: (opts.speaker || SARVAM_AGENT_VOICE.speaker).toLowerCase(), model: "bulbul:v3",
      pace: Math.min(2, Math.max(0.5, opts.pace || 1)), output_audio_codec: "mp3", speech_sample_rate: 24000,
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Sarvam TTS ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const d = await res.json();
  const b64 = d?.audios?.[0];
  if (!b64) throw new Error("Sarvam TTS returned no audio");
  const buf = Buffer.from(b64, "base64");
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}
