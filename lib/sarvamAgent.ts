// Sarvam voice engine. RANA keeps every employee's script; Sarvam runs the call.
//
// Sarvam's public API can start calls, campaigns and browser sessions but cannot edit an agent's prompt,
// so RANA uses one "RANA Runtime" agent in Sarvam whose instructions are a single input variable,
// `rana_instructions`. Every call (browser test, phone call, campaign) passes that employee's compiled
// instructions, greeting and opening language, so publishing in RANA takes effect on the next call.
//
// Keys: Voice Agents keys (sk_samvaad_…) are separate from Sarvam API keys (sk_…) — RANA_SARVAM_AGENTS_API_KEY.
import { sarvamFetch, SarvamError, classifySarvamError } from "./sarvamHealth";
import { liveTransferOn, normalizeHandoff, scriptRefLine, transferNumber } from "./handoff";
import { LANG_NAMES, baseLang, normalizePronunciations } from "./playbook";
import { speakableGreeting } from "./acronym";
import { BOTH_STYLES, STYLE_MARKER, TONE_MARKER, TONE_STYLE, directionStyle, type CallDirection } from "./callStyle";
import { findR1Voice, r1PreviewSpeaker } from "./sarvamVoiceCatalog";
import { getSetting } from "./platformSettings";

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
  if (!own) return cfg;
  // A number bought through RANA may sit on its own Sarvam phone connection (RANA's Vobiz account).
  const conn = String(client?.sarvam_connection_id || "").trim();
  return { ...cfg, agentNumber: own, ...(conn ? { connectionId: conn } : {}) };
}

export function sarvamMissing(): string[] {
  return ["RANA_SARVAM_AGENTS_API_KEY", "RANA_SARVAM_ORG_ID", "RANA_SARVAM_WORKSPACE_ID", "RANA_SARVAM_APP_ID"].filter((k) => !process.env[k]);
}

/** The voice set on the RANA Runtime agent in Sarvam (Settings → Voice). The default voice. */
export const SARVAM_AGENT_VOICE = { name: "Priya", speaker: "priya", gender: "feminine" };

/**
 * Voices a customer can pick. Sarvam sets the voice on the agent, not per call, so each voice is a copy of the
 * RANA Runtime agent (same instructions variable) with a different voice, committed as v1 in RANA's Sarvam workspace.
 * appId null = the main RANA Runtime agent (RANA_SARVAM_APP_ID). Version 2 of each copy has the Greeting set to the {{rana_greeting}}
 * variable (phone calls ignore initial_bot_message). Priya and Kabir are routed by HQ to "RV" copies (platform setting r1_voice_agents). Override ids with RANA_SARVAM_VOICE_APPS
 * (JSON: {"kavya":"RANA-Runtim-…@1", …}) if an agent is re-created.
 */
export type SarvamVoice = { key: string; name: string; speaker: string; gender: "feminine" | "masculine"; tone: string; appId: string | null; appVersion: number;
  /** The voice's id in the full R1 library (lib/sarvamVoiceCatalog). */ catalogId?: string; first?: string; model?: 3 | 4 };
export const SARVAM_VOICES: SarvamVoice[] = [
  { key: "priya", name: "Priya", speaker: "priya", gender: "feminine", tone: "Warm and friendly", appId: null, appVersion: 0, catalogId: "01a0cf16-5959-79cb-9949-247c5a33bd48", model: 3 },
  { key: "kavya", name: "Kavya", speaker: "kavya", gender: "feminine", tone: "Calm and caring", appId: "RANA-Runtim-f3aaa318-c225", appVersion: 2, catalogId: "01a0cf16-5f09-7c65-b9e6-9fe94b0e9441", model: 3 },
  { key: "shreya", name: "Shreya", speaker: "shreya", gender: "feminine", tone: "Bright and confident", appId: "RANA-Runtim-5c226d02-a4b2", appVersion: 2, catalogId: "01a0cf16-67bf-76f0-8420-2ce24e69cffb", model: 3 },
  { key: "aditya", name: "Aditya", speaker: "aditya", gender: "masculine", tone: "Clear and professional", appId: "RANA-Runtim-61c17dd3-0e02", appVersion: 2, catalogId: "01a0cf16-5726-7055-8622-322e53f6bc77", model: 3 },
  { key: "rahul", name: "Rahul", speaker: "rahul", gender: "masculine", tone: "Friendly and upbeat", appId: "RANA-Runtim-aaae2662-4769", appVersion: 2, catalogId: "01a0cf16-5a52-747d-8900-0a77b9f5402c", model: 3 },
  { key: "kabir", name: "Kabir", speaker: "kabir", gender: "masculine", tone: "Deep and assured", appId: "RANA-Runtim-1b592e11-7534", appVersion: 1, catalogId: "01a0cf16-6ecd-7a97-b86b-f91eeadd5bd7", model: 3 },
];

