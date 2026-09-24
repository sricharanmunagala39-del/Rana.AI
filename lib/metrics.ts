// The single source of truth for every number on the RANA dashboard.
// Pure functions over LeanCall rows — the API route fetches, this file counts.
import type { LeanCall, CampaignRow, LeadStatus } from "./calls";

export const TZ_OFFSET_MS = 5.5 * 3600 * 1000; // IST — all RANA clients are India-based

/* ── Definitions (also rendered in the dashboard's "How we count" panel) ── */
export const DEFINITIONS: { term: string; rule: string }[] = [
  { term: "Dialled", rule: "Every outbound attempt the agent made, answered or not." },
  { term: "Received", rule: "Every inbound call that reached the agent." },
  { term: "Connected (lifted)", rule: "The call was answered and talk time was more than 0s. Busy, no-answer, rejected, voicemail and failed dials are not connected." },
  { term: "DNP (did not pick)", rule: "An outbound attempt that was not connected." },
  { term: "Connectivity %", rule: "Connected ÷ (Dialled + Received)." },
  { term: "Engaged", rule: "Connected, talked 30s or more, and the caller spoke at least twice — a real conversation, not a hang-up." },
  { term: "Interested", rule: "Warm + Hot + Ready to close." },
  { term: "Hot", rule: "Asked a buying question (fees, batch, price, timing, EMI, location…) and talked 60s or more. Ready to close counts as Hot too." },
  { term: "Ready to close", rule: "A commitment signal: wants to join / pay / book, asked for the payment link, or agreed to a visit." },
  { term: "Warm", rule: "Showed interest but the call was short, asked for a callback, or had a long conversation without a clear buying question." },
  { term: "Cold", rule: "Connected but ended within 15s, or no interest signal at all." },
  { term: "Not interested", rule: "Caller declined — \"not interested\", \"don't call\", wrong number, already joined, vaddu, nahi chahiye…" },
  { term: "Follow-up", rule: "Caller asked to be called back later, or is Ready to close (sales must call)." },
  { term: "Talk time", rule: "Sum of connected call durations. Avg talk time = talk time ÷ connected." },
  { term: "Lead rate", rule: "Interested ÷ Connected." },
];

const NOT_CONNECTED = /dial_failed|no_answer|busy|voicemail|failed|rejected|unreachable/;
export function isConnected(c: LeanCall): boolean {
  if (c.lead_status === "no_answer") return false;
  if (c.connectivity_status && NOT_CONNECTED.test(c.connectivity_status)) return false;
  if (c.failure_reason && NOT_CONNECTED.test(c.failure_reason) && !(Number(c.duration_seconds) > 0)) return false;
  return Number(c.duration_seconds) > 0;
}
export const isEngaged = (c: LeanCall) => isConnected(c) && Number(c.duration_seconds) >= 30 && (c.caller_turns ?? 0) >= 2;
export const isHot = (c: LeanCall) => c.lead_status === "hot" || c.lead_status === "ready_to_close";
export const isInterested = (c: LeanCall) => isHot(c) || c.lead_status === "warm";
export const isFollowUp = (c: LeanCall) => Boolean(c.follow_up) || c.lead_status === "ready_to_close";

export type Kpis = {
  total: number; dialled: number; received: number; connected: number; dnp: number; connectRate: number;
  engaged: number; interested: number; hot: number; readyToClose: number; warm: number; cold: number;
  notInterested: number; followUps: number; talkSeconds: number; avgTalk: number; leadRate: number;
};

export function kpis(rows: LeanCall[]): Kpis {
  const connected = rows.filter(isConnected);
  const dialled = rows.filter((r) => r.direction === "outbound").length;
  const received = rows.length - dialled;
  const talk = connected.reduce((a, r) => a + Number(r.duration_seconds || 0), 0);
  const interested = rows.filter(isInterested).length;
  const count = (s: LeadStatus) => rows.filter((r) => r.lead_status === s).length;
  return {
    total: rows.length, dialled, received,
    connected: connected.length,
    dnp: rows.filter((r) => r.direction === "outbound" && !isConnected(r)).length,
    connectRate: rows.length ? pct(connected.length, rows.length) : 0,
    engaged: rows.filter(isEngaged).length,
    interested, hot: rows.filter(isHot).length, readyToClose: count("ready_to_close"),
    warm: count("warm"), cold: count("cold"), notInterested: count("not_interested"),
    followUps: rows.filter(isFollowUp).length,
    talkSeconds: Math.round(talk), avgTalk: connected.length ? Math.round(talk / connected.length) : 0,
    leadRate: connected.length ? pct(interested, connected.length) : 0,
  };
}
const pct = (a: number, b: number) => Math.round((a / b) * 1000) / 10;

/* ── Time ranges (IST) ── */
export type RangeKey = "today" | "yesterday" | "day_before" | "7d" | "30d" | "custom";
export type Range = { key: RangeKey; from: string; to: string; label: string; days: number };

