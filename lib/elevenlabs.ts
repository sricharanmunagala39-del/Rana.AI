// ElevenLabs (natural, human-sounding voices) — server only. Never shown to customers by name.
// RANA uses ONE runtime agent on ElevenLabs (like "RANA Runtime" on Sarvam): every session sends its own prompt,
// first message, language and voice as overrides, so there is nothing to publish per employee.
// Key: ELEVENLABS_API_KEY in Vercel (set by the founder; never stored anywhere else).
import { getSetting, setSetting } from "./platformSettings";

const API = "https://api.elevenlabs.io";

export const elevenKey = () => (process.env.ELEVENLABS_API_KEY || "").trim();
export const elevenReady = () => !!elevenKey();

/** Voice models for live calls, best first. v4 Turbo / v3 Conversational speak Telugu and Kannada; Flash v2.5 doesn't. */
export const ELEVEN_MODELS: { id: string; label: string }[] = [
  { id: "eleven_v4_turbo", label: "v4 Turbo — most natural, fast, all major Indian languages" },
  { id: "eleven_v3_conversational", label: "v3 Conversational — very expressive, a little slower" },
  { id: "eleven_flash_v2_5", label: "Flash v2.5 — fastest, Hindi/Tamil/English only" },
  { id: "eleven_multilingual_v2", label: "Multilingual v2 — stable, Hindi/Tamil/English" },
];
export const DEFAULT_ELEVEN_MODEL = ELEVEN_MODELS[0].id;

/** What HQ chose for the website's live voice (Talk to Rana, instant demos, industry demos). */
export type WebVoice = {
  engine: "sarvam" | "elevenlabs";
  voiceId?: string; voiceName?: string;
  /** Optional male voice for visitors who pick "Male" (the voice above is the default, female). */
  maleVoiceId?: string; maleVoiceName?: string;
  model?: string;
};
export const WEB_VOICE_KEY = "web_voice";
export const getWebVoice = () => getSetting<WebVoice>(WEB_VOICE_KEY, { engine: "sarvam" });

export class ElevenError extends Error { status: number; constructor(status: number, msg: string) { super(msg); this.status = status; } }

