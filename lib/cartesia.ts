// @ts-nocheck
/**
 * Thin server-side wrapper around Cartesia's Managed Agents API.
 * Docs: https://docs.cartesia.ai/agents/introduction
 *
 * Schema confirmed against the live OpenAPI spec for Cartesia-Version 2026-08-14 (our
 * pinned version) for Create Agent, Update Agent, and List Models/Voices.
 *
 * CONFIRMED: agent-level webhooks are NOT part of this API version. Create/Update Agent
 * have no `webhook_id` field on 2026-08-14 — verified against the full live schema, not
 * just by trial — and the Webhooks endpoints (POST/PATCH /agents/webhooks) only appear
 * in the older 2026-03-01 docs, not 2026-08-14's. createCartesiaWebhook()/
 * attachWebhookToAgent() below are kept only in case a future Cartesia-Version restores
 * this; nothing currently calls them. Call-outcome ingestion for Cartesia calls needs to
 * poll GET /v1/agents/calls (and GET /v1/agents/calls/{id} for a transcript) instead —
 * not built yet.
 *
 * Still NOT independently confirmed against a real response: the exact shape of
 * `call.transcript` entries once that polling path is built — see the note in
 * lib/calls.ts's payloadToCallFromCartesia() (written for a webhook payload shape that
 * may not apply once we switch to polling).
 *
 * Phone numbers (confirmed against docs): Cartesia-provisioned numbers are US-only —
 * both the number itself and outbound calling from it are limited to US destinations,
 * regardless of the agent's deployment region. For India, the only path is importing a
 * Twilio number (docs.cartesia.ai/line/integrations/telephony) — not built here yet.
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

export type CartesiaAgentInput = {
  name: string;
  instructions: string;
  initialMessage: string | null;
  language: string;   // ISO 639-1, e.g. "te", "hi", "en"
  voiceId: string;
  speed?: number;      // clamped to 0.6 - 1.5 (Cartesia's allowed range)
  modelId: string;     // an ID from GET /v1/agents/models
};

function buildConfig(cfg: CartesiaAgentInput) {
  return {
    instructions: cfg.instructions,
    initial_message: cfg.initialMessage,
    model: { id: cfg.modelId, temperature: null, max_output_tokens: null },
    language: { primary: cfg.language },
    audio: {
      input: { keyterms: [], noise_suppression: "auto" },
      output: {
        voice_id: cfg.voiceId,
        speed: Math.min(1.5, Math.max(0.6, cfg.speed ?? 1)),
        volume: null,
        emotion: null,
        pronunciation_dictionary_id: null,
        background_sound: null,
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

/** GET /v1/agents/models — LLMs available for Managed Agents, with latency/pricing metadata. */
export async function listCartesiaModels(): Promise<any[]> {
  const data = await cartesiaFetch("/v1/agents/models", { method: "GET" });
  return data?.data ?? data ?? [];
}

/** GET /voices — full voice catalog, fully paginated (Cartesia caps each page at 100), with
 *  preview_file_url requested so a real "play sample" button is possible. Filter client-side
 *  by `.language`, `.gender`, etc. */
export async function listCartesiaVoices(): Promise<any[]> {
  const all: any[] = [];
  let startingAfter: string | undefined;
  for (let page = 0; page < 30; page++) { // hard cap: 30 * 100 = 3000 voices, comfortably above the real catalog size
    const qs = `limit=100&expand%5B%5D=preview_file_url${startingAfter ? `&starting_after=${encodeURIComponent(startingAfter)}` : ""}`;
    const data = await cartesiaFetch(`/voices?${qs}`, { method: "GET" });
    const batch = data?.data ?? [];
    all.push(...batch);
    if (!data?.has_more || batch.length === 0) break;
    startingAfter = data?.next_page || batch[batch.length - 1]?.id;
    if (!startingAfter) break;
  }
  return all;
}

/** Maps RANA's startingLanguage (BCP-47, e.g. "te-IN") to Cartesia's ISO 639-1 primary language code. */
export function toCartesiaLanguage(bcp47: string): string {
  return (bcp47 || "en-IN").split("-")[0].toLowerCase();
}

/* ── Phone numbers ──
   GET /agents/phone-numbers — every number on this account (Cartesia-managed + imported Twilio).
   POST /agents/phone-numbers/provision — buys a new Cartesia number. US ONLY: both the number
   and outbound calling from it are limited to US destinations. Confirmed against docs.cartesia.ai/
   line/integrations/telephony/cartesia-numbers. For India, Twilio import is the only route and
   isn't built yet.
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

/** Permanent — the number is released and cannot be recovered. */
export async function deleteCartesiaPhoneNumber(phoneNumberId: string): Promise<void> {
  await cartesiaFetch(`/agents/phone-numbers/${phoneNumberId}`, { method: "DELETE" });
}
