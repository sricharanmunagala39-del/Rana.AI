// LeadFlow (outbound email + WhatsApp engine) for RANA HQ. Server only: reads the leadflow_* tables with the
// service key and talks to the leadflow-engine Edge Function. Anything that sends a message or changes sequence
// state goes through engine(); plain settings edits and read receipts write the tables directly.
import { sb, sbAll, inList } from "./db";

export type SendMode = "dry-run" | "resend";
export type WaMode = "dry-run" | "live";
export type EnrollmentStatus = "active" | "replied" | "demo_booked" | "disqualified" | "unsubscribed" | "bounced" | "stopped" | "error";
export type ConvoMode = "agent" | "human" | "closed";
export type ConvoStage = "new" | "demo_booked" | "buying" | "not_interested" | "opted_out";

export type Campaign = { id: number; name: string; status: "active" | "paused"; sender_name: string | null; sender_email: string | null; reply_to: string | null; booking_link: string | null; created_at: string };
export type Lead = {
  id: number; name: string | null; company: string | null; email: string | null; phone: string | null; wa_number: string | null;
  country: string | null; city: string | null; industry: string | null; source: string | null; status: string | null; notes: string | null;
  why_rana: string | null; p_subject: string | null; p_body: string | null; wa_line: string | null; email_status: string | null;
  unsubscribed: boolean | null; crm_deal_id: string | null; created_at: string; updated_at?: string | null;
};
export type Enrollment = { id: number; campaign_id: number; lead_id: number; status: EnrollmentStatus; current_step: number | null; next_send_at: string | null; created_at: string };
export type Outbox = {
  id: number; lead_id: number | null; enrollment_id: number | null; channel: "email" | "whatsapp" | "owner"; to_addr: string | null;
  subject: string | null; body: string | null; status: "sent" | "dry-run" | "failed"; note: string | null; provider_id: string | null;
  event: string | null; step_no: number | null; created_at: string;
};
export type Reply = { id: number; lead_id: number | null; enrollment_id: number | null; channel: string; body: string | null; classification: string | null; summary: string | null; draft: string | null; status: "pending_owner" | "sent" | "dismissed"; created_at: string };
export type WaMessage = { id: number; direction: "in" | "out"; wa_number: string; lead_id: number | null; body: string | null; status: string | null; sent_by: "agent" | "you" | "template" | null; unread: boolean | null; created_at: string };
export type WaConvo = { number: string; lead_id: number | null; mode: ConvoMode; stage: ConvoStage; origin: "inbound" | "outbound" | null; contact_name: string | null; contact_email: string | null; booked_at: string | null; crm_deal_id: string | null; updated_at: string | null };
export type Activity = { id: number; lead_id: number; kind: string; text: string; created_at: string };
export type Run = { id: number; job: string; ok: boolean; detail: any; ran_at: string };

/** Settings the HQ page may edit directly. Mode switches (send_mode, wa_mode, live_since) only change through the engine. */
export const EDITABLE_SETTINGS = ["daily_cap", "ramp", "send_start", "owner_email", "wa_cap", "wa_agent", "wa_agent_name", "wa_payment_link", "cal_url", "sheet_url"] as const;
export type EditableSetting = (typeof EDITABLE_SETTINGS)[number];
export type Settings = Record<string, string>;

export const ENROLLMENT_STATUSES: { key: EnrollmentStatus; label: string }[] = [
  { key: "active", label: "In sequence" }, { key: "replied", label: "Replied" }, { key: "demo_booked", label: "Demo booked" },
  { key: "disqualified", label: "Disqualified" }, { key: "unsubscribed", label: "Unsubscribed" }, { key: "bounced", label: "Bounced" },
  { key: "stopped", label: "Stopped" }, { key: "error", label: "Error" },
];

export const isId = (v: string | number) => /^\d{1,18}$/.test(String(v));
export const isWaNumber = (v: string) => /^\+?\d{6,20}$/.test(v);

/** Start of today in India (the engine's sending day is Mon–Fri 10:00–18:00 IST). */
export function istDayStart(now = Date.now()): string {
  const IST = 330 * 60_000;
  const d = new Date(now + IST); d.setUTCHours(0, 0, 0, 0);
  return new Date(d.getTime() - IST).toISOString();
}

