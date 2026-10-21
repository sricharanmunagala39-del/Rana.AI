// RANA HQ inbox: Instagram + Facebook Messenger DMs and comments, answered by keyword rules or the AI,
// with leads captured into the Sales CRM. Our own ManyChat, built on Meta's official API.
//
// Meta's rules (they apply to every tool, ManyChat included):
//  • A DM can only be sent within 24 hours of the person's last message to us.
//  • A comment gets at most ONE private reply (DM), within 7 days of the comment. After that we wait for them to reply.
//  • No cold DMs.
// Everything below follows those rules; auto-replies are off until switched on in /hq/inbox.
import { sb } from "./db";
import { chatJson } from "./llm";
import { phoneOf, guessIndustry, addActivity } from "./crm";
import { hqEmails } from "./hq";
import { sendEmail, emailHtml, esc, APP_URL } from "./notify";
import { sendDm, sendPrivateReply, replyToComment, profileOf, pageId, igUserId, canSend } from "./meta";

export type Platform = "instagram" | "messenger";
export type InMessage = { platform: Platform; userId: string; ourId: string; mid: string; text: string; attachments: any[] | null; echo: boolean; appId: string | null; at: string };
export type InComment = { platform: "instagram" | "facebook"; commentId: string; postId: string | null; parentId: string | null; fromId: string; fromName: string | null; text: string; at: string; entryId: string | null };
export type Rule = { id: string; name: string; enabled: boolean; trigger: "dm_keyword" | "comment_keyword" | "welcome"; keywords: string[]; match: "contains" | "exact"; platforms: string[]; post_ids: string[]; reply: string; public_reply: string | null; create_lead: boolean; handoff: boolean; priority: number };

const DAY = 86400e3;
export const WINDOW_MS = DAY;          // 24-hour messaging window
export const PRIVATE_REPLY_MS = 7 * DAY; // private reply allowed within 7 days of a comment

/* ───────────── pure helpers (unit-tested) ───────────── */

const iso = (ms: any) => new Date(typeof ms === "number" ? ms : Date.parse(ms) || Date.now()).toISOString();

/** Meta webhook body → our messages and comments. Ignores reads, deliveries, reactions and deleted messages. */
export function parseWebhook(body: any): { messages: InMessage[]; comments: InComment[] } {
  const messages: InMessage[] = []; const comments: InComment[] = [];
  const obj = body?.object;
  if (obj !== "instagram" && obj !== "page") return { messages, comments };
  const platform: Platform = obj === "instagram" ? "instagram" : "messenger";
  for (const entry of body.entry || []) {
    for (const m of entry.messaging || []) {
      const msg = m.message; const pb = m.postback;
      if (!msg && !pb) continue;
      if (msg?.is_deleted || msg?.is_unsupported) continue;
      const echo = !!msg?.is_echo;
      const userId = String(echo ? m.recipient?.id : m.sender?.id || "");
      const ourId = String(echo ? m.sender?.id : m.recipient?.id || entry.id || "");
      const mid = String(msg?.mid || pb?.mid || `${userId}-${m.timestamp}`);
      if (!userId) continue;
      messages.push({ platform, userId, ourId, mid, text: String(msg?.text ?? pb?.title ?? pb?.payload ?? "").slice(0, 4000), attachments: msg?.attachments || null, echo, appId: msg?.app_id != null ? String(msg.app_id) : null, at: iso(m.timestamp) });
    }
    for (const ch of entry.changes || []) {
      const v = ch.value || {};
      if (obj === "instagram" && ch.field === "comments" && v.id && v.from?.id) {
        comments.push({ platform: "instagram", commentId: String(v.id), postId: v.media?.id ? String(v.media.id) : null, parentId: v.parent_id ? String(v.parent_id) : null, fromId: String(v.from.id), fromName: v.from.username || null, text: String(v.text || "").slice(0, 2000), at: iso(Date.now()), entryId: entry.id ? String(entry.id) : null });
      }
      if (obj === "page" && ch.field === "feed" && v.item === "comment" && v.verb === "add" && v.comment_id && v.from?.id) {
        comments.push({ platform: "facebook", commentId: String(v.comment_id), postId: v.post_id ? String(v.post_id) : null, parentId: v.parent_id && v.parent_id !== v.post_id ? String(v.parent_id) : null, fromId: String(v.from.id), fromName: v.from.name || null, text: String(v.message || "").slice(0, 2000), at: iso(v.created_time ? Number(v.created_time) * 1000 : Date.now()), entryId: entry.id ? String(entry.id) : null });
      }
    }
  }
  return { messages, comments };
}

