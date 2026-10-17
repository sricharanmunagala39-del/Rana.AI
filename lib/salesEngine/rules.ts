// Calling-hours and live-calling rules per country. The engine never places a real call unless every check
// here passes; in simulation mode the same checks run so the dashboard shows what a live run would be blocked by.
import type { CampaignConfig, Country, Prospect } from "./types";
import { bestContact } from "./scoring";

type Window = { days: number[]; start: number; end: number; satEnd?: number; law: string };

/** The widest window the law allows, in the called business's local time. Campaign hours can only narrow it. */
export const LEGAL_WINDOWS: Record<Country, Window> = {
  // TRAI TCCCPR: commercial calls 9:00–21:00.
  IN: { days: [1, 2, 3, 4, 5, 6], start: 9 * 60, end: 21 * 60, law: "India (TRAI): 9am–9pm" },
  // TCPA / FTC TSR: 8:00–21:00 called party's local time.
  US: { days: [1, 2, 3, 4, 5], start: 8 * 60, end: 21 * 60, law: "US (TCPA): 8am–9pm local" },
  // Telemarketing and Research Industry Standard 2017: weekdays 9–20, Sat 9–17, never Sunday or public holidays.
  AU: { days: [1, 2, 3, 4, 5, 6], start: 9 * 60, end: 20 * 60, satEnd: 17 * 60, law: "Australia (Telemarketing Standard): weekdays 9am–8pm, Sat 9am–5pm, no Sundays" },
};

export function localDayMinutes(at: Date, tz: string): { day: number; minutes: number; ymd: string } {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(at).map((x) => [x.type, x.value]));
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { day, minutes: (+p.hour % 24) * 60 + +p.minute, ymd: `${p.year}-${p.month}-${p.day}` };
}

export function callingWindow(cfg: CampaignConfig): { days: number[]; start: number; end: number; satEnd?: number; law: string } {
  const law = LEGAL_WINDOWS[cfg.country];
  const start = Math.max(law.start, cfg.callingStart);
  const end = Math.max(start + 1, Math.min(law.end, cfg.callingEnd));
  return { days: law.days, start, end, satEnd: law.satEnd ? Math.min(law.satEnd, end) : undefined, law: law.law };
}

export function insideCallingHours(cfg: CampaignConfig, at: Date): boolean {
  const w = callingWindow(cfg);
  const { day, minutes } = localDayMinutes(at, cfg.timezone);
  if (!w.days.includes(day)) return false;
  const end = day === 6 && w.satEnd ? w.satEnd : w.end;
  return minutes >= w.start && minutes < end;
}

export function nextCallingTime(cfg: CampaignConfig, from: Date): Date {
  if (insideCallingHours(cfg, from)) return from;
  const step = 15 * 60_000;
  for (let t = Math.ceil(from.getTime() / step) * step; t < from.getTime() + 9 * 86400_000; t += step) {
    if (insideCallingHours(cfg, new Date(t))) return new Date(t);
  }
  return new Date(from.getTime() + 86400_000);
}

export type LiveEnv = { liveSwitch: boolean; telephonyReady: boolean; indiaTelemarketerOk: boolean };

/** Why a REAL call to this prospect must not be placed — or null when every rule is satisfied. */
export function liveCallBlocker(cfg: CampaignConfig, p: Prospect, env: LiveEnv): string | null {
  if (!env.liveSwitch) return "Live calling is switched off for this deployment (SALES_ENGINE_LIVE_CALLS is not 1).";
  if (!env.telephonyReady) return "No telephony connection is configured, so no real call can be placed.";
  const best = bestContact(p);
  const consent = !!best.person?.consent || p.contacts.some((c) => c.consent);
  if (cfg.country === "US" && !consent)
    return "US: automated / AI-voice calls need the person's prior express written consent (TCPA; FCC Feb 2024 ruling on AI voices). No consent on record — use a manual call or email instead.";
  if (cfg.country === "AU" && !consent)
    return "Australia: no consent on record and the number hasn't been washed against the Do Not Call Register — not called. Use a manual call or email instead.";
  if (cfg.country === "IN" && !env.indiaTelemarketerOk)
    return "India: under TRAI's TCCCPR (amended Feb 2025) promotional calls must come from a DLT-registered 140-series number, robocalls must be declared to the operator, and DND preferences must be respected. Confirm all three and set SALES_ENGINE_IN_TELEMARKETER_OK=1.";
  return null;
}
