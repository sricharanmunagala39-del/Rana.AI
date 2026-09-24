// @ts-nocheck
/**
 * Thin server-side wrapper around Cartesia's Managed Agents API.
 * Docs: https://docs.cartesia.ai/agents/introduction
 *
 * Schema confirmed against the live OpenAPI spec for Cartesia-Version 2026-08-14 (our
 * pinned version) for Create Agent, Update Agent, List Models, List Voices, List Accents,
 * and Files (upload/list).
 *
 * CONFIRMED: agent-level webhooks are NOT part of this API version. Create/Update Agent
 * have no `webhook_id` field on 2026-08-14 — verified against the full live schema, not
 * just by trial — and the Webhooks endpoints (POST/PATCH /agents/webhooks) only appear
 * in the older 2026-03-01 docs, not 2026-08-14's. createCartesiaWebhook()/
 * attachWebhookToAgent() below are kept only in case a future Cartesia-Version restores
 * this; nothing currently calls them. Call outcomes are pulled instead: listCartesiaCalls()
 * below, driven by lib/callSync.ts.
 *
 * Still NOT confirmed against a real response: the exact shape of `call.transcript`
 * entries (role/text assumed) — see normaliseCartesiaTranscript() in lib/calls.ts.
 *
 * Phone numbers (confirmed against docs): Cartesia-provisioned numbers are US-only —
 * both the number itself and outbound calling from it are limited to US destinations,
 * regardless of the agent's deployment region. For India, the only path is importing a
 * Twilio number (docs.cartesia.ai/line/integrations/telephony) — see "Twilio import" below.
 */

const CARTESIA_BASE = "https://api.cartesia.ai";
const CARTESIA_VERSION = "2026-08-14";

function cartesiaHeaders() {
  const key = process.env.CARTESIA_API_KEY;
  if (!key) throw new Error("CARTESIA_API_KEY is not set");
  return {
    "Authorization": `Bearer ${key}`,
    "Cartesia-Version": CARTESIA_VERSION,
    "Content-Type": "application/json",
  };
}

