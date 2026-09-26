// Reports: the client picks dates, calls, leads and columns; RANA returns live stats and an Excel file.
import { sb, sbAll } from "./db";
import { isConnected, isHot } from "./metrics";
import { LEAD_LABEL } from "./format";
import { buildXlsx, type Cell, type Sheet } from "./xlsx";

const DAY = 86400e3;
const IST = 5.5 * 3600e3;

export type LeadKey = "ready_to_close" | "hot" | "warm" | "new" | "cold" | "not_interested" | "no_answer" | "follow_up" | "needs_person";
export const LEAD_CHOICES: { key: LeadKey; label: string }[] = [
  { key: "ready_to_close", label: "Ready to close" }, { key: "hot", label: "Hot" }, { key: "warm", label: "Warm" },
  { key: "new", label: "New / unclear" }, { key: "cold", label: "Cold" }, { key: "not_interested", label: "Not interested" },
  { key: "no_answer", label: "No answer" }, { key: "follow_up", label: "Follow-up needed" }, { key: "needs_person", label: "Needs a person" },
];

export type ReportFilter = {
  from: string; to: string;                   // YYYY-MM-DD, India time, inclusive
  direction: "all" | "outbound" | "inbound";
  campaign: string;                          // "all" or a campaign id
  leads: LeadKey[];                          // empty = every call
  connected: "all" | "connected" | "not_connected";
  columns: string[];
};

type Col = { key: string; label: string; width: number; wrap?: boolean; get: (c: any, x: Ctx) => Cell };
type Ctx = { campaignName: Map<string, string>; contact: Map<string, any> };

const istTime = (t: string) => new Date(Date.parse(t) + IST).toISOString().slice(0, 16).replace("T", " ");
const result = (c: any) => {
  if (isConnected(c)) return "Connected";
  const raw = String(c.failure_reason || c.connectivity_status || "").toLowerCase();
  return /busy/.test(raw) ? "Busy" : /no_answer|no answer|timeout/.test(raw) ? "No answer" : /voicemail/.test(raw) ? "Voicemail" : /reject/.test(raw) ? "Rejected" : /dial_failed|failed|unreachable/.test(raw) ? "Dial failed" : "Not connected";
};
const contactOf = (c: any, x: Ctx) => x.contact.get(`${c.campaign_id}|${c.caller_phone}`) || null;
const transcriptText = (t: any) => (Array.isArray(t) ? t : []).map((x: any) => `${x.role === "user" ? "Customer" : "RANA"}: ${String(x.text || "").trim()}`).filter((l: string) => l.length > 8).join("\n");

export const COLUMNS: Col[] = [
  { key: "when", label: "Date & time (IST)", width: 18, get: (c) => istTime(c.started_at || c.created_at) },
  { key: "direction", label: "Direction", width: 10, get: (c) => (c.direction === "outbound" ? "Outbound" : "Inbound") },
  { key: "campaign", label: "Campaign", width: 22, get: (c, x) => (c.campaign_id ? x.campaignName.get(c.campaign_id) || "Campaign" : c.direction === "outbound" ? "Single call" : "") },
  { key: "name", label: "Name", width: 20, get: (c, x) => c.caller_name || contactOf(c, x)?.name || "" },
  { key: "phone", label: "Phone", width: 16, get: (c) => c.caller_phone || "" },
  { key: "connected", label: "Connected", width: 10, get: (c) => (isConnected(c) ? "Yes" : "No") },
  { key: "result", label: "Call result", width: 14, get: (c) => result(c) },
  { key: "talk", label: "Talk time (sec)", width: 12, get: (c) => Math.round(Number(c.duration_seconds) || 0) },
  { key: "talk_min", label: "Talk time (min)", width: 12, get: (c) => Math.round((Number(c.duration_seconds) || 0) / 6) / 10 },
  { key: "lead", label: "Lead", width: 14, get: (c) => (LEAD_LABEL as any)[c.lead_status] || c.lead_status || "" },
  { key: "why", label: "Why (lead reason)", width: 40, wrap: true, get: (c) => c.lead_reason || "" },
  { key: "summary", label: "Summary", width: 60, wrap: true, get: (c) => c.summary || "" },
  { key: "follow_up", label: "Follow-up needed", width: 12, get: (c) => (c.follow_up || c.handoff || c.lead_status === "ready_to_close" ? "Yes" : "No") },
  { key: "needs_person", label: "Needs a person", width: 26, wrap: true, get: (c) => (c.handoff ? `${c.handoff.label || "Yes"}${c.handoff.to_name ? ` → ${c.handoff.to_name}` : ""}` : "") },
  { key: "notes", label: "Team notes", width: 30, wrap: true, get: (c) => c.notes || "" },
  { key: "recording", label: "Recording", width: 12, get: (c) => (c.recording_url ? { link: c.recording_url, text: "Listen" } : "") },
  { key: "transcript", label: "Transcript", width: 80, wrap: true, get: (c) => transcriptText(c.transcript) },
];
export const DEFAULT_COLUMNS = ["when", "direction", "campaign", "name", "phone", "connected", "talk", "lead", "why", "summary", "follow_up", "needs_person", "recording"];

