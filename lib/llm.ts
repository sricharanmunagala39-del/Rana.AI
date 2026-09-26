// One small interface over whichever language model this deployment has a key for.
// Order: Anthropic (ANTHROPIC_API_KEY) → OpenAI (OPENAI_API_KEY) → Sarvam (SARVAM_CHAT_API_KEY, else SARVAM_API_KEY).
// SARVAM_CHAT_API_KEY exists because SARVAM_API_KEY may hold a key for Sarvam's agent platform (apps.sarvam.ai),
// which the chat API (api.sarvam.ai) rejects with 403 invalid_api_key_error. Keys come from dashboard.sarvam.ai → API Keys.
// Used for script analysis, AI edits, translation and document summaries — never on a live call.

import { sarvamFetch, SarvamError, classifySarvamError } from "./sarvamHealth";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type LlmOptions = { maxTokens?: number; temperature?: number; json?: boolean; timeoutMs?: number };

const sarvamKey = () => process.env.SARVAM_CHAT_API_KEY || process.env.SARVAM_API_KEY || "";

export function llmProvider(): "anthropic" | "openai" | "sarvam" | null {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  if (sarvamKey()) return "sarvam";
  return null;
}

async function anthropic(messages: ChatMessage[], o: LlmOptions): Promise<string> {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const rest = messages.filter((m) => m.role !== "system");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", signal: AbortSignal.timeout(o.timeoutMs ?? 120000),
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
      max_tokens: o.maxTokens ?? 2000, temperature: o.temperature ?? 0.3, system, messages: rest,
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const d = await res.json();
  return (d.content || []).map((c: any) => c.text || "").join("");
}

async function openai(messages: ChatMessage[], o: LlmOptions): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", signal: AbortSignal.timeout(o.timeoutMs ?? 120000),
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini", messages, max_tokens: o.maxTokens ?? 2000, temperature: o.temperature ?? 0.3,
      ...(o.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const d = await res.json();
  return d.choices?.[0]?.message?.content || "";
}

async function sarvam(messages: ChatMessage[], o: LlmOptions): Promise<string> {
  const res = await sarvamFetch("chat", "https://api.sarvam.ai/v1/chat/completions", {
    method: "POST", timeoutMs: o.timeoutMs ?? 120000, retry: true,
    headers: { "api-subscription-key": sarvamKey(), "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.SARVAM_MODEL || "sarvam-105b", messages,
      temperature: o.temperature ?? 0.3, max_tokens: o.maxTokens ?? 2000, reasoning_effort: null,
    }),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    if (res.status === 403 && /invalid_api_key|authentication/i.test(body)) {
      throw new Error("Sarvam rejected the API key. Create a key at dashboard.sarvam.ai → API Keys and save it in Vercel as SARVAM_CHAT_API_KEY (or add ANTHROPIC_API_KEY), then redeploy");
    }
    throw new SarvamError(classifySarvamError(res.status, body), res.status, `Sarvam ${res.status}: ${body}`);
  }
  const d = await res.json();
  const c = d.choices?.[0];
  if (!c?.message?.content && c?.finish_reason === "length") throw new Error("Sarvam ran out of room before answering (reply too long)");
  return c?.message?.content || "";
}

export async function chat(messages: ChatMessage[], o: LlmOptions = {}): Promise<string> {
  const p = llmProvider();
  if (!p) throw new Error("No AI model is configured. Add ANTHROPIC_API_KEY, OPENAI_API_KEY or SARVAM_CHAT_API_KEY in Vercel.");
  const text = p === "anthropic" ? await anthropic(messages, o) : p === "openai" ? await openai(messages, o) : await sarvam(messages, o);
  // Some models wrap answers in <think> blocks; never show those.
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

/** Pulls the first JSON object out of a model reply (tolerates ```json fences and chatter around it). */
export function parseJsonLoose<T = any>(text: string): T {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  if (start < 0) throw new Error("The AI reply had no JSON");
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) return JSON.parse(cleaned.slice(start, i + 1)); }
  }
  throw new Error("The AI reply was cut off");
}

/** chat() that must return JSON: one automatic retry asking the model to fix its output. */
export async function chatJson<T = any>(messages: ChatMessage[], o: LlmOptions = {}): Promise<T> {
  const first = await chat(messages, { ...o, json: true });
  try { return parseJsonLoose<T>(first); }
  catch {
    const second = await chat([...messages, { role: "assistant", content: first }, { role: "user", content: "That was not valid JSON. Reply again with only the JSON object, nothing else." }], { ...o, json: true });
    return parseJsonLoose<T>(second);
  }
}
