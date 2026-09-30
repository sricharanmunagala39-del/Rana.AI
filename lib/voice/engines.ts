// RANA's voice provider layer — the one place that knows which calling engines exist and what each can do.
// Screens and routes ask this file ("can this agent run on Cartesia?") instead of checking for "sarvam" by name,
// so adding a provider later means one new entry here plus its adapter. Pure data + helpers: safe in the browser.

export type EngineId = "sarvam" | "cartesia";

export type EngineInfo = {
  id: EngineId;
  label: string;
  /** One line a customer understands. */
  blurb: string;
  /** Base language codes an agent on this engine can hold a phone conversation in (it must understand the caller). */
  callLanguages: string[];
  /** Customers can clone their own voice for agents on this engine. */
  cloning: boolean;
  /** Can call and answer Indian (+91) numbers without extra setup. */
  indianNumbers: boolean;
  /** How finished calls reach RANA. */
  results: "webhook" | "poll";
  /** Voices offered: RANA's fixed set, or the provider's full catalog. */
  voices: "rana" | "catalog";
  /** Can switch language mid-call when the caller does. */
  switchesLanguage: boolean;
};

export const RANA_CALL_LANGUAGES = ["en", "hi", "te", "ta", "kn", "ml", "mr", "bn", "gu", "pa", "or"];
/** R2 call languages = what its speech recognition (Ink 2) documents: English, Hindi, Spanish, French, Japanese
 *  (docs.cartesia.ai, checked 30 Sep 2026). Its voices speak 44 languages, but a call also has to UNDERSTAND the
 *  caller, and R2's agent API accepts any language code (even "xx"), so acceptance proves nothing. Add a language here
 *  only after a real test call in it. */
export const R2_CALL_LANGUAGES = ["en", "hi", "es", "fr", "ja"];

export const ENGINES: Record<EngineId, EngineInfo> = {
  sarvam: {
    id: "sarvam",
    label: "R1", // customers never see the provider names
    blurb: "Built for Indian languages. Switches language when the caller does. Runs on RANA's Indian numbers.",
    callLanguages: RANA_CALL_LANGUAGES,
    cloning: false,
    indianNumbers: true,
    results: "webhook",
    voices: "rana",
    switchesLanguage: true,
  },
  cartesia: {
    id: "cartesia",
    label: "R2",
    // Each agent holds one primary language; switching language mid-call is "coming soon" on their side.
    blurb: "900+ voices, your own cloned voice, very fast replies and global languages. Each call stays in the opening language.",
    callLanguages: R2_CALL_LANGUAGES,
    cloning: true,
    indianNumbers: false,
    results: "poll",
    voices: "catalog",
    switchesLanguage: false,
  },
};

export const DEFAULT_ENGINE: EngineId = "sarvam";
export const ENGINE_IDS = Object.keys(ENGINES) as EngineId[];

export const isEngine = (x: any): x is EngineId => typeof x === "string" && x in ENGINES;

/** "te-IN" → "te"; Odia is stored as "or" (some older rows use "od"). */
export function baseLanguage(code?: string | null): string {
  const b = String(code || "en").toLowerCase().split(/[-_]/)[0] || "en";
  return b === "od" ? "or" : b;
}

/** Can an agent that speaks `language` (plus any extra languages it may switch to) run on `engine`? */
export function engineSupports(engine: EngineId, language?: string | null, alsoSpeaks: string[] = []): boolean {
  const e = ENGINES[engine];
  // An engine that can't switch mid-call only ever speaks the opening language, so only that one has to fit.
  return [language, ...(e.switchesLanguage ? alsoSpeaks : [])].every((l) => e.callLanguages.includes(baseLanguage(l)));
}

/** Engines HQ has switched on for this client. Sarvam is always available; others are opt-in. */
export function clientEngines(client: { voice_providers?: string[] | null } | null | undefined): EngineId[] {
  const extra = (client?.voice_providers || []).filter(isEngine);
  return Array.from(new Set<EngineId>([DEFAULT_ENGINE, ...extra]));
}

/** The engine behind a published agent reference: "sarvam:<app>" or a Cartesia agent id. */
export function engineOfAgentRef(ref?: string | null): EngineId | null {
  if (!ref) return null;
  return String(ref).startsWith("sarvam:") ? "sarvam" : "cartesia";
}

/** The engine an employee runs on: what it was published to, else what its draft asks for. */
export function engineOfScript(s: { engine?: string | null; cartesia_agent_id?: string | null } | null | undefined): EngineId {
  return engineOfAgentRef(s?.cartesia_agent_id) ?? (isEngine(s?.engine) ? s!.engine as EngineId : DEFAULT_ENGINE);
}

/** Campaigns created before the engine column existed were Cartesia batches. */
export function engineOfCampaign(c: { engine?: string | null } | null | undefined): EngineId {
  return c?.engine === "sarvam" ? "sarvam" : isEngine(c?.engine) ? (c!.engine as EngineId) : "cartesia";
}

/** Why an agent can't use this engine, in words for the customer — or null when it can. */
export function engineBlocker(engine: EngineId, client: any, language?: string | null, alsoSpeaks: string[] = []): string | null {
  if (!clientEngines(client).includes(engine)) return `${ENGINES[engine].label} isn't switched on for your account. Ask RANA support to enable it.`;
  if (!engineSupports(engine, language, alsoSpeaks)) {
    const names = ENGINES[engine].callLanguages.map((l) => LANGUAGE_LABELS[l] || l).join(" and ");
    const other = ENGINE_IDS.find((id) => id !== engine && engineSupports(id, language, alsoSpeaks));
    return `${ENGINES[engine].label} agents can only talk in ${names} for now.${other ? ` Pick ${ENGINES[other].label} for this employee.` : ""}`;
  }
  return null;
}

export const LANGUAGE_LABELS: Record<string, string> = {
  en: "English", hi: "Hindi", te: "Telugu", ta: "Tamil", kn: "Kannada", ml: "Malayalam", mr: "Marathi",
  bn: "Bengali", gu: "Gujarati", pa: "Punjabi", or: "Odia", es: "Spanish", fr: "French", ja: "Japanese",
};
