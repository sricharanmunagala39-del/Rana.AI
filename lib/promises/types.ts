// Promise Engine — shared types.
//
// A "promise" is anything the AI agent (or the caller) committed the business to on a call:
// "we will send the location", "our counsellor will call you", "I'll confirm the 5 PM site visit".
// Today these commitments live only inside transcripts. The Promise Engine turns each one into a
// tracked task that stays open until there is *evidence* it was done — never just because the agent
// said it would be done.

export type PromiseKind =
  | "send_info" //       send location / brochure / details / photos / price list
  | "callback" //        a person from the business calls the customer back
  | "connect_human" //   hand-off: "my team member / senior advisor will call you"
  | "counselling" //     education: counselling session to arrange
  | "demo_class" //      education: demo class to book
  | "site_visit" //      real estate (or store) visit to schedule
  | "confirm_slot"; //   agent said it will check availability and confirm a time

export type PromiseStatus =
  | "created" //         detected, not yet assigned
  | "pending" //         assigned / waiting to be worked (or waiting for the customer to message first)
  | "in_progress" //     someone (or an automation) is working on it
  | "completed" //       done, with evidence
  | "failed" //          an attempt failed; may be retried
  | "cancelled" //       no longer needed (customer declined, duplicate, wrong number…)
  | "needs_human"; //    retries exhausted or too risky to automate — a person must look

/**
 * Who has to move first.
 * - "business": the business owes the action now (e.g. "our counsellor will call you").
 * - "customer_first": the agent told the caller to message first ("send 'Hi' on WhatsApp and we will
 *   send the location"). The business still owes a reply, but only once the customer writes in.
 */
export type Owed = "business" | "customer_first";

export type Channel = "whatsapp" | "sms" | "email" | "call" | "in_person";

export type Industry = "education" | "real_estate" | "retail" | "other";

export type TranscriptTurn = { role: string; text?: string | null; indic_text?: string | null };

/** What the detector needs from a finished call. Mirrors columns already on `calls`. */
export type CallForPromises = {
  id: string;
  client_id: string;
  caller_phone?: string | null;
  caller_name?: string | null;
  summary?: string | null;
  transcript?: TranscriptTurn[] | null;
  started_at?: string | null;
  ended_at?: string | null;
  duration_seconds?: number | null;
  handoff?: { rule?: string; emailed?: boolean } | null;
};

export type PromiseSource = {
  /** Which part of the call the promise came from. */
  from: "agent" | "caller" | "summary" | "handoff";
  /** 0-based index into the transcript, when it came from a turn. */
  turn: number | null;
  /** Short excerpt (≤ 220 chars) so a human can audit why the task exists. */
  quote: string;
};

export type DetectedPromise = {
  kind: PromiseKind;
  title: string;
  owed: Owed;
  channel: Channel | null;
  /** location | brochure | details | photos | price_list | office_number | wholesale_details | null */
  item: string | null;
  /** ISO timestamp the business should act by, or null when nothing is owed yet (customer_first). */
  dueAt: string | null;
  /** The words that set the due time, e.g. "tomorrow", "at 5 PM", or "default" when none were said. */
  dueText: string | null;
  confidence: "high" | "medium";
  source: PromiseSource;
  /** Stable per (client, call, kind): re-processing the same call never creates a duplicate task. */
  dedupeKey: string;
};

export type EvidenceType =
  | "message_id" //          provider id of a WhatsApp / SMS / email that was accepted for delivery
  | "call_id" //             id of the follow-up call that connected
  | "calendar_event_id" //   booking confirmed by the calendar / booking system
  | "crm_record_id" //       record written in the client's CRM
  | "human_confirmation"; // a named team member marked it done in RANA

export type Evidence = { type: EvidenceType; ref: string; at?: string; by?: string; note?: string };

export type PromiseTask = DetectedPromise & {
  id: string;
  clientId: string;
  callId: string;
  customerPhone: string | null;
  customerName: string | null;
  status: PromiseStatus;
  assignee: string | null;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  evidence: Evidence | null;
  createdAt: string;
  updatedAt: string;
};

export type PromiseEvent = {
  taskId: string;
  from: PromiseStatus | null;
  to: PromiseStatus;
  actor: string;
  at: string;
  reason?: string | null;
  evidence?: Evidence | null;
};
