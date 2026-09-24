// Do-not-call list and calling-hours rules. Checked on every launch; the DNC list also grows on its own
// whenever a caller asks not to be called again.
import { sb, inList } from "./db";

export type CallingRules = {
  timezone: string;
  windowStart: number; // minutes after local midnight
  windowEnd: number;
  days: number[]; // 0 = Sunday … 6 = Saturday
  enforce: boolean;
};

export const DEFAULT_RULES: CallingRules = { timezone: "Asia/Kolkata", windowStart: 540, windowEnd: 1260, days: [1, 2, 3, 4, 5, 6], enforce: true };
export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function rulesFromClient(c: any): CallingRules {
  if (!c) return DEFAULT_RULES;
  return {
    timezone: c.timezone || DEFAULT_RULES.timezone,
    windowStart: Number.isFinite(c.calling_window_start) ? c.calling_window_start : DEFAULT_RULES.windowStart,
    windowEnd: Number.isFinite(c.calling_window_end) ? c.calling_window_end : DEFAULT_RULES.windowEnd,
    days: Array.isArray(c.calling_days) && c.calling_days.length ? c.calling_days.map(Number) : DEFAULT_RULES.days,
    enforce: c.enforce_calling_window !== false,
  };
}

export function fmtMinutes(m: number): string {
  const h = Math.floor(m / 60), mm = m % 60;
  const ap = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${mm ? ":" + String(mm).padStart(2, "0") : ""}${ap}`;
}

export function describeRules(r: CallingRules): string {
  const days = r.days.length === 7 ? "every day" : r.days.slice().sort().map((d) => DAY_NAMES[d]).join(", ");
  return `${fmtMinutes(r.windowStart)}–${fmtMinutes(r.windowEnd)}, ${days} (${r.timezone})`;
}

/** Local weekday + minutes-after-midnight for an instant in a timezone. */
export function localClock(at: Date, timezone: string): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = DAY_NAMES.indexOf(get("weekday"));
  return { day: day < 0 ? 0 : day, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

export function insideWindow(r: CallingRules, at: Date = new Date()): boolean {
  if (!r.enforce) return true;
  const { day, minutes } = localClock(at, r.timezone);
  return r.days.includes(day) && minutes >= r.windowStart && minutes < r.windowEnd;
}

/** The next instant (to the minute) when calling is allowed, searching up to 8 days ahead. */
export function nextWindowOpen(r: CallingRules, from: Date = new Date()): Date | null {
  if (insideWindow(r, from)) return from;
  const step = 5 * 60_000;
  const start = Math.ceil(from.getTime() / step) * step;
  for (let t = start; t < from.getTime() + 8 * 86400_000; t += step) {
    if (insideWindow(r, new Date(t))) return new Date(t);
  }
  return null;
}

// ── Do-not-call ──

export async function dncSet(clientId: string, phones: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < phones.length; i += 300) {
    const chunk = phones.slice(i, i + 300);
    const rows = await sb<any[]>(`/dnc_numbers?client_id=eq.${clientId}&phone=in.${inList(chunk)}&select=phone`);
    for (const r of rows || []) out.add(r.phone);
  }
  return out;
}

export async function listDnc(clientId: string, q?: string) {
  const filter = q ? `&phone=ilike.*${encodeURIComponent(q.replace(/[^\d+]/g, ""))}*` : "";
  return sb<any[]>(`/dnc_numbers?client_id=eq.${clientId}${filter}&order=created_at.desc&limit=500`);
}

export async function countDnc(clientId: string): Promise<number> {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/dnc_numbers?client_id=eq.${clientId}&select=id`, {
    headers: { apikey: process.env.SUPABASE_SERVICE_KEY!, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`, Prefer: "count=exact", Range: "0-0" },
    cache: "no-store",
  });
  const range = res.headers.get("content-range") || "";
  return Number(range.split("/")[1]) || 0;
}

export async function addDnc(clientId: string, entries: { phone: string; reason?: string | null; source?: "manual" | "caller_request" | "import"; callId?: string | null; addedBy?: string | null }[]) {
  if (!entries.length) return;
  const rows = entries.map((e) => ({ client_id: clientId, phone: e.phone, reason: e.reason ?? null, source: e.source ?? "manual", call_id: e.callId ?? null, added_by: e.addedBy ?? null }));
  for (let i = 0; i < rows.length; i += 500) {
    await sb(`/dnc_numbers?on_conflict=client_id,phone`, { method: "POST", prefer: "resolution=ignore-duplicates,return=minimal", body: JSON.stringify(rows.slice(i, i + 500)) });
  }
}

export async function removeDnc(clientId: string, phone: string) {
  await sb(`/dnc_numbers?client_id=eq.${clientId}&phone=eq.${encodeURIComponent(phone)}`, { method: "DELETE", prefer: "return=minimal" });
}

/**
 * The caller asked not to be called again. Narrower than "not interested": only explicit opt-outs,
 * so a lukewarm "not now" never silently removes someone from future campaigns.
 */
const OPT_OUT = new RegExp([
  String.raw`stop (calling|phoning|ringing) (me|this number|us)`,
  String.raw`(don'?t|do not|never) (ever )?(call|phone|ring) (me|this number|us) ?(again|any ?more|ever)`,
  String.raw`(don'?t|do not|never) (call|phone|ring) (me|this number|us)(?= ?[.!?]| ?$)`,
  String.raw`(remove|delete|take) (me|my number)( off| from)`,
  String.raw`remove my number`, String.raw`unsubscribe`, String.raw`(add|put) (me|my number) (on|to) (the |your )?(dnd|do not call)`,
  String.raw`(call|phone) mat karo`, String.raw`dobara call mat`, String.raw`malli call (cheyakandi|cheyyakandi|cheyyodhu|cheyodhu)`, String.raw`call cheyy?akandi`,
].join("|"), "i");

export function optOutPhrase(callerText: string): string | null {
  const m = (callerText || "").match(OPT_OUT);
  return m ? m[0] : null;
}
