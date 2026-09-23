// @ts-nocheck
import { PronunciationOverride } from "./langDetect";

export type ScriptId = "neet-reactivation" | "fee-reminder" | "new-batch" | "custom";

export type CampaignStats = {
  total: number;
  connected: number;
  failed: number;
  connectRate: number;      // percent 0-100
  avgDuration: number;      // seconds
  totalDuration: number;    // seconds
  breakdown: Record<string, number>;
  fetchedAt: string;        // ISO timestamp
};

export type Campaign = {
  id: string;
  name: string;
  scriptId: ScriptId;
  scriptLabel: string;
  fileName: string;
  fileSizeLabel: string;
  contactCountLabel: string;
  startDate: string;
  windowStart: string;
  windowEnd: string;
  days: string[];
  dialRate: string;
  status: "Scheduled" | "Active" | "Launching" | "Error";
  sarvamCampaignId?: string;   // set after successful Sarvam API call
  sarvamError?: string;        // set if Sarvam API call failed
  stats?: CampaignStats;       // live analytics pulled from Sarvam
  createdAt: number;
};

/** One numbered beat in the call script, e.g. "2. Qualify their need". */
export type AgentStep = { id: string; title: string; body: string };

/** A field expected to arrive with each lead (name, phone, exam, etc.) — reference these in the script. */
export type AgentVariable = { key: string; label: string };

export type ScriptVersion = {
  version: number;          // 1, 2, 3…
  label: string;            // e.g. "v3 – Medical College outbound"
  greeting: string;
  instructions: string;
  facts: string[];
  steps?: AgentStep[];
  variables?: AgentVariable[];
  strictness?: number;
  speaker: string;
  speechRate: number;
  speechPitch: number;
  startingLanguage: string;
  savedAt: number;          // Unix ms
};

export type BackgroundSound = "none" | "office" | "callcenter" | "traffic";

export type AgentSettings = {
  agentName: string;
  greeting: string;
  /** Derived from `steps` + `strictness` — kept in sync automatically, this is what actually gets sent to the AI edit and chat-test endpoints. */
  instructions: string;
  facts: string[];
  steps: AgentStep[];
  variables: AgentVariable[];
  /** 1 (loose guide, improvise freely) – 5 (follow the steps and wording exactly) */
  strictness: number;
  speechRate: number; // 0.5 - 2
  speechPitch: number; // 0 - 2
  startingLanguage: string; // BCP-47, e.g. "en-IN"
  backgroundSound: BackgroundSound;
  pronunciations: PronunciationOverride[];
};

export const LANGUAGES: { code: string; label: string }[] = [
  { code: "en-IN", label: "English" },
  { code: "hi-IN", label: "Hindi" },
  { code: "te-IN", label: "Telugu" },
  { code: "bn-IN", label: "Bengali" },
  { code: "gu-IN", label: "Gujarati" },
  { code: "kn-IN", label: "Kannada" },
  { code: "ml-IN", label: "Malayalam" },
  { code: "mr-IN", label: "Marathi" },
  { code: "ta-IN", label: "Tamil" },
  { code: "pa-IN", label: "Punjabi" },
];

/** How the agent should treat the steps below, depending on the strictness slider (1-5). */
export const STRICTNESS_LABELS: { value: number; label: string; description: string }[] = [
  { value: 1, label: "Very flexible", description: "Treats the steps as loose inspiration and improvises heavily around the caller (never inventing facts)." },
  { value: 2, label: "Flexible",      description: "Follows the steps as a loose guide — adapts wording and order naturally to how the caller responds." },
  { value: 3, label: "Balanced",      description: "Follows the steps in order, adapting the wording naturally as the conversation goes." },
  { value: 4, label: "Firm",          description: "Sticks closely to the steps and wording given, with limited improvisation." },
  { value: 5, label: "Strict",        description: "Follows the steps and wording exactly, in order." },
];

/** Builds the flat instructions text actually sent to the AI edit / chat-test endpoints from the structured steps. */
export function stepsToInstructions(steps: AgentStep[], strictness: number): string {
  const tier = STRICTNESS_LABELS.find((t) => t.value === strictness) ?? STRICTNESS_LABELS[2];
  const body = steps.map((s, i) => `${i + 1}. ${s.title}\n${s.body}`.trim()).join("\n\n");
  return `${tier.description}\n\n${body}`.trim();
}

/**
 * Best-effort parse of a flat instructions string back into numbered steps — used after the
 * "Ask AI" edit panel rewrites `instructions`, so the Call script tab stays in sync.
 * Falls back to treating each blank-line-separated paragraph as its own step if nothing is numbered.
 */
export function instructionsToSteps(text: string): AgentStep[] {
  if (!text?.trim()) return [];
  const blocks = text.trim().split(/\n\s*\n/).filter(Boolean);
  const numbered = blocks.filter((b) => /^\d+\.\s/.test(b.trim()));
  const source = numbered.length > 0 ? numbered : blocks;
  return source.map((b, i) => {
    const lines = b.trim().split("\n");
    const first = lines[0].replace(/^\d+\.\s*/, "").trim();
    const rest = lines.slice(1).join(" ").trim();
    return { id: `s${Date.now()}_${i}`, title: rest ? first : `Step ${i + 1}`, body: rest || first };
  });
}