/** The picked voice for an employee (by name, key or library id), defaulting to Priya. Any of the 200 library voices is recognised. */
export function voiceFor(nameOrKey: string | null | undefined): SarvamVoice {
  const k = String(nameOrKey || "").trim().toLowerCase();
  const own = SARVAM_VOICES.find((v) => v.key === k || v.name.toLowerCase() === k || v.catalogId === k);
  if (own) return own;
  const c = findR1Voice(String(nameOrKey || "").trim());
  if (c) return { key: c.id, name: c.name, first: c.first, speaker: r1PreviewSpeaker(c) || "", gender: c.gender, tone: c.tone, appId: null, appVersion: 0, catalogId: c.id, model: c.model };
  return SARVAM_VOICES[0];
}

/** HQ-connected agents for library voices: { [voice id]: "RANA-Runtim-…@1" } (platform setting). */
export const VOICE_AGENTS_KEY = "r1_voice_agents";
export async function voiceAgents(): Promise<Record<string, string>> {
  const v = await getSetting<Record<string, string>>(VOICE_AGENTS_KEY, {});
  return v && typeof v === "object" ? v : {};
}
export function parseAgentRef(ref: string | null | undefined): { appId: string; appVersion: number } | null {
  const [id, ver] = String(ref || "").trim().split("@");
  return /^[A-Za-z0-9_-]{6,80}$/.test(id || "") ? { appId: id, appVersion: Number(ver) || 1 } : null;
}

/**
 * The agent that speaks this employee's voice. The engine can't switch voices per call, so every voice has its own
 * agent: the 6 built-in voices always; a library voice once HQ connects one. Until then the call uses the
 * built-in voice of the same gender (`live: false`, `via` = the voice actually heard).
 */
export async function routeVoice(cfg: SarvamConfig, nameOrKey: string | null | undefined, own?: string | null): Promise<{ cfg: SarvamConfig; voice: SarvamVoice; live: boolean; via: SarvamVoice }> {
  const v = voiceFor(nameOrKey);
  // An employee connected to a ready-made agent (HQ) always calls through it.
  const mine = own ? parseAgentRef(own) : null;
  if (mine) return { cfg: { ...cfg, ...mine }, voice: v, live: true, via: v };
  // HQ can connect an agent for any voice, built-in ones too (e.g. a copy whose greeting is the {{rana_greeting}} variable).
  const ref = parseAgentRef((await voiceAgents().catch(() => ({} as Record<string, string>)))[v.catalogId || ""]);
  if (SARVAM_VOICES.includes(v) && !ref) return { cfg: withVoice(cfg, v.key), voice: v, live: true, via: v };
  if (ref) return { cfg: { ...cfg, ...ref }, voice: v, live: true, via: v };
  const fb = voiceFor(v.gender === "masculine" ? "aditya" : "priya");
  return { cfg: withVoice(cfg, fb.key), voice: v, live: false, via: fb };
}

function voiceOverrides(): Record<string, { appId: string; appVersion: number }> {
  try {
    const raw = JSON.parse(process.env.RANA_SARVAM_VOICE_APPS || "{}");
    const out: Record<string, { appId: string; appVersion: number }> = {};
    for (const [k, v] of Object.entries(raw)) {
      const [id, ver] = String(v).split("@");
      if (id) out[k.toLowerCase()] = { appId: id, appVersion: Number(ver) || 1 };
    }
    return out;
  } catch { return {}; }
}

/** Point this config at the Sarvam agent that speaks with the employee's chosen voice. */
export function withVoice(cfg: SarvamConfig, nameOrKey: string | null | undefined): SarvamConfig {
  const v = voiceFor(nameOrKey);
  const o = voiceOverrides()[v.key];
  if (o) return { ...cfg, appId: o.appId, appVersion: o.appVersion };
  return v.appId ? { ...cfg, appId: v.appId, appVersion: v.appVersion } : cfg;
}

/** Sarvam names languages in full ("Telugu"); RANA stores codes ("te-IN"). */
export function sarvamLanguageName(code: string | null | undefined): string {
  const name = LANG_NAMES[baseLang(code)] || "English";
  return ["English", "Hindi", "Telugu", "Tamil", "Kannada", "Malayalam", "Marathi", "Bengali", "Gujarati", "Punjabi", "Odia"].includes(name) ? name : "English";
}

