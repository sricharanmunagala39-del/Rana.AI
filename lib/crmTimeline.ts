// RANA HQ → Sales CRM: one timeline per lead. Pulls every touchpoint we already store, matched by
// the deal link (crm_deal_id) or by the lead's phone / email:
//   team notes (crm_activities) · AI calls on RANA's own line (calls) · WhatsApp (leadflow_wa_messages)
//   · outbound emails and replies (leadflow_outbox / leadflow_replies) · Instagram / Messenger DMs (meta_messages).
// Tasks appear through the team notes they write ("Task: …", "Task done: …").
// Read-only; nothing here writes.
import { sb, inList } from "./db";
import { hqClientId, last10 } from "./crm";

export type TimelineItem = {
  id: string; at: string; kind: string; channel: "team" | "call" | "whatsapp" | "email" | "instagram" | "messenger" | "task";
  direction?: "in" | "out"; title: string; text: string; by?: string | null; link?: string | null; extra?: Record<string, any>;
};

const enc = encodeURIComponent;
const safe = async <T>(p: Promise<T>, fallback: T): Promise<T> => { try { return (await p) ?? fallback; } catch { return fallback; } };
const short = (s: any, n = 600) => { const t = String(s ?? "").trim(); return t.length > n ? `${t.slice(0, n)}…` : t; };
const mins = (s: any) => { const n = Math.round(Number(s) || 0); return n >= 60 ? `${Math.floor(n / 60)}m ${n % 60}s` : `${n}s`; };

/** Plain-text transcript summary when a call has no written summary. */
function transcriptText(t: any): string {
  if (!Array.isArray(t)) return "";
  return t.slice(0, 6).map((x: any) => `${x.role === "agent" || x.speaker === "agent" ? "Agent" : "Caller"}: ${x.text || x.content || ""}`).join("\n");
}