/** Our own comment (the Page / Instagram account itself), or the text of one of our public replies coming back. */
export function isOwnComment(c: InComment, rules: Rule[], ourIds: string[]): boolean {
  if (c.entryId && c.fromId === c.entryId) return true;
  if (ourIds.filter(Boolean).includes(c.fromId)) return true;
  const t = norm(c.text).trim();
  return !!t && rules.some((r) => r.public_reply && norm(r.public_reply).trim() === t);
}
/** An echo sent by a person from the Instagram / Facebook app (not by this system). */
export function isHumanEcho(m: InMessage, ourAppId = process.env.META_APP_ID || ""): boolean {
  if (!m.echo) return false;
  if (ourAppId) return m.appId !== ourAppId;
  return !m.appId;
}
export const norm = (t: string) => ` ${String(t || "").toLowerCase().replace(/[^\p{L}\p{N}₹@+.\s]/gu, " ").replace(/\s+/g, " ").trim()} `;

/** Best matching enabled rule for this trigger, platform and post (lowest priority number wins). */
export function matchRule(rules: Rule[], o: { trigger: Rule["trigger"]; text: string; platform: Platform | "facebook"; postId?: string | null }): Rule | null {
  const t = norm(o.text);
  const plat = o.platform === "facebook" ? "messenger" : o.platform;
  const list = rules.filter((r) => r.enabled && r.trigger === o.trigger && (!r.platforms?.length || r.platforms.includes(plat) || (o.platform === "facebook" && r.platforms.includes("facebook"))) && (!r.post_ids?.length || (o.postId && r.post_ids.includes(o.postId))))
    .sort((a, b) => a.priority - b.priority);
  for (const r of list) {
    if (r.trigger === "welcome") return r;
    const hit = (r.keywords || []).some((k) => { const kw = norm(k); if (kw.trim() === "") return false; return r.match === "exact" ? t === kw : t.includes(kw); });
    if (hit) return r;
  }
  return null;
}