const CAMPAIGNS_KEY = "rana_ai_campaigns_v1";
const VERSIONS_KEY   = "rana_ai_script_versions_v1";
const AGENT_KEY = "rana_ai_agent_settings_v3";

const DEFAULT_STEPS: AgentStep[] = [
  { id: "s1", title: "Open the call", body: "Confirm you're speaking with the right person. Address them as \"Dr. [Name]\" once you learn it." },
  { id: "s2", title: "Qualify their need", body: "Ask about their exam target (NEET PG / INICET / FMGE) and which attempt this is." },
  { id: "s3", title: "Handle objections", body: "If they mention budget concerns, acknowledge it and offer a counsellor callback with EMI options." },
  { id: "s4", title: "Close", body: "If they sound ready, offer to book a counselling session. Keep responses short and natural, like a real phone call." },
];

const DEFAULT_VARIABLES: AgentVariable[] = [
  { key: "lead_name", label: "Lead name" },
  { key: "phone_number", label: "Phone number" },
  { key: "exam", label: "Exam (NEET PG / INICET / FMGE)" },
  { key: "preferred_centre", label: "Preferred centre" },
];

const DEFAULT_STRICTNESS = 3;

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  agentName: "Ananya",
  greeting: "Namaste! This is Ananya calling from DBMCI. Am I speaking with the right person regarding NEET PG coaching?",
  steps: DEFAULT_STEPS,
  instructions: stepsToInstructions(DEFAULT_STEPS, DEFAULT_STRICTNESS),
  facts: [
    "Institute: Dr. Bhatia Medical Coaching Institute (DBMCI), Hyderabad franchise.",
    "Covers all NEET PG subjects, plus FMGE coaching, fully online.",
    "INICET preparation is covered as part of the same NEET PG coaching — no separate course.",
    "Centres: Hyderabad INDRA, Hyderabad ASC, Vizag ASC, Vijayawada INDRA.",
  ],
  variables: DEFAULT_VARIABLES,
  strictness: DEFAULT_STRICTNESS,
  speechRate: 1,
  speechPitch: 1,
  startingLanguage: "en-IN",
  backgroundSound: "none",
  pronunciations: [{ word: "DBMCI", sayAs: "D B M C I" }],
};

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function getCampaigns(): Campaign[] {
  if (typeof window === "undefined") return [];
  return safeParse<Campaign[]>(window.localStorage.getItem(CAMPAIGNS_KEY), []);
}

export function addCampaign(campaign: Campaign) {
  if (typeof window === "undefined") return;
  const existing = getCampaigns();
  window.localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify([campaign, ...existing]));
}

export function updateCampaign(id: string, patch: Partial<Campaign>) {
  if (typeof window === "undefined") return;
  const updated = getCampaigns().map((c) => c.id === id ? { ...c, ...patch } : c);
  window.localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(updated));
}

export function getAgentSettings(): AgentSettings {
  if (typeof window === "undefined") return DEFAULT_AGENT_SETTINGS;
  const parsed = safeParse<Partial<AgentSettings>>(window.localStorage.getItem(AGENT_KEY), {});
  const merged = { ...DEFAULT_AGENT_SETTINGS, ...parsed };
  // Older saves may predate steps/variables/strictness — backfill from instructions so nothing is lost.
  if (!merged.steps || merged.steps.length === 0) {
    merged.steps = merged.instructions ? instructionsToSteps(merged.instructions) : DEFAULT_STEPS;
  }
  if (!merged.variables) merged.variables = DEFAULT_VARIABLES;
  if (typeof merged.strictness !== "number") merged.strictness = DEFAULT_STRICTNESS;
  return merged;
}

export function saveAgentSettings(settings: AgentSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AGENT_KEY, JSON.stringify(settings));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ── Script versions ── */

export function getScriptVersions(): ScriptVersion[] {
  if (typeof window === "undefined") return [];
  return safeParse<ScriptVersion[]>(window.localStorage.getItem(VERSIONS_KEY), []);
}

export function saveScriptVersion(
  partial: Omit<ScriptVersion, "version" | "savedAt">,
  customLabel?: string
): ScriptVersion {
  const existing = getScriptVersions();
  const nextNum  = existing.length > 0 ? existing[0].version + 1 : 1;
  const version: ScriptVersion = {
    ...partial,
    version: nextNum,
    label: customLabel ?? `v${nextNum}`,
    savedAt: Date.now(),
  };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      VERSIONS_KEY,
      JSON.stringify([version, ...existing])
    );
  }
  return version;
}

export function deleteScriptVersion(version: number) {
  if (typeof window === "undefined") return;
  const existing = getScriptVersions().filter((v) => v.version !== version);
  window.localStorage.setItem(VERSIONS_KEY, JSON.stringify(existing));
}

export function getLatestVersion(): ScriptVersion | null {
  const versions = getScriptVersions();
  return versions.length > 0 ? versions[0] : null;
}