export function normalizeFilter(q: any): ReportFilter {
  const today = new Date(Date.now() + IST).toISOString().slice(0, 10);
  const d = (s: any, dflt: string) => (/^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) ? String(s) : dflt);
  let from = d(q.from, new Date(Date.now() + IST - 6 * DAY).toISOString().slice(0, 10));
  let to = d(q.to, today);
  if (from > to) [from, to] = [to, from];
  if (Date.parse(to) - Date.parse(from) > 366 * DAY) from = new Date(Date.parse(to) - 366 * DAY).toISOString().slice(0, 10);
  const list = (v: any) => (Array.isArray(v) ? v : String(v || "").split(",")).map((x: any) => String(x).trim()).filter(Boolean);
  const leads = list(q.leads).filter((k) => LEAD_CHOICES.some((x) => x.key === k)) as LeadKey[];
  const cols = list(q.columns).filter((k) => COLUMNS.some((c) => c.key === k) || /^list:[^,]{1,40}$/.test(k)).slice(0, 60);
  return {
    from, to,
    direction: ["outbound", "inbound"].includes(q.direction) ? q.direction : "all",
    campaign: /^[0-9a-f-]{36}$/i.test(String(q.campaign || "")) ? String(q.campaign) : "all",
    leads, connected: ["connected", "not_connected"].includes(q.connected) ? q.connected : "all",
    columns: cols.length ? cols : DEFAULT_COLUMNS,
  };
}

function leadMatch(c: any, leads: LeadKey[]): boolean {
  if (!leads.length) return true;
  return leads.some((k) => (k === "follow_up" ? !!c.follow_up || !!c.handoff || c.lead_status === "ready_to_close" : k === "needs_person" ? !!c.handoff : c.lead_status === k));
}

/** Everything the Reports page shows, plus what the Excel needs. */
export async function runReport(clientId: string, f: ReportFilter) {
  const start = new Date(Date.parse(`${f.from}T00:00:00+05:30`)).toISOString();
  const end = new Date(Date.parse(`${f.to}T00:00:00+05:30`) + DAY).toISOString();
  const campaigns = (await sb<any[]>(`/campaigns?client_id=eq.${clientId}&select=id,name,cartesia_batch_id,created_at&order=created_at.desc&limit=500`).catch(() => [])) || [];
  const batch = f.campaign !== "all" ? campaigns.find((c) => c.id === f.campaign)?.cartesia_batch_id || "__none__" : null;
  const dir = f.direction !== "all" ? `&direction=eq.${f.direction}` : "";
  const camp = batch ? `&campaign_id=eq.${encodeURIComponent(batch)}` : "";
  const cols = "id,direction,source,campaign_id,caller_name,caller_phone,duration_seconds,connectivity_status,completion_status,failure_reason,lead_status,lead_reason,follow_up,summary,notes,handoff,recording_url,started_at,created_at,transcript";
  // Practice sessions on the Talk page (source "manual") are not customer calls.
  const all = await sbAll<any>(`/calls?client_id=eq.${clientId}&created_at=gte.${encodeURIComponent(start)}&created_at=lt.${encodeURIComponent(end)}&or=(source.is.null,source.neq.manual)${dir}${camp}&select=${cols}&order=created_at.desc,id.desc`, 50000);
  const rows = all.filter((c) => leadMatch(c, f.leads) && (f.connected === "all" || (f.connected === "connected") === isConnected(c)));

  // The client's own list columns (course, city…) for campaign calls.
  const batches = Array.from(new Set(rows.map((r) => r.campaign_id).filter(Boolean)));
  const campIds = campaigns.filter((c) => batches.includes(c.cartesia_batch_id)).map((c) => c.id);
  const contacts = campIds.length ? await sbAll<any>(`/campaign_contacts?client_id=eq.${clientId}&campaign_id=in.(${campIds.join(",")})&select=campaign_id,phone,name,variables&order=created_at.asc,id.asc`, 100000).catch(() => []) : [];
  const batchOf = new Map(campaigns.map((c) => [c.id, c.cartesia_batch_id]));
  const contact = new Map<string, any>();
  const listVars = new Set<string>();
  for (const ct of contacts) {
    contact.set(`${batchOf.get(ct.campaign_id)}|${ct.phone}`, ct);
    for (const k of Object.keys(ct.variables || {})) if (k && k.length <= 40 && !/^(name|phone|number|mobile)$/i.test(k)) listVars.add(k);
  }
  const ctx: Ctx = { campaignName: new Map(campaigns.filter((c) => c.cartesia_batch_id).map((c) => [c.cartesia_batch_id, c.name || "Campaign"])), contact };

  const connected = rows.filter(isConnected);
  const talk = connected.reduce((a, c) => a + (Number(c.duration_seconds) || 0), 0);
  const byLead: Record<string, number> = {};
  for (const c of rows) byLead[c.lead_status || "new"] = (byLead[c.lead_status || "new"] || 0) + 1;
  const byCampaign = new Map<string, { name: string; calls: number; connected: number; hot: number; warm: number }>();
  for (const c of rows) {
    const name = c.campaign_id ? ctx.campaignName.get(c.campaign_id) || "Campaign" : c.direction === "outbound" ? "Single calls" : "Incoming calls";
    const g = byCampaign.get(name) || { name, calls: 0, connected: 0, hot: 0, warm: 0 };
    g.calls++; if (isConnected(c)) g.connected++; if (isHot(c)) g.hot++; if (c.lead_status === "warm") g.warm++;
    byCampaign.set(name, g);
  }
  const stats = {
    calls: rows.length, connected: connected.length, connectRate: rows.length ? Math.round((connected.length / rows.length) * 100) : 0,
    talkMinutes: Math.round(talk / 60), avgTalkSec: connected.length ? Math.round(talk / connected.length) : 0,
    hot: rows.filter(isHot).length, warm: byLead.warm || 0, followUps: rows.filter((c) => c.follow_up || c.handoff || c.lead_status === "ready_to_close").length,
    needsPerson: rows.filter((c) => c.handoff).length, byLead, byCampaign: Array.from(byCampaign.values()).sort((a, b) => b.calls - a.calls),
  };
  return { rows, stats, ctx, listVars: Array.from(listVars).sort(), campaigns: campaigns.map((c) => ({ id: c.id, name: c.name || "Campaign", created_at: c.created_at })) };
}