const INTENT = ["price", "pricing", "cost", "charges", "how much", "demo", "trial", "proof run", "buy", "setup", "set up", "start", "interested", "call me", "callback", "call back", "quote", "plan", "entha", "enta", "kitna", "kitne", "rate", "details"];
/** Phone, email and buying words in a message. */
export function extractLead(text: string): { phone: string | null; email: string | null; intent: boolean } {
  const s = String(text || "");
  const pm = s.match(/(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/);
  const em = s.match(/[^\s@]+@[^\s@]+\.[a-z]{2,}/i);
  const t = norm(s);
  return { phone: pm ? phoneOf(pm[0]) : null, email: em ? em[0].toLowerCase() : null, intent: INTENT.some((w) => t.includes(` ${w} `) || t.includes(` ${w}`)) };
}
/** A real opt-out: the whole message is "stop" / "unsubscribe" / "not interested"…, or it asks us not to message. "Stop missing calls?" is not one. */
export const isOptOut = (text: string) => {
  const t = String(text || "").trim();
  return /^(stop|unsubscribe|no thanks|not interested|remove me|block)[\s.!]*$/i.test(t) || /\b(don'?t|do not) (message|text|dm|contact) (me|us)\b|\bunsubscribe me\b|\bremove me from\b/i.test(t);
};
export const withinWindow = (lastInboundAt: string | null | undefined, now = Date.now()) => !!lastInboundAt && now - Date.parse(lastInboundAt) < WINDOW_MS;

/* ───────────── settings, rules ───────────── */

export async function inboxSettings(): Promise<{ autoReply: boolean; aiReplies: boolean; maxPerDay: number; alertEmails: string[] }> {
  const rows = (await sb<any[]>(`/meta_settings?select=key,value`).catch(() => [])) || [];
  const m: Record<string, any> = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { autoReply: m.auto_reply === true, aiReplies: m.ai_replies !== false, maxPerDay: Number(m.max_agent_replies_per_day) || 15, alertEmails: Array.isArray(m.alert_emails) ? m.alert_emails.filter(Boolean) : [] };
}
export const loadRules = async (): Promise<Rule[]> => (await sb<Rule[]>(`/meta_rules?order=priority.asc`).catch(() => [])) || [];

/* ───────────── AI reply ───────────── */

let brainCache: { at: number; text: string } | null = null;
async function brain(): Promise<string> {
  if (brainCache && Date.now() - brainCache.at < 10 * 60e3) return brainCache.text;
  const rows = (await sb<any[]>(`/brand_brain?active=eq.true&kind=in.(identity,audience,usp,faq,claim_ok,claim_forbidden,objection,voice,proof)&select=kind,text,detail&limit=80`).catch(() => [])) || [];
  const text = rows.map((r) => `[${r.kind}] ${r.text}${r.detail ? ` — ${typeof r.detail === "string" ? r.detail : JSON.stringify(r.detail)}` : ""}`).join("\n").slice(0, 6000);
  brainCache = { at: Date.now(), text };
  return text;
}

const FACTS = `RANA AI (ranaai.in, Hyderabad) builds AI employees that answer and make business phone calls 24x7 in 11 Indian languages (Telugu, Hindi, Tamil, Kannada, Malayalam, Marathi, Bengali, Gujarati, Punjabi, Odia, English) plus Spanish, French, Japanese.
Plans per month + 18% GST: Starter ₹13,999 (1,000 min), Growth ₹41,999 (3,500 min), Scale ₹1,25,999 (12,000 min), Enterprise from ₹2.5 lakh. Yearly: 2 months free, no setup fee.
Free proof run: up to 200 enquiries handled free, report within 5 working days. Instant demo on ranaai.in, no sign-up. Demo call takes about 20 minutes; team calls back within one working day.
Follows TRAI rules (calls 9 AM–9 PM Mon–Sat, do-not-call list, DLT support). Contact: hello@ranaai.in.`;

export async function aiReply(history: { direction: string; text: string }[], who: string): Promise<{ reply: string; handoff: boolean; intent: "hot" | "warm" | "cold" | "support" | "spam"; business?: string; city?: string }> {
  const system = `You reply to Instagram/Facebook DMs for RANA AI. Be warm, short (max 3 sentences, under 350 characters), practical. Reply in the language and script the person used (English, Hinglish, Tenglish, Telugu, Hindi).
Only use these facts; never invent prices, discounts, clients, results or dates. If asked something not covered, say a team member will reply and set handoff=true.
Goal: understand their business, then offer the instant demo on ranaai.in or a demo call, and ask for business name + phone number. Never promise a custom price or discount (handoff=true instead).
FACTS:\n${FACTS}\nBRAND NOTES:\n${await brain()}
Return JSON only: {"reply": string, "handoff": boolean, "intent": "hot"|"warm"|"cold"|"support"|"spam", "business": string|null, "city": string|null}
intent=hot means they named a business AND want a demo/price/start.`;
  const convo = history.slice(-12).map((m) => `${m.direction === "in" ? who : "RANA"}: ${m.text}`).join("\n");
  const j = await chatJson<any>([{ role: "system", content: system }, { role: "user", content: `Conversation so far:\n${convo}\n\nWrite RANA's next reply.` }], { maxTokens: 400, temperature: 0.3, timeoutMs: 8000 });
  const reply = String(j?.reply || "").trim().slice(0, 900);
  return { reply, handoff: !!j?.handoff || !reply, intent: ["hot", "warm", "cold", "support", "spam"].includes(j?.intent) ? j.intent : "warm", business: j?.business || undefined, city: j?.city || undefined };
}

/* ───────────── CRM link + alerts ───────────── */

/** Find the lead in the CRM by phone (or email), else create one in New. Links the thread. */
export async function ensureDeal(thread: any, lead: any): Promise<string | null> {
  if (thread.crm_deal_id) return thread.crm_deal_id;
  let deal: any = null;
  if (lead.phone) [deal] = (await sb<any[]>(`/crm_deals?phone=eq.${encodeURIComponent(lead.phone)}&select=id&limit=1`).catch(() => [])) || [];
  if (!deal && lead.email) [deal] = (await sb<any[]>(`/crm_deals?email=eq.${encodeURIComponent(lead.email)}&select=id&limit=1`).catch(() => [])) || [];
  const who = thread.username ? `@${thread.username}` : thread.name || "Instagram lead";
  if (!deal) {
    const source = thread.platform === "messenger" ? "facebook" : "instagram";
    [deal] = await sb<any[]>(`/crm_deals?select=id`, { method: "POST", body: JSON.stringify({
      business: String(lead.business || thread.name || who).slice(0, 150), contact_name: thread.name || (thread.username ? `@${thread.username}` : null),
      phone: lead.phone || null, email: lead.email || null, city: lead.city || null, industry: guessIndustry(lead.business, lead.firstText),
      source, stage: "new", created_by: `${source}-inbox`, last_activity_at: new Date().toISOString(),
      notes: `From ${thread.platform === "messenger" ? "Facebook Messenger" : "Instagram"} ${who}.${lead.firstText ? `\nFirst message: ${String(lead.firstText).slice(0, 500)}` : ""}`,
    }) });
    if (deal?.id) await addActivity(deal.id, "system", `Lead created from ${thread.platform === "messenger" ? "Messenger" : "Instagram"} (${who})`, null).catch(() => {});
  } else {
    await addActivity(deal.id, "system", `Linked ${thread.platform === "messenger" ? "Messenger" : "Instagram"} chat (${who})`, null).catch(() => {});
  }
  if (!deal?.id) return null;
  await sb(`/meta_threads?id=eq.${thread.id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ crm_deal_id: deal.id }) });
  return deal.id;
}

async function alert(subject: string, lines: string[], threadId: string, emails: string[]) {
  const to = emails.length ? emails : hqEmails();
  if (!to.length) return;
  await sendEmail({ to, subject, html: emailHtml({ title: subject, lines, button: { label: "Open the inbox", url: `${APP_URL()}/hq/inbox?t=${threadId}` } }), kind: "meta_inbox" }).catch(() => {});
}

/* ───────────── event handlers ───────────── */

async function getOrCreateThread(platform: Platform, userId: string, ourId: string, profile: boolean): Promise<any> {
  const [t] = (await sb<any[]>(`/meta_threads?platform=eq.${platform}&user_id=eq.${encodeURIComponent(userId)}&limit=1`).catch(() => [])) || [];
  if (t) return t;
  const p = profile && canSend() ? await profileOf(platform, userId) : {};
  const row: any = { platform, user_id: userId };
  if (ourId) row.page_id = ourId; if (p.name) row.name = p.name; if (p.username) row.username = p.username;
  const [n] = await sb<any[]>(`/meta_threads?on_conflict=platform,user_id`, { method: "POST", prefer: "return=representation,resolution=merge-duplicates", body: JSON.stringify(row) });
  return n;
}

/** Record our own outgoing message. If Meta's echo of it arrived first (stored as "page"), this overwrites it with who really sent it. */
async function saveOut(threadId: string, text: string, sentBy: string, r: { mid?: string | null; error?: string; ruleId?: string | null }) {
  const row = { thread_id: threadId, direction: "out", mid: r.mid || null, text, sent_by: sentBy, rule_id: r.ruleId || null, status: r.error ? "failed" : "ok", error: r.error || null };
  await sb(r.mid ? `/meta_messages?on_conflict=mid` : `/meta_messages`, { method: "POST", prefer: r.mid ? "return=minimal,resolution=merge-duplicates" : "return=minimal", body: JSON.stringify(row) }).catch(() => {});
}

/** Send and record a reply. Never throws; returns whether Meta accepted it. */
export async function replyInThread(thread: any, text: string, sentBy: "agent" | "rule" | "human", ruleId?: string | null): Promise<{ ok: boolean; error?: string }> {
  try {
    const mid = await sendDm(thread.user_id, text);
    await saveOut(thread.id, text, sentBy, { mid, ruleId });
    await sb(`/meta_threads?id=eq.${thread.id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ last_message_at: new Date().toISOString(), last_text: text.slice(0, 300), updated_at: new Date().toISOString() }) });
    return { ok: true };
  } catch (e: any) {
    await saveOut(thread.id, text, sentBy, { error: String(e.message || e).slice(0, 500), ruleId });
    return { ok: false, error: e.message };
  }
}