/** What every call of this employee sends to Sarvam. Caller details are appended to the instructions so they work without extra agent variables. */
export function sessionPayload(script: any, caller?: { name?: string | null; variables?: Record<string, string> }, direction?: CallDirection) {
  // A ready-made agent has its own script and greeting: send nothing that would override them.
  if (parseAgentRef(script?.engine_agent)) return { agent_variables: {} as Record<string, string>, initial_bot_message: undefined as string | undefined, initial_language_name: sarvamLanguageName(script.starting_language) };
  // Inbound and outbound must sound different: name the direction when we know it (older employees get both rules).
  // Incoming calls use the inbound script when the employee has one ("they call us"); everything else the outbound one.
  const useIn = direction === "inbound" && String(script.instructions_inbound || "").trim();
  const raw = String(useIn ? script.instructions_inbound : script.instructions || "").trim();
  const styled = direction ? (raw.includes(directionStyle(direction)) ? raw : `${raw}\n\n${directionStyle(direction)}`) : raw.includes(STYLE_MARKER) ? raw : `${raw}\n\n${BOTH_STYLES}`;
  const base = styled.includes(TONE_MARKER) ? styled : `${styled}\n\n${TONE_STYLE}`;
  const details = [
    caller?.name ? `- Name: ${caller.name}` : "",
    ...Object.entries(caller?.variables || {}).filter(([, v]) => String(v || "").trim()).map(([k, v]) => `- ${k.replace(/_/g, " ")}: ${v}`),
  ].filter(Boolean);
  const ref = script.id ? `\n\n${scriptRefLine(String(script.id))}` : "";
  const rana_instructions = ((details.length ? `${base}\n\n# About this caller\n${details.join("\n")}` : base).slice(0, 29900) + ref);
  // Live transfer target (only once the Sarvam agents have call forwarding bound to `transfer_to`).
  const transfer_to = liveTransferOn() ? transferNumber(normalizeHandoff(script.handoff)) : null;
  const greeting = speakableGreeting(String((useIn && script.inbound?.greeting) || script.greeting || "").trim(), normalizePronunciations(script.pronunciations), script.starting_language || "en") || "";
  // Phone calls and campaigns ignore initial_bot_message and speak the agent's own Greeting, so every RANA agent's
  // Greeting is the variable {{rana_greeting}} — the employee's greeting travels as an agent variable on every call.
  const vars: Record<string, string> = { rana_instructions, ...(greeting ? { rana_greeting: greeting } : {}), ...(transfer_to ? { transfer_to } : {}) };
  return {
    agent_variables: vars,
    initial_bot_message: greeting || undefined,
    initial_language_name: sarvamLanguageName(script.starting_language),
  };
}

async function call<T = any>(url: string, init: RequestInit & { key: string }): Promise<T> {
  const method = String(init.method || "GET").toUpperCase();
  const res = await sarvamFetch("agents", url, {
    ...init,
    headers: { "Content-Type": "application/json", "X-API-Key": init.key, ...(init.headers || {}) },
    cache: "no-store",
    retry: method === "GET", // never repeat anything that could start a call twice
  });
  const text = await res.text();
  let data: any; try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) {
    const detail = data?.error?.data?.details || data?.error?.message || data?.detail || data?.message || text.slice(0, 200);
    const msg = `Sarvam ${res.status}: ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 200)}`;
    throw new SarvamError(classifySarvamError(res.status, text), res.status, msg);
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
export async function placeOutboundCall(cfg: SarvamConfig, input: { phone: string; script: any; caller?: { name?: string | null; variables?: Record<string, string> }; webhook?: string | null; metadata?: Record<string, string>; direction?: CallDirection }) {
  if (!cfg.connectionId) throw new Error("No Sarvam phone connection is set (RANA_SARVAM_CONNECTION_ID).");
  const p = sessionPayload(input.script, input.caller, input.direction || "outbound");
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
      const p = sessionPayload(script, { name: c.name, variables: c.variables }, "outbound");
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
  const lang = baseLang(opts.language) === "or" ? "od" : baseLang(opts.language); // Sarvam writes Odia as od-IN
  const code = ["en", "hi", "te", "ta", "kn", "ml", "mr", "bn", "gu", "pa", "od"].includes(lang) ? `${lang}-IN` : "en-IN";
  const res = await sarvamFetch("tts", "https://api.sarvam.ai/text-to-speech", {
    method: "POST",
    headers: { "api-subscription-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      text: opts.text.slice(0, 2400), target_language_code: code,
      speaker: (opts.speaker || SARVAM_AGENT_VOICE.speaker).toLowerCase(), model: "bulbul:v3",
      pace: Math.min(2, Math.max(0.5, opts.pace || 1)), output_audio_codec: "mp3", speech_sample_rate: 24000,
    }),
    retry: true,
  });
  if (!res.ok) { const t = (await res.text()).slice(0, 200); throw new SarvamError(classifySarvamError(res.status, t), res.status, `Sarvam TTS ${res.status}: ${t}`); }
  const d = await res.json();
  const b64 = d?.audios?.[0];
  if (!b64) throw new Error("Sarvam TTS returned no audio");
  const buf = Buffer.from(b64, "base64");
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}