export function columnDefs(keys: string[]): Col[] {
  return keys.map((k) => {
    if (k.startsWith("list:")) { const v = k.slice(5); return { key: k, label: v, width: 18, get: (c: any, x: Ctx) => contactOf(c, x)?.variables?.[v] ?? "" } as Col; }
    return COLUMNS.find((c) => c.key === k)!;
  }).filter(Boolean);
}

export function previewRows(rows: any[], ctx: Ctx, keys: string[], n = 8) {
  const defs = columnDefs(keys);
  return { headers: defs.map((d) => d.label), rows: rows.slice(0, n).map((r) => defs.map((d) => { const v = d.get(r, ctx); return typeof v === "object" && v ? (v as any).text || "" : v ?? ""; })) };
}

/** The Excel file: "Calls" (the chosen columns) and "Summary" (totals, leads, campaigns, the filters used). */
export function reportXlsx(rep: Awaited<ReturnType<typeof runReport>>, f: ReportFilter, clientName: string): Uint8Array {
  const defs = columnDefs(f.columns);
  const calls: Sheet = { name: "Calls", columns: defs.map((d) => ({ header: d.label, width: d.width, wrap: d.wrap })), rows: rep.rows.map((r) => defs.map((d) => d.get(r, rep.ctx))) };
  const s = rep.stats;
  const leadRows = Object.entries(s.byLead).sort((a, b) => b[1] - a[1]).map(([k, n]) => [(LEAD_LABEL as any)[k] || k, n] as Cell[]);
  const filters = [
    ["Company", clientName], ["Dates", `${f.from} to ${f.to} (India time)`],
    ["Calls", f.direction === "all" ? "Incoming and outgoing" : f.direction === "outbound" ? "Outgoing only" : "Incoming only"],
    ["Campaign", f.campaign === "all" ? "All" : rep.campaigns.find((c) => c.id === f.campaign)?.name || "—"],
    ["Leads", f.leads.length ? f.leads.map((k) => LEAD_CHOICES.find((x) => x.key === k)?.label || k).join(", ") : "All"],
    ["Connected", f.connected === "all" ? "All" : f.connected === "connected" ? "Connected only" : "Not connected only"],
    ["Made", `${istTime(new Date().toISOString())} IST`],
  ];
  const summary: Sheet = {
    name: "Summary", columns: [{ header: "What", width: 28 }, { header: "Count", width: 14 }, { header: "", width: 12 }, { header: "", width: 12 }, { header: "", width: 12 }],
    rows: [
      ["Calls", s.calls], ["Connected", s.connected], ["Connect rate (%)", s.connectRate], ["Talk time (minutes)", s.talkMinutes],
      ["Average talk time (seconds)", s.avgTalkSec], ["Hot + ready to close", s.hot], ["Warm", s.warm], ["Follow-up needed", s.followUps], ["Needs a person", s.needsPerson],
      [], ["LEADS", null], ...leadRows,
      [], ["BY CAMPAIGN", "Calls", "Connected", "Hot", "Warm"], ...s.byCampaign.map((g) => [g.name, g.calls, g.connected, g.hot, g.warm] as Cell[]),
      [], ["FILTERS USED", null], ...filters as Cell[][],
    ],
  };
  return buildXlsx([calls, summary]);
}