export async function handleMessage(m: InMessage, settings?: Awaited<ReturnType<typeof inboxSettings>>, rules?: Rule[]) {
  if (m.mid) { const [dup] = (await sb<any[]>(`/meta_messages?mid=eq.${encodeURIComponent(m.mid)}&select=id&limit=1`).catch(() => [])) || []; if (dup) return { skipped: "duplicate" }; }
  const thread = await getOrCreateThread(m.platform, m.userId, m.ourId, !m.echo);
  if (!thread) return { skipped: "no-thread" };
  const now = new Date().toISOString();
  const patch = (body: any) => sb(`/meta_threads?id=eq.${thread.id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ ...body, updated_at: new Date().toISOString() }) });

  if (m.echo) {
    // Keep it in the history. If a person typed it in the Instagram / Facebook app, the bot steps back in this chat.
    await sb(`/meta_messages?on_conflict=mid`, { method: "POST", prefer: "return=minimal,resolution=ignore-duplicates", body: JSON.stringify({ thread_id: thread.id, direction: "out", mid: m.mid, text: m.text, attachments: m.attachments, sent_by: "page", created_at: m.at }) }).catch(() => {});
    const human = isHumanEcho(m);
    await patch({ last_message_at: m.at, last_text: m.text.slice(0, 300), ...(human && thread.mode === "agent" ? { mode: "human", needs_human: false } : {}) });
    return { stored: "echo", human };
  }

  const prior = (await sb<any[]>(`/meta_messages?thread_id=eq.${thread.id}&order=created_at.desc&limit=12&select=direction,text`).catch(() => [])) || [];
  const first = !prior.some((p) => p.direction === "in");
  await sb(`/meta_messages`, { method: "POST", prefer: "return=minimal", body: JSON.stringify({ thread_id: thread.id, direction: "in", mid: m.mid, text: m.text, attachments: m.attachments, sent_by: "user", created_at: m.at }) });

  const found = extractLead(m.text);
  const lead = { ...(thread.lead || {}), ...(found.phone ? { phone: found.phone } : {}), ...(found.email ? { email: found.email } : {}), ...(found.intent ? { intent: true } : {}), firstText: thread.lead?.firstText || m.text.slice(0, 500) };
  // A closed chat that writes again shows up for the team (but the bot stays quiet).
  await sb(`/rpc/meta_bump_inbound`, { method: "POST", prefer: "return=minimal", body: JSON.stringify({ p_thread: thread.id, p_at: m.at, p_text: m.text, p_lead: lead, p_needs_human: thread.mode === "closed" }) })
    .catch(() => sb(`/meta_threads?id=eq.${thread.id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ unread: (thread.unread || 0) + 1, last_inbound_at: m.at, last_message_at: m.at, last_text: m.text.slice(0, 300), lead, ...(thread.mode === "closed" ? { needs_human: true } : {}) }) }));
  thread.lead = lead;

  settings ||= await inboxSettings(); rules ||= await loadRules();
  const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10); // India date
  const repliesToday = thread.replies_day === today ? thread.agent_replies_today : 0;
  /** Atomically claim a reply slot. "ok" | "cap" (daily limit) | "soon" (another auto-reply went out < 6 s ago) | "error". */
  const claimOnce = async (): Promise<"ok" | "cap" | "soon" | "error"> => {
    try {
      const n = Number(await sb<any>(`/rpc/meta_claim_reply`, { method: "POST", body: JSON.stringify({ p_thread: thread.id, p_day: today, p_max: settings!.maxPerDay, p_debounce_seconds: 6 }) }));
      return n > 0 ? "ok" : n === -1 ? "cap" : n === 0 ? "soon" : "error";
    } catch (e: any) {
      await sb(`/cron_runs`, { method: "POST", prefer: "return=minimal", body: JSON.stringify({ job: "meta_claim_reply", ok: false, detail: { thread: thread.id, error: String(e?.message || e).slice(0, 300) } }) }).catch(() => {});
      return "error";
    }
  };
  /** Two quick messages: the second waits out the 6-second gap once, then is answered with the full conversation. */
  const claim = async (): Promise<"ok" | "cap" | "soon" | "error"> => {
    let r = await claimOnce();
    if (r === "soon") { await new Promise((ok) => setTimeout(ok, 6500)); r = await claimOnce(); }
    return r;
  };
  const freshHistory = async () => ((await sb<any[]>(`/meta_messages?thread_id=eq.${thread.id}&order=created_at.desc&limit=12&select=direction,text`).catch(() => prior)) || prior).reverse();
  const say = (text: string, by: "agent" | "rule", ruleId?: string | null) => replyInThread(thread, text, by, ruleId);

  // Lead into the CRM as soon as we have a number/email.
  let dealId: string | null = thread.crm_deal_id || null;
  if (lead.phone || lead.email) dealId = await ensureDeal(thread, lead).catch(() => dealId);
  if (dealId) await sb(`/crm_deals?id=eq.${dealId}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ last_activity_at: now, last_contact_at: now }) }).catch(() => {});

  if (thread.mode === "closed") return { stored: "in", closed: true };
  if (isOptOut(m.text)) {
    await patch({ mode: "closed", needs_human: false });
    if (settings.autoReply && thread.mode === "agent" && (await claim()) === "ok") await say("Okay, we won't message you again. Thank you!", "rule");
    return { stored: "in", optOut: true };
  }

  const hot = !!(lead.phone || lead.email) && !!lead.intent;
  const notifyHot = async () => {
    if (!hot || thread.lead?.alerted) return;
    thread.lead = { ...thread.lead, alerted: true };
    await patch({ lead: thread.lead });
    await alert(`HOT lead on ${m.platform === "instagram" ? "Instagram" : "Messenger"}: ${thread.username ? `@${thread.username}` : thread.name || lead.phone}`, [`<b>${esc(m.text)}</b>`, `Phone: ${esc(lead.phone || "—")} · Email: ${esc(lead.email || "—")}`, dealId ? `Added to the Sales CRM (New).` : ""].filter(Boolean), thread.id, settings!.alertEmails);
  };
  const needPerson = async (why: string) => {
    await patch({ mode: "human", needs_human: true });
    await alert(`Inbox: ${thread.username ? `@${thread.username}` : thread.name || "a lead"} needs a person`, [`<b>${esc(m.text)}</b>`, esc(why)], thread.id, settings!.alertEmails);
  };

  if (!settings.autoReply || thread.mode !== "agent") {
    if (thread.mode === "human") await patch({ needs_human: true });
    await notifyHot(); return { stored: "in", autoReply: false };
  }
  if (repliesToday >= settings.maxPerDay) { await needPerson(`The auto-reply limit for today (${settings.maxPerDay}) was reached in this chat.`); return { stored: "in", capped: true }; }

  /** No slot: the daily limit hands the chat to a person; anything else flags it for the team so nothing is dropped silently. */
  const noSlot = async (why: "cap" | "soon" | "error") => {
    if (why === "cap") await needPerson(`The auto-reply limit for today (${settings!.maxPerDay}) was reached in this chat.`);
    else await patch({ needs_human: true });
    await notifyHot();
    return { stored: "in", replied: false, noSlot: why };
  };

  const rule = matchRule(rules, { trigger: "dm_keyword", text: m.text, platform: m.platform }) || (first ? matchRule(rules, { trigger: "welcome", text: m.text, platform: m.platform }) : null);
  if (rule) {
    const slot = await claim(); if (slot !== "ok") return noSlot(slot);
    await say(rule.reply, "rule", rule.id);
    await sb(`/meta_rules?id=eq.${rule.id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ hits: ((rule as any).hits || 0) + 1 }) }).catch(() => {});
    if (rule.create_lead && !dealId) dealId = await ensureDeal(thread, { ...lead, intent: true }).catch(() => null);
    if (rule.handoff) await patch({ mode: "human", needs_human: true });
    await notifyHot();
    return { stored: "in", replied: "rule", rule: rule.name };
  }

  if (!settings.aiReplies) { await patch({ needs_human: true }); await notifyHot(); return { stored: "in", replied: false }; }
  const slot = await claim(); if (slot !== "ok") return noSlot(slot);
  // Flag first, so that if the AI call is slow or the function is cut off, the chat still shows up for the team.
  await patch({ needs_human: true });
  try {
    const history = await freshHistory(); // includes this message and anything that arrived while we waited
    const ai = await aiReply(history, thread.username ? `@${thread.username}` : thread.name || "Lead");
    if (ai.intent === "spam") { await patch({ needs_human: false }); return { stored: "in", replied: false, spam: true }; }
    if (ai.business || ai.city) { thread.lead = { ...thread.lead, ...(ai.business ? { business: ai.business } : {}), ...(ai.city ? { city: ai.city } : {}) }; await patch({ lead: thread.lead }); }
    const sent = ai.reply ? await say(ai.reply, "agent") : { ok: false };
    if (ai.handoff) await needPerson("The AI handed this chat to the team.");
    else if (sent.ok) await patch({ needs_human: false });
    if (ai.intent === "hot" && !dealId) dealId = await ensureDeal(thread, { ...thread.lead, intent: true }).catch(() => null);
    await notifyHot();
    return { stored: "in", replied: sent.ok ? "ai" : false };
  } catch (e: any) {
    await notifyHot();
    return { stored: "in", replied: false, error: String(e.message || e).slice(0, 200) };
  }
}

