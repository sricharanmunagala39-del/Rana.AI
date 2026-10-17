// Demo booking. The calendar is RANA's own: demo hours set on the campaign, minus demos already booked.
// A database unique index on the slot makes double-booking impossible even if two calls finish together.
// A booking that fails is recorded as "booking pending" for a person to confirm — never shown as booked.
import type { Booking, DemoRules, Prospect } from "./types";
import type { Store } from "./store";
import { localDayMinutes } from "./rules";
import { bestContact } from "./scoring";

export type Slot = { start: string; end: string; label: string };

export interface BookingAdapter {
  id: string;
  /** Real free slots, soonest first. */
  freeSlots(rules: DemoRules, from: Date, count: number, prospectTz: string): Promise<Slot[]>;
  book(slot: Slot, p: Prospect, campaignId: string, notes: string, tz: string): Promise<Booking>;
}

/** Wall-clock time in a zone → UTC instant. */
export function zonedToUtc(ymd: string, minutes: number, tz: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  // Two passes handles DST edges.
  let t = guess;
  for (let i = 0; i < 2; i++) {
    const p = localDayMinutes(new Date(t), tz);
    const [py, pm, pd] = p.ymd.split("-").map(Number);
    const diff = (Date.UTC(py, pm - 1, pd) + p.minutes * 60_000) - guess;
    t -= diff;
  }
  return new Date(t);
}

export function slotLabel(startIso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short" }).format(new Date(startIso));
}

export function candidateSlots(rules: DemoRules, from: Date, horizonEnd: Date): { start: Date; end: Date }[] {
  const out: { start: Date; end: Date }[] = [];
  const earliest = from.getTime() + rules.bufferHours * 3600_000;
  for (let d = 0; d <= rules.horizonDays + 1; d++) {
    const ymd = localDayMinutes(new Date(from.getTime() + d * 86400_000), rules.timezone).ymd;
    const dow = new Date(`${ymd}T12:00:00Z`).getUTCDay();
    if (!rules.days.includes(dow)) continue;
    for (let m = rules.start; m + rules.slotMinutes <= rules.end; m += rules.slotMinutes) {
      const s = zonedToUtc(ymd, m, rules.timezone);
      if (s.getTime() < earliest || s > horizonEnd) continue;
      out.push({ start: s, end: new Date(s.getTime() + rules.slotMinutes * 60_000) });
    }
  }
  const seen = new Set<number>();
  return out.filter((s) => (seen.has(s.start.getTime()) ? false : (seen.add(s.start.getTime()), true))).sort((a, b) => a.start.getTime() - b.start.getTime());
}

export class InternalCalendar implements BookingAdapter {
  id = "internal";
  constructor(private store: Store) {}
  async freeSlots(rules: DemoRules, from: Date, count: number, prospectTz: string): Promise<Slot[]> {
    const horizonEnd = new Date(from.getTime() + rules.horizonDays * 86400_000);
    const taken = new Set((await this.store.listBookings(from.toISOString(), horizonEnd.toISOString())).map((b) => b.slotStart));
    return candidateSlots(rules, from, horizonEnd)
      .filter((s) => !taken.has(s.start.toISOString()))
      .slice(0, count)
      .map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString(), label: slotLabel(s.start.toISOString(), prospectTz) }));
  }
  async book(slot: Slot, p: Prospect, campaignId: string, notes: string, tz: string): Promise<Booking> {
    const best = bestContact(p);
    return this.store.createBooking({
      campaignId, prospectId: p.id, slotStart: slot.start, slotEnd: slot.end, timezone: tz, company: p.company.name,
      contactName: best.person?.name || null, phone: best.phone, email: best.person?.email || p.company.email, notes: notes.slice(0, 2000), status: "confirmed",
    });
  }
}