async function el<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const key = elevenKey();
  if (!key) throw new ElevenError(400, "ELEVENLABS_API_KEY isn't set in Vercel yet.");
  const res = await fetch(`${API}${path}`, {
    ...init, cache: "no-store", signal: AbortSignal.timeout(15000),
    headers: { "xi-api-key": key, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 300);
    try { const j = JSON.parse(text); msg = String(j?.detail?.message || j?.detail || j?.message || msg).slice(0, 300); } catch {}
    const hint = res.status === 401 ? " — the key in Vercel (ELEVENLABS_API_KEY) is wrong or incomplete: create a new key, use the copy icon, paste it in Vercel, then redeploy." : "";
    throw new ElevenError(res.status, `ElevenLabs ${res.status}: ${msg}${hint}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}

/** Plan, credits used — so HQ can see if the account can run calls. */
export async function elevenAccount() {
  const s = await el<any>("/v1/user/subscription");
  return { tier: String(s?.tier || "unknown"), used: Number(s?.character_count || 0), limit: Number(s?.character_limit || 0), status: String(s?.status || "") };
}

export type ElevenVoice = { voiceId: string; name: string; preview: string | null; gender?: string; accent?: string; language?: string; description?: string; category?: string; ownerId?: string; uses?: number };

/** Voices already in RANA's ElevenLabs account (usable on calls). */
export async function accountVoices(): Promise<ElevenVoice[]> {
  const j = await el<any>("/v2/voices?page_size=100&sort=created_at_unix&sort_direction=desc");
  return (j?.voices || []).map((v: any) => ({
    voiceId: v.voice_id, name: v.name, preview: v.preview_url || null, category: v.category,
    gender: v.labels?.gender, accent: v.labels?.accent, language: v.labels?.language || (v.verified_languages?.[0]?.language ?? undefined),
    description: v.description || v.labels?.description,
  }));
}

/** Search ElevenLabs' public voice library. */
export async function libraryVoices(q: { language?: string; gender?: string; search?: string; accent?: string; useCase?: string }): Promise<ElevenVoice[]> {
  const p = new URLSearchParams({ page_size: "30", sort: "cloned_by_count" });
  if (q.language) p.set("language", q.language);
  if (q.gender) p.set("gender", q.gender);
  if (q.search) p.set("search", q.search);
  if (q.accent) p.set("accent", q.accent);
  if (q.useCase) p.set("use_cases", q.useCase);
  const j = await el<any>(`/v1/shared-voices?${p}`);
  return (j?.voices || []).map((v: any) => ({
    voiceId: v.voice_id, ownerId: v.public_owner_id, name: v.name, preview: v.preview_url || null,
    gender: v.gender, accent: v.accent, language: v.language, description: String(v.description || "").slice(0, 220),
    category: v.category, uses: Number(v.cloned_by_count || v.usage_character_count_1y || 0),
  }));
}

/** Copy a library voice into RANA's account so calls can use it; returns the voice id to use. */
export async function addLibraryVoice(ownerId: string, voiceId: string, name: string): Promise<string> {
  const j = await el<any>(`/v1/voices/add/${encodeURIComponent(ownerId)}/${encodeURIComponent(voiceId)}`, { method: "POST", body: JSON.stringify({ new_name: name.slice(0, 60) }) });
  return String(j?.voice_id || voiceId);
}

let maleCache: { at: number; v: { id: string; name: string } | null } | null = null;
/** A male voice from RANA's account (Indian accent preferred) when HQ hasn't picked one. Cached for 10 minutes. */
export async function defaultMaleVoice(): Promise<{ id: string; name: string } | null> {
  if (maleCache && Date.now() - maleCache.at < 600_000) return maleCache.v;
  try {
    const all = (await accountVoices()).filter((v) => String(v.gender || "").toLowerCase() === "male");
    const pick = all.find((v) => /indian|hindi/i.test(`${v.accent} ${v.language}`)) || all[0];
    maleCache = { at: Date.now(), v: pick ? { id: pick.voiceId, name: pick.name } : null };
  } catch { maleCache = { at: Date.now(), v: null }; }
  return maleCache.v;
}

function runtimeAgentBody(model: string, voiceId: string) {
  return {
    name: "RANA Runtime (R3)",
    tags: ["rana"],
    conversation_config: {
      agent: {
        first_message: "Hello!",
        language: "en",
        prompt: { prompt: "You are Rana, a warm and natural phone assistant. Follow the instructions you are given for each call.", llm: "gemini-2.5-flash", temperature: 0.4 },
      },
      tts: { voice_id: voiceId, model_id: model, agent_output_audio_format: "pcm_16000" },
      asr: { quality: "high", user_input_audio_format: "pcm_16000", keywords: ["RANA", "Rana"] },
      turn: { turn_timeout: 7, turn_eagerness: "normal" },
      conversation: { max_duration_seconds: 600 },
    },
    platform_settings: {
      auth: { enable_auth: true },
      overrides: { conversation_config_override: { agent: { first_message: true, language: true, prompt: { prompt: true } }, tts: { voice_id: true } } },
    },
  };
}

/** The one ElevenLabs agent every RANA session runs on; created (or updated) on first use. */
export async function runtimeAgent(model: string, voiceId: string): Promise<{ id: string; model: string }> {
  const saved = await getSetting<{ id?: string; model?: string; voiceId?: string }>("eleven_agent", {});
  if (saved.id && saved.model === model && saved.voiceId === voiceId) return { id: saved.id, model };
  const tries = [model, ...ELEVEN_MODELS.map((m) => m.id).filter((m) => m !== model)];
  let last: any = null;
  for (const m of tries) {
    const body = JSON.stringify(runtimeAgentBody(m, voiceId));
    try {
      if (saved.id) {
        try {
          await el(`/v1/convai/agents/${encodeURIComponent(saved.id)}`, { method: "PATCH", body });
          await setSetting("eleven_agent", { id: saved.id, model: m, voiceId });
          return { id: saved.id, model: m };
        } catch (e: any) { if (e?.status !== 404) throw e; } // agent deleted on their side → create a new one
      }
      const j = await el<{ agent_id: string }>("/v1/convai/agents/create", { method: "POST", body });
      await setSetting("eleven_agent", { id: j.agent_id, model: m, voiceId });
      return { id: j.agent_id, model: m };
    } catch (e: any) {
      last = e;
      if (e?.status !== 400 && e?.status !== 422) break; // only a rejected model is worth retrying with another one
    }
  }
  throw last || new Error("Couldn't set up the ElevenLabs agent.");
}

const EL_LANG: Record<string, string> = { en: "en", hi: "hi", te: "te", ta: "ta", kn: "kn", ml: "ml", mr: "mr", bn: "bn", gu: "gu", pa: "pa", or: "or", ar: "ar", es: "es", fr: "fr", de: "de", ja: "ja" };

/** A single-use browser session: signed WebSocket URL + the first message the browser sends. */
export async function elevenSession(o: { instructions: string; greeting: string; lang: string; voiceId: string; agentVoiceId?: string; model?: string }) {
  // The agent keeps the website's default voice; a different voice (e.g. male) is a per-session override.
  const agent = await runtimeAgent(o.model || DEFAULT_ELEVEN_MODEL, o.agentVoiceId || o.voiceId);
  const j = await el<{ signed_url: string }>(`/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agent.id)}`);
  return {
    url: j.signed_url,
    init: {
      type: "conversation_initiation_client_data",
      conversation_config_override: {
        agent: { prompt: { prompt: o.instructions.slice(0, 60000) }, first_message: o.greeting, language: EL_LANG[o.lang] || "en" },
        tts: { voice_id: o.voiceId },
      },
    },
  };
}