export async function dealTimeline(deal: any): Promise<TimelineItem[]> {
  const id = deal.id as string;
  const p10 = last10(deal.phone);
  const email = String(deal.email || "").toLowerCase();
  const hq = await hqClientId();

  // LeadFlow leads that are this deal (by link, phone or email) → their WhatsApp numbers, emails and ids.
  const lfOr = [`crm_deal_id.eq.${id}`, p10 && `phone.like.*${p10}`, p10 && `wa_number.like.*${p10}`, email && `email.eq."${email.replace(/"/g, "")}"`].filter(Boolean).join(",");
  const [lfLeads, convos, threads] = await Promise.all([
    safe(sb<any[]>(`/leadflow_leads?or=(${enc(lfOr)})&select=id,wa_number,phone&limit=20`), []),
    safe(sb<any[]>(`/leadflow_wa_convos?or=(${enc([`crm_deal_id.eq.${id}`, p10 && `number.like.*${p10}`].filter(Boolean).join(","))})&select=number&limit=10`), []),
    safe(sb<any[]>(`/meta_threads?crm_deal_id=eq.${id}&select=id,platform,username,name&limit=10`), []),
  ]);
  const leadIds = lfLeads.map((l) => String(l.id));
  const waNumbers = Array.from(new Set([...convos.map((c) => c.number), ...lfLeads.map((l) => l.wa_number)].filter(Boolean).map(String)));

  // Tasks are not repeated here: adding / finishing one already writes a team note ("Task: …", "Task done: …").
  const [acts, calls, wa, outbox, replies, metaMsgs] = await Promise.all([
    safe(sb<any[]>(`/crm_activities?deal_id=eq.${id}&order=created_at.desc&limit=200`), []),
    hq && p10 ? safe(sb<any[]>(`/calls?client_id=eq.${hq}&caller_phone=like.*${p10}&order=created_at.desc&limit=50&select=id,direction,created_at,started_at,duration_seconds,lead_status,lead_reason,summary,recording_url,transcript`), []) : Promise.resolve([] as any[]),
    waNumbers.length || leadIds.length
      ? safe(sb<any[]>(`/leadflow_wa_messages?or=(${enc([waNumbers.length && `wa_number.in.${inList(waNumbers)}`, leadIds.length && `lead_id.in.(${leadIds.join(",")})`].filter(Boolean).join(","))})&order=created_at.desc&limit=150&select=id,direction,body,sent_by,status,created_at`), [])
      : Promise.resolve([] as any[]),
    leadIds.length ? safe(sb<any[]>(`/leadflow_outbox?lead_id=in.(${leadIds.join(",")})&order=created_at.desc&limit=60&select=id,channel,to_addr,subject,body,status,event,step_no,created_at`), []) : Promise.resolve([] as any[]),
    leadIds.length ? safe(sb<any[]>(`/leadflow_replies?lead_id=in.(${leadIds.join(",")})&order=created_at.desc&limit=40&select=id,channel,body,classification,summary,created_at`), []) : Promise.resolve([] as any[]),
    threads.length ? safe(sb<any[]>(`/meta_messages?thread_id=in.(${threads.map((t) => t.id).join(",")})&order=created_at.desc&limit=150&select=id,thread_id,direction,text,sent_by,status,created_at`), []) : Promise.resolve([] as any[]),
  ]);

  const items: TimelineItem[] = [];
  for (const a of acts) items.push({ id: `a${a.id}`, at: a.created_at, kind: a.kind, channel: "team", title: a.kind, text: a.text, by: a.created_by });
  for (const c of calls) {
    const status = c.lead_status ? ` · ${String(c.lead_status).replace(/_/g, " ")}` : "";
    items.push({
      id: `c${c.id}`, at: c.started_at || c.created_at, kind: "ai_call", channel: "call", direction: c.direction === "outbound" ? "out" : "in",
      title: `AI call ${c.direction === "outbound" ? "out" : "in"} · ${mins(c.duration_seconds)}${status}`,
      text: short(c.summary || c.lead_reason || transcriptText(c.transcript) || "No summary"), link: c.recording_url || null, extra: { leadStatus: c.lead_status },
    });
  }
  for (const m of wa) items.push({ id: `w${m.id}`, at: m.created_at, kind: "whatsapp", channel: "whatsapp", direction: m.direction === "in" ? "in" : "out", title: m.direction === "in" ? "WhatsApp from lead" : `WhatsApp sent${m.sent_by ? ` (${m.sent_by === "agent" ? "AI agent" : m.sent_by === "you" ? "team" : m.sent_by})` : ""}`, text: short(m.body), extra: { status: m.status } });
  for (const o of outbox) items.push({ id: `o${o.id}`, at: o.created_at, kind: "email_out", channel: o.channel === "whatsapp" ? "whatsapp" : "email", direction: "out", title: `${o.channel === "whatsapp" ? "WhatsApp" : "Email"} step ${o.step_no ?? ""} · ${o.event || o.status}`.trim(), text: short([o.subject, o.body].filter(Boolean).join("\n\n"), 500) });
  for (const r of replies) items.push({ id: `r${r.id}`, at: r.created_at, kind: "email_reply", channel: r.channel === "whatsapp" ? "whatsapp" : "email", direction: "in", title: `Reply${r.classification ? ` · ${r.classification}` : ""}`, text: short(r.summary || r.body) });
  const tName = Object.fromEntries(threads.map((t) => [t.id, t]));
  for (const m of metaMsgs) {
    const t = tName[m.thread_id]; const ch = t?.platform === "messenger" ? "messenger" : "instagram";
    items.push({ id: `m${m.id}`, at: m.created_at, kind: `${ch}_${m.direction}`, channel: ch, direction: m.direction, title: `${ch === "instagram" ? "Instagram" : "Messenger"} ${m.direction === "in" ? `from ${t?.username ? `@${t.username}` : t?.name || "lead"}` : `reply (${m.sent_by === "human" ? "team" : m.sent_by === "rule" ? "auto-reply" : m.sent_by === "agent" ? "AI" : m.sent_by})`}`, text: short(m.text), extra: { status: m.status } });
  }

  return items.filter((i) => i.at).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 400);
}
