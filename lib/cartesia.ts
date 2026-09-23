// @ts-nocheck
/**
 * Thin server-side wrapper around Cartesia's Managed Agents API.
 * Docs: https://docs.cartesia.ai/agents/introduction
 *
 * Schema confirmed against the live OpenAPI spec (Cartesia-Version 2026-08-14) for
 * Create Agent, Create Webhook, and List Models/Voices. Two things are NOT independently
 * confirmed against a real response yet:
 *   1. Exactly where `webhook_id` lives on the Update Agent PATCH body — the docs only say
 *      it's "set with Update Agent" without showing that endpoint's exact schema. Sent here
 *      as a top-level field alongside `config`; if this 400s, check the Update Agent docs
 *      page directly for the real field location.
 *   2. The exact shape of `call.transcript` entries inside a delivered webhook payload —
 *      see the note in lib/calls.ts's payloadToCallFromCartesia().
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

/** See the module-level note above — webhook_id's exact location on this PATCH is unverified. */
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

/** GET /voices — full voice catalog. Filter client-side by `.language` (e.g. "te", "hi", "en"). */
export async function listCartesiaVoices(): Promise<any[]> {
  const data = await cartesiaFetch("/voices", { method: "GET" });
  return data?.data ?? data ?? [];
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
