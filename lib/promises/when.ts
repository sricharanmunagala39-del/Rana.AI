// Turns the time words in a promise ("tomorrow", "at 5 PM", "repu", "on Monday", "end of the month")
// into a concrete due time. Works in the client's local time via a fixed UTC offset — India (+05:30)
// has no daylight saving, which keeps this exact for the main market without a tz database.

import type { PromiseKind, Owed } from "./types";

export const IST_OFFSET_MIN = 330;

/** How long the business has when the caller gave no time. Kept short on purpose: an unkept promise costs more than an early one. */
export const DEFAULT_DUE_MINUTES: Record<PromiseKind, number> = {
  connect_human: 10, //  the handoff prompt tells callers "within 10 minutes"
  send_info: 30,
  confirm_slot: 60,
  callback: 24 * 60,
  counselling: 24 * 60,
  demo_class: 24 * 60,
  site_visit: 24 * 60,
};

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DEFAULT_HOUR = 11; // "tomorrow" with no time → 11:00 local

type Local = { y: number; m: number; d: number; h: number; min: number; dow: number };

function toLocal(utc: Date, off: number): Local {
  const t = new Date(utc.getTime() + off * 60_000);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate(), h: t.getUTCHours(), min: t.getUTCMinutes(), dow: t.getUTCDay() };
}
function fromLocal(y: number, m: number, d: number, h: number, min: number, off: number): Date {
  return new Date(Date.UTC(y, m, d, h, min) - off * 60_000);
}

/** "5 pm", "5:30 PM", "17:00", "5 o'clock in the evening" → { h, min } (24h), or null. */
export function parseClock(text: string): { h: number; min: number } | null {
  const t = text.toLowerCase();
  let m = t.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)/);
  if (m) {
    let h = Number(m[1]) % 12;
    if (m[3].startsWith("p")) h += 12;
    return valid(h, Number(m[2] || 0));
  }
  m = t.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (m) return valid(Number(m[1]), Number(m[2]));
  m = t.match(/\b(\d{1,2})\s*(?:o'?\s?clock)?\s*(?:in the )?(morning|afternoon|evening|night)\b/);
  if (m) {
    let h = Number(m[1]) % 12;
    if (m[2] !== "morning") h += 12;
    return valid(h, 0);
  }
  return null;
}
function valid(h: number, min: number) {
  return h >= 0 && h < 24 && min >= 0 && min < 60 ? { h, min } : null;
}

/**
 * Resolve a due time from free text spoken on the call.
 * Returns null when the text has no time words — the caller then applies DEFAULT_DUE_MINUTES.
 */
export function resolveDue(text: string, ref: Date, off = IST_OFFSET_MIN): { at: Date; said: string } | null {
  const t = ` ${String(text || "").toLowerCase()} `;
  const now = toLocal(ref, off);
  const clock = parseClock(t);

  const rel = t.match(/\b(?:in|within)\s+(?:the next\s+)?(\d+|an?|one|half an?)\s*(minute|min|hour|hr)s?\b/);
  if (rel) {
    const n = /half/.test(rel[1]) ? 0.5 : /^(an?|one)$/.test(rel[1]) ? 1 : Number(rel[1]);
    const mins = /^h/.test(rel[2]) ? n * 60 : n;
    return { at: new Date(ref.getTime() + mins * 60_000), said: rel[0].trim() };
  }
  if (/\b(immediately|right away|right now|straight away|turant|ventane)\b/.test(t)) {
    return { at: new Date(ref.getTime() + 15 * 60_000), said: "immediately" };
  }

  let dayShift: number | null = null;
  let said = "";
  const wd = WEEKDAYS.findIndex((w) => new RegExp(`\\b${w}\\b`).test(t));
  if (/\b(day after tomorrow|ellundi|parson)\b/.test(t)) { dayShift = 2; said = "day after tomorrow"; }
  else if (/\b(tomorrow|tmrw|repu|kal)\b/.test(t)) { dayShift = 1; said = "tomorrow"; }
  else if (wd >= 0) { dayShift = ((wd - now.dow + 7) % 7) || 7; said = WEEKDAYS[wd]; }
  else if (/\bnext week\b/.test(t)) { dayShift = 7; said = "next week"; }
  else if (/\b(end of (the|this) month|month end)\b/.test(t)) {
    const last = new Date(Date.UTC(now.y, now.m + 1, 0)).getUTCDate();
    dayShift = last - now.d; said = "end of the month";
  } else if (/\b(today|this evening|in the evening|tonight|this afternoon|in the afternoon|ivala|ee roju|aaj|sayantram|shaam ko)\b/.test(t)) { dayShift = 0; said = "today"; }

  if (dayShift === null && !clock) return null;

  let h = clock?.h ?? DEFAULT_HOUR, min = clock?.min ?? 0;
  if (!clock && /\b(this evening|tonight|evening)\b/.test(t)) { h = 18; min = 0; }
  if (!clock && /\bafternoon\b/.test(t)) { h = 15; min = 0; }
  let shift = dayShift ?? 0;
  if (clock) said = said ? `${said} ${fmt(h, min)}` : `at ${fmt(h, min)}`;

  let at = fromLocal(now.y, now.m, now.d + shift, h, min, off);
  // "at 5 PM" said after 5 PM, or "today" with no time once 11:00 has passed → move to the next sensible slot.
  if (at.getTime() <= ref.getTime()) {
    if (dayShift === null) at = fromLocal(now.y, now.m, now.d + 1, h, min, off);
    else if (dayShift === 0 && !clock) at = new Date(ref.getTime() + 2 * 3600_000);
  }
  return { at, said };
}

function fmt(h: number, min: number) {
  const ap = h >= 12 ? "PM" : "AM";
  const hh = h % 12 || 12;
  return min ? `${hh}:${String(min).padStart(2, "0")} ${ap}` : `${hh} ${ap}`;
}

/** Due time for a promise: spoken time if any, otherwise the per-kind default. customer_first waits for the customer. */
export function dueFor(kind: PromiseKind, owed: Owed, text: string, ref: Date, off = IST_OFFSET_MIN): { dueAt: string | null; dueText: string | null } {
  if (owed === "customer_first") return { dueAt: null, dueText: "after the customer messages" };
  const r = resolveDue(text, ref, off);
  if (r) return { dueAt: r.at.toISOString(), dueText: r.said };
  return { dueAt: new Date(ref.getTime() + DEFAULT_DUE_MINUTES[kind] * 60_000).toISOString(), dueText: "default" };
}
