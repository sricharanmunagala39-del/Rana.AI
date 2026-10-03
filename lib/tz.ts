// A client's own time zone and number/date style. Indian clients see IST and en-IN; everyone else sees
// their workspace time zone (Settings → Calling hours) and US-style dates. Safe to import on server and client.

export const DEFAULT_ZONE = "Asia/Kolkata";

/** Time zone a market starts with when the client hasn't picked one. */
const MARKET_ZONE: Record<string, string> = {
  in: "Asia/Kolkata", us: "America/New_York", global: "America/New_York", ae: "Asia/Dubai", eu: "Europe/London", jp: "Asia/Tokyo",
};

export function isZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
}

export function isIndia(c: any): boolean {
  return !c?.market || c.market === "in";
}

/** The zone a client's times are shown and scheduled in. A non-India client still on the old
 *  column default (Asia/Kolkata) gets their market's zone instead. */
export function zoneOf(c: any): string {
  const market = c?.market || "in";
  const tz = c?.timezone;
  if (isZone(tz) && !(market !== "in" && tz === DEFAULT_ZONE)) return tz;
  return MARKET_ZONE[market] || DEFAULT_ZONE;
}

export function localeOf(c: any): string {
  return isIndia(c) ? "en-IN" : "en-US";
}

/** Offset of a zone from UTC in ms at an instant (positive east of Greenwich). */
export function offsetMs(tz: string, at: number = Date.now()): number {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(at)).map((x) => [x.type, x.value]));
    const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
    return Math.round((asUtc - Math.floor(at / 1000) * 1000) / 60000) * 60000;
  } catch { return 5.5 * 3600e3; }
}

/** YYYY-MM-DD in a zone. */
export function localDate(tz: string, at: number = Date.now()): string {
  return new Date(at + offsetMs(tz, at)).toISOString().slice(0, 10);
}

/** UTC instant of local midnight at the start of a YYYY-MM-DD in a zone. */
export function dayStart(tz: string, ymd: string): number {
  const guess = Date.parse(`${ymd}T00:00:00Z`);
  return guess - offsetMs(tz, guess - offsetMs(tz, guess));
}

/** Local "YYYY-MM-DDTHH:MM" (a datetime-local value) → UTC instant. */
export function localToUtc(tz: string, local: string): number {
  const guess = Date.parse(`${local}:00Z`);
  return guess - offsetMs(tz, guess - offsetMs(tz, guess));
}

/** Short zone name, e.g. "IST", "EDT", "GMT+4". */
export function zoneLabel(tz: string, at: number = Date.now()): string {
  if (tz === "Asia/Kolkata") return "IST";
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(new Date(at)).find((x) => x.type === "timeZoneName")?.value || tz;
  } catch { return tz; }
}

/** Friendly name for a zone, e.g. "Eastern Time (New York)". */
export function zoneName(tz: string): string {
  if (tz === "Asia/Kolkata") return "India time";
  try {
    const long = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "long" }).formatToParts(new Date()).find((x) => x.type === "timeZoneName")?.value;
    const city = tz.split("/").pop()!.replace(/_/g, " ");
    return long ? `${long.replace(/ (Standard|Daylight) Time$/, " Time")} (${city})` : tz;
  } catch { return tz; }
}