export async function getSettings(): Promise<Settings> {
  const rows = (await sb<{ key: string; value: string }[]>(`/leadflow_settings?select=key,value`).catch(() => [])) || [];
  return Object.fromEntries(rows.map((r) => [r.key, r.value ?? ""]));
}

export async function saveSettings(patch: Partial<Record<EditableSetting, string>>): Promise<void> {
  const now = new Date().toISOString();
  const rows = Object.entries(patch).filter(([k]) => (EDITABLE_SETTINGS as readonly string[]).includes(k)).map(([key, value]) => ({ key, value: String(value ?? ""), updated_at: now }));
  if (!rows.length) return;
  await sb(`/leadflow_settings?on_conflict=key`, { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: JSON.stringify(rows) });
}

export const getCampaigns = () => sb<Campaign[]>(`/leadflow_campaigns?order=id.asc`).then((r) => r || []);

export async function leadsByIds(ids: (number | null | undefined)[]): Promise<Map<number, Lead>> {
  const uniq = Array.from(new Set(ids.filter((x): x is number => typeof x === "number")));
  const out = new Map<number, Lead>();
  for (let i = 0; i < uniq.length; i += 200) {
    const part = uniq.slice(i, i + 200).map(String);
    const rows = (await sb<Lead[]>(`/leadflow_leads?id=in.${inList(part)}&select=id,name,company,email,phone,wa_number,city,country,industry,status,crm_deal_id,created_at`)) || [];
    rows.forEach((l) => out.set(l.id, l));
  }
  return out;
}

/** Latest run of each engine job (tick, sheet_sync, …). */
export async function engineHealth(): Promise<Run[]> {
  const runs = (await sb<Run[]>(`/leadflow_runs?order=ran_at.desc&limit=100`).catch(() => [])) || [];
  const seen = new Set<string>();
  return runs.filter((r) => (seen.has(r.job) ? false : (seen.add(r.job), true)));
}

/** Overview numbers for /hq/outbound. */
export async function overview() {
  const since = istDayStart();
  const [s, enr, today, pending, unread, health] = await Promise.all([
    getSettings(),
    sbAll<{ status: EnrollmentStatus }>(`/leadflow_enrollments?select=status&order=id.asc`).catch(() => []),
    sbAll<{ channel: string; status: string }>(`/leadflow_outbox?created_at=gte.${encodeURIComponent(since)}&select=channel,status&order=id.asc`).catch(() => []),
    sb<{ id: number }[]>(`/leadflow_replies?status=eq.pending_owner&select=id&limit=1000`).catch(() => []),
    sb<{ wa_number: string }[]>(`/leadflow_wa_messages?unread=eq.true&direction=eq.in&select=wa_number&limit=5000`).catch(() => []),
    engineHealth(),
  ]);
  const byStatus: Record<string, number> = {};
  enr.forEach((e) => { byStatus[e.status] = (byStatus[e.status] || 0) + 1; });
  const tally = (ch: string) => ({
    sent: today.filter((o) => o.channel === ch && o.status === "sent").length,
    dryRun: today.filter((o) => o.channel === ch && o.status === "dry-run").length,
    failed: today.filter((o) => o.channel === ch && o.status === "failed").length,
  });
  return {
    settings: s,
    emailLive: s.send_mode === "resend", waLive: s.wa_mode === "live",
    enrollments: byStatus, totalEnrolled: enr.length,
    email: { ...tally("email"), cap: Number(s.daily_cap) || 0 },
    whatsapp: { ...tally("whatsapp"), cap: Number(s.wa_cap) || 0 },
    pendingReplies: (pending || []).length,
    unreadMessages: (unread || []).length,
    unreadChats: new Set((unread || []).map((m) => m.wa_number)).size,
    health,
  };
}