async function cartesiaFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${CARTESIA_BASE}${path}`, {
    ...init,
    headers: { ...cartesiaHeaders(), ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let data: any;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`Cartesia ${path}: ${res.status} ${JSON.stringify(data)}`);
  return data;
}

/** Generic pager for Cartesia's `{data, has_more, next_page}` list endpoints. */
async function cartesiaPaginate(pathBuilder: (startingAfter?: string) => string, maxPages = 30): Promise<any[]> {
  const all: any[] = [];
  let startingAfter: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const data = await cartesiaFetch(pathBuilder(startingAfter), { method: "GET" });
    const batch = data?.data ?? [];
    all.push(...batch);
    if (!data?.has_more || batch.length === 0) break;
    startingAfter = data?.next_page || batch[batch.length - 1]?.id;
    if (!startingAfter) break;
  }
  return all;
}

export type CartesiaAgentInput = {
  name: string;
  instructions: string;
  initialMessage: string | null;
  language: string;   // ISO 639-1, e.g. "te", "hi", "en"
  voiceId: string;
  speed?: number;      // clamped to 0.6 - 1.5 (Cartesia's allowed range)
  modelId: string;     // an ID from GET /v1/agents/models
  noiseSuppression?: "off" | "auto" | "max";
  backgroundSound?: { fileId: string; volume: number } | null; // volume 0-2
};

function buildConfig(cfg: CartesiaAgentInput) {
  return {
    instructions: cfg.instructions,
    initial_message: cfg.initialMessage,
    model: { id: cfg.modelId, temperature: null, max_output_tokens: null },
    language: { primary: cfg.language },
    audio: {
      input: {
        keyterms: [],
        noise_suppression: cfg.noiseSuppression ?? "auto",
      },
      output: {
        voice_id: cfg.voiceId,
        speed: Math.min(1.5, Math.max(0.6, cfg.speed ?? 1)),
        volume: null,
        emotion: null,
        pronunciation_dictionary_id: null,
        background_sound: cfg.backgroundSound
          ? { file_id: cfg.backgroundSound.fileId, volume: Math.min(2, Math.max(0, cfg.backgroundSound.volume)) }
          : null,
      },
    },
    system_tools: {
      end_call: { description: null, pre_tool_speech: "auto" },
      send_dtmf: null,
      transfer_to_number: null,
    },
    tools: [],
    timezone: "Asia/Kolkata",
    dynamic_variable_placeholders: {},
  };
}

export async function createCartesiaAgent(cfg: CartesiaAgentInput): Promise<{ id: string }> {
  return cartesiaFetch("/v1/agents", {
    method: "POST",
    body: JSON.stringify({ name: cfg.name, config: buildConfig(cfg) }),
  });
}

export async function updateCartesiaAgent(agentId: string, cfg: CartesiaAgentInput): Promise<{ id: string }> {
  return cartesiaFetch(`/v1/agents/${agentId}`, {
    method: "PATCH",
    body: JSON.stringify({ name: cfg.name, config: buildConfig(cfg) }),
  });
}

/** Unused — see the module-level note above. Kept only in case a future Cartesia-Version
 *  restores agent-level webhooks; this always 400s on 2026-08-14 ("Unrecognized key:
 *  webhook_id"). */
export async function attachWebhookToAgent(agentId: string, webhookId: string): Promise<void> {
  await cartesiaFetch(`/v1/agents/${agentId}`, {
    method: "PATCH",
    body: JSON.stringify({ webhook_id: webhookId }),
  });
}

export async function createCartesiaWebhook(url: string, secret: string, displayName?: string): Promise<{ id: string; secret: string }> {
  return cartesiaFetch("/agents/webhooks", {
    method: "POST",
    body: JSON.stringify({ url, secret, display_name: displayName }),
  });
}

/** GET /v1/agents/models — LLMs available for Managed Agents, with provider, average
 *  latency and per-million-token pricing. Fully paginated (default page size is only 10). */
export async function listCartesiaModels(): Promise<any[]> {
  return cartesiaPaginate((after) => `/v1/agents/models?limit=100${after ? `&starting_after=${encodeURIComponent(after)}` : ""}`, 10);
}

/** GET /voices — full voice catalog, fully paginated (Cartesia caps each page at 100), with
 *  preview_file_url requested so a real "play sample" button is possible. Each voice's
 *  `accents` array (accent/locale/is_native) is included by default. Filter client-side
 *  by `.language`, `.gender`, `.accents`, etc. */
export async function listCartesiaVoices(): Promise<any[]> {
  return cartesiaPaginate((after) => `/voices?limit=100&expand%5B%5D=preview_file_url${after ? `&starting_after=${encodeURIComponent(after)}` : ""}`, 30);
}

/** GET /accents — the official accent catalog (id, name, language, locale, is_locale_default),
 *  for building an accent filter independent of which voices currently exist. */
export async function listCartesiaAccents(): Promise<any[]> {
  const data = await cartesiaFetch("/accents", { method: "GET" });
  return data?.accents ?? data?.data ?? [];
}

/** GET /files — files uploaded to this account, fully paginated. Pass `purpose` to filter,
 *  e.g. "agent_background_sound" for the agent's background-sound picker. */
export async function listCartesiaFiles(purpose?: string): Promise<any[]> {
  return cartesiaPaginate((after) => {
    const qs = new URLSearchParams({ limit: "100" });
    if (purpose) qs.set("purpose", purpose);
    if (after) qs.set("starting_after", after);
    return `/files?${qs.toString()}`;
  }, 10);
}

/** POST /files (multipart/form-data) — upload a new file with a given purpose (e.g.
 *  "agent_background_sound"). Bypasses cartesiaFetch/cartesiaHeaders because those force a
 *  JSON content-type, which would break the multipart boundary. */
export async function uploadCartesiaFile(fileBuffer: Buffer, filename: string, contentType: string, purpose: string): Promise<any> {
  const key = process.env.CARTESIA_API_KEY;
  if (!key) throw new Error("CARTESIA_API_KEY is not set");
  const form = new FormData();
  form.append("file", new Blob([fileBuffer], { type: contentType || "application/octet-stream" }), filename);
  form.append("purpose", purpose);
  const res = await fetch(`${CARTESIA_BASE}/files`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Cartesia-Version": CARTESIA_VERSION },
    body: form as any,
  });
  const text = await res.text();
  let data: any;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`Cartesia /files: ${res.status} ${JSON.stringify(data)}`);
  return data;
}

/** Maps RANA's startingLanguage (BCP-47, e.g. "te-IN") to Cartesia's ISO 639-1 primary language code. */
export function toCartesiaLanguage(bcp47: string): string {
  return (bcp47 || "en-IN").split("-")[0].toLowerCase();
}

/* ── Phone numbers ──
   GET /agents/phone-numbers — every number on this account (Cartesia-managed + imported Twilio).
   POST /agents/phone-numbers/provision — buys a new Cartesia number. US ONLY: both the number
   and outbound calling from it are limited to US destinations. Confirmed against docs.cartesia.ai/
   line/integrations/telephony/cartesia-numbers. For India, Twilio import is the only route —
   see createTwilioProvider / importTwilioPhoneNumber below.
*/

export async function listCartesiaPhoneNumbers(): Promise<any[]> {
  const data = await cartesiaFetch("/agents/phone-numbers", { method: "GET" });
  return data?.data ?? data ?? [];
}

export async function provisionCartesiaPhoneNumber(label: string, agentId?: string): Promise<any> {
  return cartesiaFetch("/agents/phone-numbers/provision", {
    method: "POST",
    body: JSON.stringify({ label, agent_id: agentId || undefined }),
  });
}

/* ── Twilio import (the India route) ──
   Confirmed against docs.cartesia.ai/line/integrations/telephony/twilio/integration and
   /api-reference/agents/phone-numbers/import:
   - POST /agents/phone-numbers/providers  { type:"twilio", account_sid, api_key_sid, api_key_secret, region }
   - POST /agents/phone-numbers            { label, number (E.164), provider:{id} | {type,account_sid,region}, agent_id? }
   Cartesia never buys the number — it must already exist in the Twilio account. region is the
   Twilio edge the API key belongs to (us1 default, ie1, au1); a mismatch makes outbound fail with
   an auth error. Use a Standard Twilio API key, not the auth token. We don't store the secret —
   Cartesia holds it after this call.
*/

export type TwilioRegion = "us1" | "ie1" | "au1";

export async function createTwilioProvider(input: {
  accountSid: string; apiKeySid: string; apiKeySecret: string; region: TwilioRegion;
}): Promise<any> {
  return cartesiaFetch("/agents/phone-numbers/providers", {
    method: "POST",
    body: JSON.stringify({
      type: "twilio",
      account_sid: input.accountSid,
      api_key_sid: input.apiKeySid,
      api_key_secret: input.apiKeySecret,
      region: input.region,
    }),
  });
}

export async function importTwilioPhoneNumber(input: {
  label: string; number: string; accountSid: string; region: TwilioRegion; agentId?: string;
}): Promise<any> {
  return cartesiaFetch("/agents/phone-numbers", {
    method: "POST",
    body: JSON.stringify({
      label: input.label,
      number: input.number,
      provider: { type: "twilio", account_sid: input.accountSid, region: input.region },
      agent_id: input.agentId || undefined,
    }),
  });
}

/** POST /agents/calls — Cartesia outbound. from_number_id needs no agent assignment. */
export async function placeCartesiaOutboundCalls(input: {
  agentId: string; fromNumberId: string;
  calls: { toNumber: string; variables?: Record<string, string> }[];
  ringingTimeoutSeconds?: number;
}): Promise<any> {
  return cartesiaFetch("/agents/calls", {
    method: "POST",
    body: JSON.stringify({
      agent_id: input.agentId,
      from_number_id: input.fromNumberId,
      outbound_calls: input.calls.map((c) => ({
        to_number: c.toNumber,
        ...(c.variables ? { dynamic_variables: c.variables } : {}),
      })),
      ...(input.ringingTimeoutSeconds ? { ringing_timeout_seconds: input.ringingTimeoutSeconds } : {}),
    }),
  });
}

/** "98765 43210" / "098765..." / "+91 98765..." → "+919876543210". Returns null if it isn't a plausible E.164. */
export function toE164India(raw: string): string | null {
  const s = (raw || "").replace(/[^\d+]/g, "");
  let out: string;
  if (s.startsWith("+")) out = s;
  else if (s.startsWith("00")) out = "+" + s.slice(2);
  else if (s.length === 11 && s.startsWith("0")) out = "+91" + s.slice(1);
  else if (s.length === 10) out = "+91" + s;
  else if (s.length === 12 && s.startsWith("91")) out = "+" + s;
  else out = "+" + s;
  return /^\+[1-9]\d{7,14}$/.test(out) ? out : null;
}

/** Permanent for Cartesia numbers (released). For imported Twilio numbers this only unlinks it from Cartesia; the number stays in Twilio. */
export async function deleteCartesiaPhoneNumber(phoneNumberId: string): Promise<void> {
  await cartesiaFetch(`/agents/phone-numbers/${phoneNumberId}`, { method: "DELETE" });
}

/* ── Calls ──
   GET /agents/calls?agent_id=&limit=(1-100)&starting_after=&start_time_gte=&expand=transcript
   (docs.cartesia.ai/api-reference/agents/calls/list-calls). No agent-level webhooks exist on this
   API version, so this is how call results reach the dashboard. */
export async function listCartesiaCalls(opts: { agentId: string; startTimeGte?: string; maxPages?: number }): Promise<any[]> {
  return cartesiaPaginate((startingAfter) => {
    const q = new URLSearchParams({ agent_id: opts.agentId, limit: "100", expand: "transcript" });
    if (opts.startTimeGte) q.set("start_time_gte", opts.startTimeGte);
    if (startingAfter) q.set("starting_after", startingAfter);
    return `/agents/calls?${q.toString()}`;
  }, opts.maxPages ?? 10);
}
