"use client";

import { PronunciationOverride } from "./langDetect";

export type ScriptId = "neet-reactivation" | "fee-reminder" | "new-batch" | "custom";

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
  status: "Scheduled" | "Active";
  createdAt: number;
};

export type BackgroundSound = "none" | "office" | "callcenter" | "traffic";

export type AgentSettings = {
  agentName: string;
  greeting: string;
  instructions: string;
  facts: string[];
  speechRate: number;
  speechPitch: number;
  startingLanguage: string;
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

const CAMPAIGNS_KEY = "rana_ai_campaigns_v1";
const AGENT_KEY = "rana_ai_agent_settings_v3";

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  agentName: "Ananya",
  greeting: "Namaste! This is Ananya calling from DBMCI. Am I speaking with the right person regarding NEET PG coaching?",
  instructions:
    "Speak warmly and respectfully. Always address the caller as \"Dr. [Name]\" once you learn it. " +
    "Ask about their exam target and which attempt this is. If they mention budget concerns, " +
    "acknowledge it and offer to have a counsellor call back with EMI options. If they sound ready, " +
    "offer to book a counselling session. Keep responses short and natural, like a real phone call.",
  facts: [
    "Institute: Dr. Bhatia Medical Coaching Institute (DBMCI), Hyderabad franchise.",
    "Covers all NEET PG subjects, plus FMGE coaching, fully online.",
    "INICET preparation is covered as part of the same NEET PG coaching — no separate course.",
    "Centres: Hyderabad INDRA, Hyderabad ASC, Vizag ASC, Vijayawada INDRA.",
  ],
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

export function getAgentSettings(): AgentSettings {
  if (typeof window === "undefined") return DEFAULT_AGENT_SETTINGS;
  const parsed = safeParse<Partial<AgentSettings>>(window.localStorage.getItem(AGENT_KEY), {});
  return { ...DEFAULT_AGENT_SETTINGS, ...parsed };
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