/** Sequence tracker: each enrollment with the date of each step (0 = WhatsApp intro, 1–5 = sequence). */
export async function sequence() {
  const [enr, campaigns] = await Promise.all([
    sbAll<Enrollment>(`/leadflow_enrollments?order=created_at.desc`, 5000).catch(() => [] as Enrollment[]),
    getCampaigns().catch(() => [] as Campaign[]),
  ]);
  const out = await sbAll<Pick<Outbox, "lead_id" | "enrollment_id" | "step_no" | "status" | "created_at">>(
    `/leadflow_outbox?step_no=not.is.null&status=in.(sent,dry-run)&channel=in.(email,whatsapp)&select=lead_id,enrollment_id,step_no,status,created_at&order=created_at.asc`, 50_000).catch(() => []);
  const byEnr = new Map<number, Record<number, { at: string; dry: boolean }>>();
  const byLead = new Map<number, Record<number, { at: string; dry: boolean }>>();
  for (const o of out) {
    const map = o.enrollment_id != null ? byEnr : o.lead_id != null ? byLead : null;
    const key = (o.enrollment_id ?? o.lead_id) as number;
    if (!map || o.step_no == null) continue;
    const steps = map.get(key) || {};
    if (!steps[o.step_no]) steps[o.step_no] = { at: o.created_at, dry: o.status === "dry-run" };
    map.set(key, steps);
  }
  const leads = await leadsByIds(enr.map((e) => e.lead_id));
  const camp = new Map(campaigns.map((c) => [c.id, c.name]));
  return enr.map((e) => {
    const l = leads.get(e.lead_id);
    return {
      id: e.id, leadId: e.lead_id, name: l?.name || null, company: l?.company || null, campaign: camp.get(e.campaign_id) || null,
      status: e.status, currentStep: e.current_step, nextSendAt: e.next_send_at, createdAt: e.created_at,
      steps: { ...(byLead.get(e.lead_id) || {}), ...(byEnr.get(e.id) || {}) },
    };
  });
}

/** WhatsApp inbox: one row per number, unread first, then most recent. */
export async function waConversations() {
  const [msgs, convos] = await Promise.all([
    sb<WaMessage[]>(`/leadflow_wa_messages?select=id,direction,wa_number,lead_id,body,sent_by,unread,created_at&order=created_at.desc&limit=5000`).catch(() => [] as WaMessage[]),
    sb<WaConvo[]>(`/leadflow_wa_convos?limit=5000`).catch(() => [] as WaConvo[]),
  ]);
  const cv = new Map((convos || []).map((c) => [c.number, c]));
  const rows = new Map<string, { number: string; last: WaMessage; unread: number; lastInboundAt: string | null; leadId: number | null }>();
  for (const m of msgs || []) {
    let r = rows.get(m.wa_number);
    if (!r) { r = { number: m.wa_number, last: m, unread: 0, lastInboundAt: null, leadId: m.lead_id }; rows.set(m.wa_number, r); }
    if (m.direction === "in" && m.unread) r.unread++;
    if (m.direction === "in" && !r.lastInboundAt) r.lastInboundAt = m.created_at;
    if (!r.leadId && m.lead_id) r.leadId = m.lead_id;
  }
  // Conversations with no messages yet (e.g. a template still queued) still show.
  for (const c of convos || []) if (!rows.has(c.number)) rows.set(c.number, { number: c.number, last: null as any, unread: 0, lastInboundAt: null, leadId: c.lead_id });
  const list = Array.from(rows.values());
  const leads = await leadsByIds(list.map((r) => r.leadId ?? cv.get(r.number)?.lead_id));
  return list
    .map((r) => {
      const c = cv.get(r.number); const l = leads.get((r.leadId ?? c?.lead_id) as number);
      return {
        number: r.number, leadId: r.leadId ?? c?.lead_id ?? null, name: l?.name || c?.contact_name || null, company: l?.company || null,
        mode: c?.mode || "agent", stage: c?.stage || "new", origin: c?.origin || null, unread: r.unread, lastInboundAt: r.lastInboundAt,
        lastAt: r.last?.created_at || c?.updated_at || null, lastBody: r.last?.body || "", lastDirection: r.last?.direction || null, lastBy: r.last?.sent_by || null,
      };
    })
    .sort((a, b) => (b.unread ? 1 : 0) - (a.unread ? 1 : 0) || Date.parse(b.lastAt || "0") - Date.parse(a.lastAt || "0"));
}

