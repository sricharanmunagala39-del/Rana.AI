import type { PillTone } from "@/components/StatusPill";
import type { LeadStatus } from "./calls";

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
  return p;
}
export function fmtTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}
export function fmtClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
}
export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}