export async function handleComment(c: InComment, settings?: Awaited<ReturnType<typeof inboxSettings>>, rules?: Rule[]) {
  settings ||= await inboxSettings(); rules ||= await loadRules();
  if (isOwnComment(c, rules, [pageId(), igUserId()])) return { skipped: "own comment" };
  const [dup] = (await sb<any[]>(`/meta_comments?comment_id=eq.${encodeURIComponent(c.commentId)}&select=id&limit=1`).catch(() => [])) || [];
  if (dup) return { skipped: "duplicate" };
  const [row] = await sb<any[]>(`/meta_comments`, { method: "POST", body: JSON.stringify({ platform: c.platform, comment_id: c.commentId, post_id: c.postId, parent_id: c.parentId, from_id: c.fromId, from_name: c.fromName, text: c.text, created_at: c.at }) });
  if (!settings.autoReply) return { stored: "comment", autoReply: false };
  const rule = matchRule(rules, { trigger: "comment_keyword", text: c.text, platform: c.platform, postId: c.postId });
  if (!rule) return { stored: "comment", rule: null };
  if (Date.now() - Date.parse(c.at) > PRIVATE_REPLY_MS) return { stored: "comment", tooOld: true };
  const patch: any = { rule_id: rule.id };
  try {
    const mid = await sendPrivateReply(c.commentId, rule.reply);
    patch.private_reply_status = "sent"; patch.private_reply_at = new Date().toISOString();
    if (c.platform === "instagram") { // the DM thread with this person starts now; keep the history together
      const thread = await getOrCreateThread("instagram", c.fromId, igUserId() || c.entryId || "", false);
      if (thread) {
        if (!thread.username && c.fromName) await sb(`/meta_threads?id=eq.${thread.id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ username: c.fromName, lead: { ...(thread.lead || {}), fromComment: c.text.slice(0, 300) } }) });
        await saveOut(thread.id, rule.reply, "private_reply", { mid, ruleId: rule.id });
      }
    }
  } catch (e: any) { patch.private_reply_status = "failed"; patch.private_reply_error = String(e.message || e).slice(0, 500); }
  if (rule.public_reply) { try { await replyToComment(c.platform, c.parentId || c.commentId, rule.public_reply); patch.public_reply_status = "sent"; } catch (e: any) { patch.public_reply_status = `failed: ${String(e.message || e).slice(0, 200)}`; } }
  await sb(`/meta_comments?id=eq.${row.id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify(patch) });
  await sb(`/meta_rules?id=eq.${rule.id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ hits: ((rule as any).hits || 0) + 1 }) }).catch(() => {});
  return { stored: "comment", rule: rule.name, private: patch.private_reply_status };
}