/** One WhatsApp thread. Opening it marks the inbound messages read. */
export async function waThread(number: string, markRead = true) {
  const n = encodeURIComponent(number);
  const [msgs, convo] = await Promise.all([
    sb<WaMessage[]>(`/leadflow_wa_messages?wa_number=eq.${n}&order=created_at.desc&limit=500`).then((r) => (r || []).reverse()),
    sb<WaConvo[]>(`/leadflow_wa_convos?number=eq.${n}&limit=1`).then((r) => r?.[0] || null).catch(() => null),
  ]);
  const leadId = convo?.lead_id ?? msgs.find((m) => m.lead_id)?.lead_id ?? null;
  const lead = leadId ? (await sb<Lead[]>(`/leadflow_leads?id=eq.${leadId}&limit=1`).catch(() => []))?.[0] || null : null;
  if (markRead && msgs.some((m) => m.direction === "in" && m.unread))
    await sb(`/leadflow_wa_messages?wa_number=eq.${n}&direction=eq.in&unread=eq.true`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ unread: false }) }).catch(() => {});
  const lastIn = [...msgs].reverse().find((m) => m.direction === "in");
  return {
    number, convo, lead, messages: msgs.map((m) => ({ ...m, unread: false })),
    lastInboundAt: lastIn?.created_at || null,
    canReply: !!lastIn && Date.now() - Date.parse(lastIn.created_at) < 24 * 3600_000,
  };
}

export async function pendingReplies() {
  const rows = (await sb<Reply[]>(`/leadflow_replies?status=eq.pending_owner&order=created_at.desc&limit=500`).catch(() => [])) || [];
  const leads = await leadsByIds(rows.map((r) => r.lead_id));
  return rows.map((r) => ({ ...r, lead: r.lead_id ? leads.get(r.lead_id) || null : null }));
}

export async function leadDetail(id: number) {
  const [lead] = (await sb<Lead[]>(`/leadflow_leads?id=eq.${id}&limit=1`)) || [];
  if (!lead) return null;
  const [activities, enrollments, outbox, replies, campaigns] = await Promise.all([
    sb<Activity[]>(`/leadflow_activities?lead_id=eq.${id}&order=created_at.desc&limit=300`).catch(() => []),
    sb<Enrollment[]>(`/leadflow_enrollments?lead_id=eq.${id}&order=created_at.desc`).catch(() => []),
    sb<Outbox[]>(`/leadflow_outbox?lead_id=eq.${id}&order=created_at.desc&limit=100`).catch(() => []),
    sb<Reply[]>(`/leadflow_replies?lead_id=eq.${id}&order=created_at.desc&limit=50`).catch(() => []),
    getCampaigns().catch(() => []),
  ]);
  const camp = new Map((campaigns || []).map((c) => [c.id, c.name]));
  return { lead, activities: activities || [], outbox: outbox || [], replies: replies || [], enrollments: (enrollments || []).map((e) => ({ ...e, campaign: camp.get(e.campaign_id) || null })) };
}

// ---- Engine (Supabase Edge Function) ----

export type EngineAction =
  | { action: "wa_reply"; number: string; text: string }
  | { action: "wa_mode"; number: string; mode: ConvoMode }
  | { action: "approve_reply"; reply_id: number; body: string }
  | { action: "dismiss_reply"; reply_id: number }
  | { action: "test_email" }
  | { action: "test_whatsapp"; to: string }
  | { action: "go_live"; channel: "email" | "whatsapp"; confirm: "GO LIVE" }
  | { action: "dry_run"; channel: "email" | "whatsapp" }
  | { action: "tick" }
  | { action: "sheet_sync" };

export type EngineResult = { ok: true; data: any } | { ok: false; error: string; status: number };

export async function engine(body: EngineAction): Promise<EngineResult> {
  const base = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
  if (!base || !key) return { ok: false, error: "LeadFlow engine isn't configured on this server.", status: 500 };
  let res: Response;
  try {
    res = await fetch(`${base.replace(/\/$/, "")}/functions/v1/leadflow-engine`, {
      method: "POST", cache: "no-store",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(55_000),
    });
  } catch (e: any) {
    return { ok: false, error: `Couldn't reach the LeadFlow engine (${e?.name === "TimeoutError" ? "timed out" : e?.message || "network error"}).`, status: 502 };
  }
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text.slice(0, 300) }; }
  if (!res.ok || data?.ok === false || data?.error) {
    const msg = data?.error || data?.message || (res.status === 404 ? "the leadflow-engine function isn't deployed yet" : `HTTP ${res.status}`);
    return { ok: false, error: `LeadFlow engine: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`, status: res.ok ? 400 : res.status >= 500 ? 502 : res.status };
  }
  return { ok: true, data };
}
