// RANA Sales Engine — shared types. Pure data: safe to import from server code, the dashboard and tests.
// Every fact the engine stores carries the URL it came from, so nothing on screen is a guess dressed up as a fact.

export type Mode = "simulation" | "live";
export type Lang = "en" | "hi" | "te" | "te-en";
export type Country = "IN" | "US" | "AU";
export type SourceId = "osm" | "list" | "crm";

export type DemoRules = {
  /** Weekdays demos can happen on (0 = Sunday). */
  days: number[];
  /** Minutes after local midnight, in `timezone`. */
  start: number;
  end: number;
  slotMinutes: number;
  timezone: string;
  /** No demo sooner than this many hours from the call. */
  bufferHours: number;
  /** How far ahead slots are offered. */
  horizonDays: number;
};

export type UploadedCompany = {
  business: string; website?: string | null; phone?: string | null; email?: string | null; city?: string | null;
  contactName?: string | null; contactRole?: string | null;
  /** The person agreed to be called (needed for automated calls in the US and Australia). */
  consent?: boolean;
};

export type CampaignConfig = {
  name: string;
  country: Country;
  region: string; // city / state / area searched, e.g. "Hyderabad"
  industry: string; // real_estate | education | healthcare | recruitment | hospitality | other
  subIndustry: string;
  companySize: "any" | "small" | "mid" | "large";
  companyTypes: string[];
  roles: string[];
  prospectCount: number;
  problem: string;
  useCase: string;
  language: Lang;
  callingStart: number; // minutes after local midnight
  callingEnd: number;
  timezone: string;
  maxAttempts: number;
  minScore: number;
  qualification: string[];
  demo: DemoRules;
  sources: SourceId[];
  uploadedList?: UploadedCompany[];
  mode: Mode;
};

export type Evidence = { field: string; value: string; url: string; at: string; verified: boolean };
export type Signal = { key: string; label: string; snippet: string; url: string };

export type PhoneType = "direct" | "general" | "mobile" | "unverified" | "none";
export type ContactPerson = {
  name: string | null;
  role: string | null;
  /** Matches one of the campaign's decision-maker roles. */
  decisionMaker: boolean;
  phone: string | null;
  phoneType: PhoneType;
  email: string | null;
  sourceUrl: string | null;
  verified: boolean;
  consent?: boolean;
};

export type Company = {
  name: string; website: string | null; domain: string | null; industry: string; country: Country; region: string;
  city: string | null; address: string | null; description: string | null; services: string[];
  phone: string | null; phoneType: PhoneType; email: string | null; branches: number;
};

export type ScoreReason = { points: number; reason: string; kind: "fact" | "hypothesis"; url?: string };

export type ProspectStatus =
  | "new" | "research_completed" | "contact_verified" | "ready"
  | "calling" | "no_answer" | "receptionist" | "decision_maker_reached"
  | "interested" | "not_interested" | "callback_requested"
  | "demo_booked" | "booking_pending"
  | "needs_other_approach" | "disqualified" | "opted_out" | "blocked" | "awaiting_outcome";

export type OutreachPlan = {
  language: Lang;
  opening: string;
  permission: string;
  problem: string;
  howWeHelp: string;
  questions: string[];
  demoInvite: string;
  receptionist: string;
  objections: { objection: string; reply: string }[];
  followUp: string;
  /** Facts the script leans on, with sources. Nothing else may be claimed about the company. */
  groundedOn: Evidence[];
};

export type TranscriptLine = { who: "agent" | "person"; text: string };
export type CallResult = {
  simulated: boolean;
  connected: boolean;
  reached: "none" | "voicemail" | "receptionist" | "decision_maker";
  outcome: "no_answer" | "referred" | "interested" | "not_interested" | "callback" | "opted_out" | "pending";
  transcript: TranscriptLine[];
  callbackAt?: string | null;
  /** The person agreed to a demo; index into the offered slots. */
  acceptedSlot?: number | null;
  qualification?: Record<string, string>;
  objections?: string[];
  providerCallId?: string | null;
  referredTo?: string | null;
};

export type Booking = {
  id: string; campaignId: string; prospectId: string; slotStart: string; slotEnd: string; timezone: string;
  company: string; contactName: string | null; phone: string | null; email: string | null; notes: string; status: "confirmed" | "cancelled";
  createdAt: string;
};

export type Prospect = {
  id: string;
  campaignId: string;
  /** Dedupe key: website domain, else phone, else name+city. */
  key: string;
  company: Company;
  contacts: ContactPerson[];
  evidence: Evidence[];
  signals: Signal[];
  hypotheses: string[];
  score: number | null;
  scoreReasons: ScoreReason[];
  status: ProspectStatus;
  statusReason: string | null;
  attempts: number;
  frontDeskAttempts: number;
  researchTries: number;
  nextActionAt: string | null;
  outreach: OutreachPlan | null;
  lastCall: CallResult | null;
  booking: Booking | null;
  crmDealId: string | null;
  source: SourceId;
  /** Tests only: forces what the simulated call does. */
  simScenario?: SimScenario | null;
  errors: string[];
  createdAt: string;
  updatedAt: string;
};

export type SimScenario = "no_answer" | "receptionist" | "receptionist_transfer" | "interested_book" | "callback" | "decline" | "opt_out";

export type CampaignStatus = "running" | "paused" | "cancelled" | "completed" | "failed";
export type Phase = "discover" | "research" | "score" | "call" | "follow_up" | "done";

export type LogLine = { at: string; level: "info" | "warn" | "error"; msg: string };

export type Campaign = {
  id: string;
  name: string;
  config: CampaignConfig;
  configHash: string;
  status: CampaignStatus;
  phase: Phase;
  mode: Mode;
  /** Source ids already run (discovery is once per source). */
  sourcesDone: string[];
  /** Failed attempts per source (gives up after 3). */
  sourceTries: Record<string, number>;
  /** When the engine should next do work (calling hours, follow-ups). */
  nextRunAt: string | null;
  log: LogLine[];
  lockUntil: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type Counters = {
  companiesDiscovered: number;
  decisionMakers: number;
  contactsVerified: number;
  qualified: number;
  callReady: number;
  callsAttempted: number;
  callsConnected: number;
  decisionMakersReached: number;
  interested: number;
  demosBooked: number;
  bookingsPending: number;
  followUpsScheduled: number;
  disqualified: number;
  optedOut: number;
  needsOtherApproach: number;
  blocked: number;
  errors: number;
  simulatedCalls: number;
  liveCalls: number;
};

export type EventKind = "call" | "booking" | "booking_failed" | "crm" | "suppressed" | "error" | "status";
export type EngineEvent = { id: string; campaignId: string; prospectId: string | null; kind: EventKind; data: any; at: string };
