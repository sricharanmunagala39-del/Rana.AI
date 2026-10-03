import type { PillTone } from "@/components/StatusPill";
import type { LeadStatus } from "./calls";
import { DEFAULT_ZONE, isZone, zoneLabel } from "./tz";

export const LEAD_LABEL: Record<LeadStatus, string> = {
  new: "New", cold: "Cold", warm: "Warm", hot: "Hot", ready_to_close: "Ready to close",
  not_interested: "Not interested", no_answer: "No answer",
};
export const LEAD_TONE: Record<LeadStatus, PillTone> = {
  new: "neutral", cold: "neutral", warm: "warm", hot: "hot", ready_to_close: "signal",
  not_interested: "miss", no_answer: "miss",
};
export const LEAD_ORDER: LeadStatus[] = ["ready_to_close", "hot", "warm", "new", "cold", "not_interested", "no_answer"];

export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}
export function fmtPhone(p: string | null): string {
  if (!p) return "Unknown";
  const d = p.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  if (d.length === 11 && d.startsWith("1") && p.trim().startsWith("+")) return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  return p;
}
/* ── Display zone ──
 * Times are shown in the signed-in client's own zone. The sidebar learns it from /api/auth/me and keeps it
 * in the `rana_tz` cookie ("<zone>|<locale>"), so every page formats with it from the first paint. */
let ZONE = DEFAULT_ZONE;
let LOCALE = "en-IN";
if (typeof document !== "undefined") {
  const m = document.cookie.match(/(?:^|; )rana_tz=([^;]+)/);
  if (m) { const [z, l] = decodeURIComponent(m[1]).split("|"); if (isZone(z)) ZONE = z; if (l === "en-US" || l === "en-IN") LOCALE = l; }
}
export const displayZone = () => ZONE;
export const displayLocale = () => LOCALE;
/** Remember the client's zone. Returns true if it changed (the caller reloads so every page re-renders). */
export function setDisplayZone(zone: string, locale: string): boolean {
  if (!isZone(zone)) return false;
  const loc = locale === "en-US" ? "en-US" : "en-IN";
  const changed = zone !== ZONE || loc !== LOCALE;
  ZONE = zone; LOCALE = loc;
  if (typeof document !== "undefined") document.cookie = `rana_tz=${encodeURIComponent(`${zone}|${loc}`)}; path=/; max-age=31536000; samesite=lax`;
  return changed;
}
/** "IST", "EDT"… for the display zone. */
export const fmtZone = () => zoneLabel(ZONE);
export const fmtNum = (n: number) => Number(n || 0).toLocaleString(LOCALE);

export function fmtTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return fmtDate(iso);
}
export function fmtClock(iso: string): string {
  return new Date(iso).toLocaleTimeString(LOCALE, { hour: "numeric", minute: "2-digit", timeZone: ZONE });
}
export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(LOCALE, { day: "numeric", month: "short", timeZone: ZONE });
}
export function fmtDateTime(iso: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }): string {
  return new Date(iso).toLocaleString(LOCALE, { ...opts, timeZone: ZONE });
}
/** A local calendar day ("YYYY-MM-DD") as "3 Oct" / "Oct 3". */
export function fmtDay(ymd: string): string {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString(LOCALE, { day: "numeric", month: "short", timeZone: "UTC" });
}