function istMidnight(msUtc: number): number {
  const ist = msUtc + TZ_OFFSET_MS;
  return ist - (ist % 86400000) - TZ_OFFSET_MS;
}
export function resolveRange(key: string, fromDate?: string | null, toDate?: string | null, now = Date.now()): Range {
  const today0 = istMidnight(now);
  const D = 86400000;
  const mk = (k: RangeKey, from: number, to: number, label: string): Range => ({ key: k, from: new Date(from).toISOString(), to: new Date(to).toISOString(), label, days: Math.max(1, Math.round((to - from) / D)) });
  switch (key) {
    case "yesterday": return mk("yesterday", today0 - D, today0, "Yesterday");
    case "day_before": return mk("day_before", today0 - 2 * D, today0 - D, "Day before yesterday");
    case "7d": return mk("7d", today0 - 6 * D, today0 + D, "Last 7 days");
    case "30d": return mk("30d", today0 - 29 * D, today0 + D, "Last 30 days");
    case "custom": {
      const f = fromDate ? Date.parse(`${fromDate}T00:00:00+05:30`) : NaN;
      const t = toDate ? Date.parse(`${toDate}T00:00:00+05:30`) + D : NaN;
      if (!isNaN(f) && !isNaN(t) && t > f && t - f <= 92 * D) return mk("custom", f, t, `${fromDate} → ${toDate}`);
      return mk("today", today0, today0 + D, "Today");
    }
    default: return mk("today", today0, today0 + D, "Today");
  }
}
/** The comparison window. For "today" it's yesterday up to this same clock time, so a
 *  half-finished day isn't compared against a full one. Otherwise the equal-length window before. */
export function previousRange(r: Range, now = Date.now()): Range {
  const D = 86400000;
  const from = Date.parse(r.from), to = Date.parse(r.to);
  if (r.key === "today") return { ...r, from: new Date(from - D).toISOString(), to: new Date(Math.min(now, to) - D).toISOString(), label: "yesterday by this time" };
  const len = to - from;
  const label = r.days === 1 ? "the day before" : `the previous ${r.days} days`;
  return { ...r, from: new Date(from - len).toISOString(), to: r.from, label };
}

/* ── Breakdowns ── */
export function hourly(rows: LeanCall[]) {
  const h = Array.from({ length: 24 }, (_, i) => ({ hour: i, inbound: 0, outbound: 0, connected: 0 }));
  for (const r of rows) {
    const hr = new Date(Date.parse(r.created_at) + TZ_OFFSET_MS).getUTCHours();
    h[hr][r.direction === "outbound" ? "outbound" : "inbound"]++;
    if (isConnected(r)) h[hr].connected++;
  }
  return h;
}

export function daily(rows: LeanCall[], fromIso: string, toIso: string) {
  const D = 86400000;
  const out: { date: string; inbound: number; outbound: number; connected: number; hot: number }[] = [];
  const start = Date.parse(fromIso);
  const n = Math.max(1, Math.round((Date.parse(toIso) - start) / D));
  for (let i = 0; i < n; i++) out.push({ date: new Date(start + i * D + TZ_OFFSET_MS).toISOString().slice(0, 10), inbound: 0, outbound: 0, connected: 0, hot: 0 });
  for (const r of rows) {
    const i = Math.floor((Date.parse(r.created_at) - start) / D);
    if (i < 0 || i >= n) continue;
    out[i][r.direction === "outbound" ? "outbound" : "inbound"]++;
    if (isConnected(r)) out[i].connected++;
    if (isHot(r)) out[i].hot++;
  }
  return out;
}

export function notConnectedReasons(rows: LeanCall[]) {
  const m = new Map<string, number>();
  for (const r of rows) {
    if (isConnected(r)) continue;
    const raw = (r.failure_reason || r.connectivity_status || "unknown").toLowerCase();
    const k = /busy/.test(raw) ? "Busy" : /no_answer|no answer|timeout/.test(raw) ? "No answer" : /voicemail/.test(raw) ? "Voicemail" : /reject/.test(raw) ? "Rejected" : /dial_failed|failed|unreachable/.test(raw) ? "Dial failed" : "Other";
    m.set(k, (m.get(k) || 0) + 1);
  }
  return Array.from(m, ([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
}

export function campaignBreakdown(rows: LeanCall[], campaigns: CampaignRow[]) {
  const byBatch = new Map(campaigns.filter((c) => c.cartesia_batch_id).map((c) => [c.cartesia_batch_id!, c]));
  const groups = new Map<string, LeanCall[]>();
  for (const r of rows) {
    if (r.direction !== "outbound") continue;
    const key = r.campaign_id || "__instant__";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  return Array.from(groups, ([key, list]) => {
    const k = kpis(list);
    const meta = byBatch.get(key);
    return {
      id: key,
      name: key === "__instant__" ? "Instant / one-off calls" : meta?.name || `Campaign ${key.slice(-6)}`,
      status: meta?.status ?? (key === "__instant__" ? "—" : "running"),
      totalContacts: meta?.total_contacts ?? null,
      dialled: k.dialled, connected: k.connected, dnp: k.dnp, connectRate: k.connectRate,
      hot: k.hot, warm: k.warm, followUps: k.followUps, notInterested: k.notInterested,
      talkSeconds: k.talkSeconds, lastCallAt: list[0]?.created_at ?? null,
    };
  }).sort((a, b) => (b.lastCallAt || "").localeCompare(a.lastCallAt || ""));
}

export const LEAD_MIX_ORDER: LeadStatus[] = ["ready_to_close", "hot", "warm", "cold", "not_interested", "no_answer", "new"];
export function leadMix(rows: LeanCall[]) {
  return LEAD_MIX_ORDER.map((s) => ({ status: s, count: rows.filter((r) => r.lead_status === s).length }));
}
