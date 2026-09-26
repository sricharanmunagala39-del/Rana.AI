// Lead alerts: after every real call, send the leads each client chose to the places they chose — Slack, WhatsApp,
// email or their own webhook (Zapier, Make, Google Sheets, a CRM). Each call goes to each channel at most once.
import { createHmac, randomBytes } from "crypto";
import { sb } from "./db";
import { seal, open, hint } from "./secretBox";
import { sendEmail, emailHtml, APP_URL } from "./notify";
import { isConnected } from "./metrics";
import { LEAD_LABEL } from "./format";
import type { LeadKey } from "./reports";

export type Kind = "slack" | "whatsapp" | "email" | "webhook";
export type Rules = { leads: LeadKey[]; directions: ("outbound" | "inbound")[]; campaigns: "all" | string[]; fields: string[] };
export type Config = { rules: Rules; recipients?: string[]; phoneNumberId?: string; template?: string; templateLang?: string };

export const ALERT_FIELDS: { key: string; label: string }[] = [
  { key: "name", label: "Name" }, { key: "phone", label: "Phone" }, { key: "lead", label: "Lead status" }, { key: "reason", label: "Why" },
  { key: "summary", label: "Call summary" }, { key: "campaign", label: "Campaign" }, { key: "direction", label: "Incoming / outgoing" },
  { key: "when", label: "Time of call" }, { key: "talk", label: "Talk time" }, { key: "needs_person", label: "Who should call back" },
  { key: "recording", label: "Recording link" }, { key: "list", label: "Columns from the uploaded list" }, { key: "transcript", label: "Last lines of the conversation" },
];
export const DEFAULT_RULES: Rules = { leads: ["ready_to_close", "hot", "needs_person"], directions: ["outbound", "inbound"], campaigns: "all", fields: ["name", "phone", "lead", "reason", "summary", "campaign", "needs_person", "recording"] };

const clip = (v: any, n: number) => String(v ?? "").slice(0, n);
const phoneDigits = (p: string) => { const d = String(p || "").replace(/\D/g, ""); return d.length === 10 ? `91${d}` : d; };

export function normalizeRules(r: any): Rules {
  const leads = (Array.isArray(r?.leads) ? r.leads : DEFAULT_RULES.leads).filter((k: any) => ["ready_to_close", "hot", "warm", "new", "cold", "not_interested", "no_answer", "follow_up", "needs_person"].includes(k));
  const directions = (Array.isArray(r?.directions) ? r.directions : DEFAULT_RULES.directions).filter((d: any) => d === "outbound" || d === "inbound");
  const campaigns = Array.isArray(r?.campaigns) ? r.campaigns.filter((x: any) => /^[0-9a-f-]{36}$/i.test(String(x))).slice(0, 100) : "all";
  const fields = (Array.isArray(r?.fields) ? r.fields : DEFAULT_RULES.fields).filter((k: any) => ALERT_FIELDS.some((f) => f.key === k));
  return { leads: leads.length ? leads : DEFAULT_RULES.leads, directions: directions.length ? directions : DEFAULT_RULES.directions, campaigns, fields: fields.length ? fields : DEFAULT_RULES.fields };
}

/** Public-internet https URLs only: never let a client point RANA at internal addresses. */
export function safeUrl(raw: string): URL | null {
  try {
    const u = new URL(String(raw || "").trim());
    if (u.protocol !== "https:" || u.username || u.password) return null;
    const h = u.hostname.toLowerCase();
    if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".")) return null;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.startsWith("[")) return null; // no raw IPs
    return u;
  } catch { return null; }
}

// ---------- Which calls ----------
function wanted(call: any, rules: Rules, campaignIdOfBatch: Map<string, string>): boolean {
  if (!rules.directions.includes(call.direction === "outbound" ? "outbound" : "inbound")) return false;
  if (rules.campaigns !== "all") {
    const cid = call.campaign_id ? campaignIdOfBatch.get(call.campaign_id) : null;
    if (!cid || !rules.campaigns.includes(cid)) return false;
  }
  return rules.leads.some((k) => (k === "follow_up" ? !!call.follow_up || call.lead_status === "ready_to_close" : k === "needs_person" ? !!call.handoff : call.lead_status === k));
}

// ---------- What goes in the message ----------
type Lead = { title: string; lines: [string, string][]; link: string | null; data: Record<string, any> };
function leadOf(call: any, fields: string[], extra: { campaign: string | null; contact: any; client: any }): Lead {
  const name = call.caller_name || extra.contact?.name || "Unknown caller";
  const lead = (LEAD_LABEL as any)[call.lead_status] || "New";
  const talk = Math.round(Number(call.duration_seconds) || 0);
  const when = new Date(call.started_at || call.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: true });
  const turns = (Array.isArray(call.transcript) ? call.transcript : []).filter((t: any) => String(t?.text || "").trim()).slice(-6).map((t: any) => `${t.role === "user" ? "Customer" : "RANA"}: ${clip(t.text, 160)}`).join("\n");
  const all: Record<string, [string, any]> = {
    name: ["Name", name], phone: ["Phone", call.caller_phone || ""], lead: ["Lead", lead], reason: ["Why", call.lead_reason || ""],
    summary: ["Summary", call.summary || ""], campaign: ["Campaign", extra.campaign || (call.direction === "outbound" ? "Single call" : "Incoming call")],
    direction: ["Call", call.direction === "outbound" ? "Outgoing" : "Incoming"], when: ["When", when], talk: ["Talk time", `${Math.floor(talk / 60)}m ${talk % 60}s`],
    needs_person: ["Call back by", call.handoff ? `${call.handoff.to_name || "your team"} — ${String(call.handoff.label || "").toLowerCase()}` : ""],
    recording: ["Recording", call.recording_url || ""], transcript: ["Conversation", turns],
  };
  const lines: [string, string][] = [];
  const data: Record<string, any> = { call_id: call.id, lead_status: call.lead_status, follow_up: !!call.follow_up };
  for (const f of fields) {
    if (f === "list") { for (const [k, v] of Object.entries(extra.contact?.variables || {})) if (v !== "" && v != null) { lines.push([k, clip(v, 200)]); data[`list_${k}`] = v; } continue; }
    const x = all[f]; if (!x) continue;
    data[f] = x[1];
    if (x[1] !== "" && x[1] != null) lines.push([x[0], clip(x[1], f === "transcript" ? 1200 : 600)]);
  }
  const hot = call.lead_status === "ready_to_close" ? "🔥 Ready to close" : call.lead_status === "hot" ? "🔥 Hot lead" : call.handoff ? "📞 Needs a person" : `${lead} lead`;
  return { title: `${hot}: ${fields.includes("name") ? name : "a caller"}${extra.client?.name ? ` · ${extra.client.name}` : ""}`, lines, link: `${APP_URL()}/${call.direction === "outbound" ? "outbound" : "inbound"}`, data };
}

// ---------- Senders ----------
async function post(url: string, body: any, headers: Record<string, string> = {}) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body), signal: AbortSignal.timeout(10000), redirect: "error" });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text().catch(() => "")).slice(0, 200)}`);
}

async function deliver(integ: any, lead: Lead): Promise<void> {
  const cfg: Config = integ.config || {};
  const secret = open(integ.secret);
  if (integ.kind === "slack") {
    if (!secret) throw new Error("Slack webhook URL is missing — add it again.");
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
    await post(secret, {
      text: lead.title,
      blocks: [
        { type: "header", text: { type: "plain_text", text: clip(lead.title, 150) } },
        { type: "section", text: { type: "mrkdwn", text: lead.lines.map(([k, v]) => `*${esc(k)}:* ${k === "Recording" ? `<${v}|Listen>` : esc(v)}`).join("\n").slice(0, 2900) || "—" } },
        ...(lead.link ? [{ type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Open in RANA" }, url: lead.link }] }] : []),
      ],
    });
  } else if (integ.kind === "email") {
    const to = (cfg.recipients || []).filter(Boolean);
    if (!to.length) throw new Error("No email recipients.");
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
    const r = await sendEmail({ to, kind: "lead_alert", clientId: integ.client_id, subject: lead.title, html: emailHtml({ title: esc(lead.title), lines: lead.lines.map(([k, v]) => `<b>${esc(k)}:</b> ${k === "Recording" ? `<a href="${esc(v)}">Listen</a>` : esc(v).replace(/\n/g, "<br>")}`), button: lead.link ? { label: "Open in RANA", url: lead.link } : undefined }) });
    if (!r.ok) throw new Error(r.error || "Email failed");
  } else if (integ.kind === "webhook") {
    const url = safeUrl(cfg.recipients?.[0] || "");
    if (!url) throw new Error("Webhook URL must be a public https address.");
    const body = JSON.stringify({ event: "rana.lead", sent_at: new Date().toISOString(), title: lead.title, lead: lead.data });
    await post(url.toString(), body, secret ? { "X-Rana-Signature": `sha256=${createHmac("sha256", secret).update(body).digest("hex")}` } : {});
  } else if (integ.kind === "whatsapp") {
    if (!secret || !cfg.phoneNumberId) throw new Error("WhatsApp access token or phone number ID is missing.");
    const to = (cfg.recipients || []).map(phoneDigits).filter((d) => d.length >= 10);
    if (!to.length) throw new Error("No WhatsApp numbers to send to.");
    const text = `${lead.title}\n${lead.lines.map(([k, v]) => `${k}: ${v}`).join("\n")}`.slice(0, 1000);
    for (const n of to) {
      // Business-started WhatsApp messages need an approved template; its {{1}} {{2}}… are filled with the chosen fields in order.
      const body = cfg.template
        ? { messaging_product: "whatsapp", to: n, type: "template", template: { name: cfg.template, language: { code: cfg.templateLang || "en" }, components: [{ type: "body", parameters: lead.lines.slice(0, 10).map(([, v]) => ({ type: "text", text: clip(v.replace(/\s+/g, " "), 900) || "-" })) }] } }
        : { messaging_product: "whatsapp", to: n, type: "text", text: { body: text, preview_url: false } };
      await post(`https://graph.facebook.com/v21.0/${encodeURIComponent(cfg.phoneNumberId)}/messages`, body, { Authorization: `Bearer ${secret}` });
    }
  }
}

async function note(integ: any, ok: boolean, error: string | null) {
  const now = new Date().toISOString();
  const patch = ok ? { last_sent_at: now, sent_count: (integ.sent_count || 0) + 1, last_error: null } : { last_error: clip(error, 300), last_error_at: now };
  await sb(`/integrations?id=eq.${integ.id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify(patch) }).catch(() => {});
}

async function context(clientId: string, call: any) {
  const camps = (await sb<any[]>(`/campaigns?client_id=eq.${clientId}&select=id,name,cartesia_batch_id&limit=500`).catch(() => [])) || [];
  const byBatch = new Map(camps.filter((c) => c.cartesia_batch_id).map((c) => [c.cartesia_batch_id, c]));
  const camp = call.campaign_id ? byBatch.get(call.campaign_id) : null;
  const contact = camp && call.caller_phone ? ((await sb<any[]>(`/campaign_contacts?campaign_id=eq.${camp.id}&phone=eq.${encodeURIComponent(call.caller_phone)}&select=name,variables&limit=1`).catch(() => [])) || [])[0] : null;
  return { idOfBatch: new Map(camps.filter((c) => c.cartesia_batch_id).map((c) => [c.cartesia_batch_id, c.id])), campaign: camp?.name || null, contact };
}

/** After a real call is saved: send it to every matching channel, once. Never throws. */
export async function leadAlertsAfterCall(client: any, call: any): Promise<number> {
  try {
    if (!call?.id || call.source === "manual") return 0;
    if (Date.now() - Date.parse(call.created_at || call.started_at || new Date().toISOString()) > 6 * 3600e3) return 0; // old calls re-synced: no alerts
    const integs = (await sb<any[]>(`/integrations?client_id=eq.${client.id}&enabled=eq.true`).catch(() => [])) || [];
    if (!integs.length) return 0;
    const ctx = await context(client.id, call);
    let sent = 0;
    await Promise.all(integs.map(async (integ) => {
      const rules = normalizeRules(integ.config?.rules);
      if (!wanted(call, rules, ctx.idOfBatch)) return;
      if (!isConnected(call) && !rules.leads.includes("no_answer")) return;
      // Claim this (channel, call) first — the unique index makes retried webhooks a no-op.
      // (A second insert for the same pair fails on that index, so it is skipped.)
      const claimed = await sb<any[]>(`/integration_log`, { method: "POST", body: JSON.stringify({ integration_id: integ.id, client_id: client.id, call_id: call.id, kind: "lead" }) }).catch(() => null);
      if (!claimed?.length) return;
      try {
        await deliver(integ, leadOf(call, rules.fields, { campaign: ctx.campaign, contact: ctx.contact, client }));
        sent++;
        await Promise.all([note(integ, true, null), sb(`/integration_log?id=eq.${claimed[0].id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ ok: true }) }).catch(() => {})]);
      } catch (e: any) {
        await Promise.all([note(integ, false, e?.message), sb(`/integration_log?id=eq.${claimed[0].id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ ok: false, error: clip(e?.message, 300) }) }).catch(() => {})]);
      }
    }));
    return sent;
  } catch (e: any) { console.error("[leadAlerts]", e?.message); return 0; }
}

/** "Send test" button: a made-up hot lead, so the client can see exactly what arrives. */
export async function sendTest(integ: any, client: any): Promise<{ ok: boolean; error?: string }> {
  const rules = normalizeRules(integ.config?.rules);
  const fake = {
    id: "00000000-0000-0000-0000-000000000000", direction: "outbound", caller_name: "Test Lead (sample)", caller_phone: "+919800000000",
    lead_status: "hot", lead_reason: "Asked for fees and wants to join this week.", summary: "Sample alert from RANA AI. Real alerts look like this, with your caller's details.",
    duration_seconds: 134, follow_up: true, handoff: { label: "Ready to join or pay", to_name: "Sales team" }, recording_url: `${APP_URL()}/`, created_at: new Date().toISOString(),
    transcript: [{ role: "agent", text: "Namaskaram! RANA nundi matladutunnanu." }, { role: "user", text: "Fees enti? Ee week join avvali." }],
  };
  try {
    await deliver(integ, leadOf(fake, rules.fields, { campaign: "Sample campaign", contact: { variables: { City: "Hyderabad" } }, client }));
    await sb(`/integration_log`, { method: "POST", prefer: "return=minimal", body: JSON.stringify({ integration_id: integ.id, client_id: integ.client_id, kind: "test", ok: true }) }).catch(() => {});
    await note(integ, true, null);
    return { ok: true };
  } catch (e: any) {
    await sb(`/integration_log`, { method: "POST", prefer: "return=minimal", body: JSON.stringify({ integration_id: integ.id, client_id: integ.client_id, kind: "test", ok: false, error: clip(e?.message, 300) }) }).catch(() => {});
    await note(integ, false, e?.message);
    return { ok: false, error: clip(e?.message, 300) };
  }
}

/** Safe view for the browser: no secrets, just a hint. */
export function publicIntegration(i: any) {
  const s = open(i.secret);
  return { id: i.id, kind: i.kind, name: i.name, enabled: i.enabled, config: { ...i.config, rules: normalizeRules(i.config?.rules) }, secretHint: hint(s), hasSecret: !!s, lastSentAt: i.last_sent_at, lastError: i.last_error, lastErrorAt: i.last_error_at, sentCount: i.sent_count, createdAt: i.created_at, createdBy: i.created_by };
}

/** Validate + build the stored row from what the Settings form sent. Returns an error message or the patch. */
export function buildIntegration(kind: Kind, b: any, existing?: any): { error: string } | { row: any; signingSecret?: string } {
  const rules = normalizeRules(b.rules);
  const name = clip(String(b.name || "").trim(), 60) || { slack: "Slack", whatsapp: "WhatsApp", email: "Email", webhook: "Webhook" }[kind];
  const cfg: Config = { rules };
  let secret: string | undefined; let signingSecret: string | undefined;
  if (kind === "slack") {
    const url = String(b.secret || "").trim();
    if (url) { const u = safeUrl(url); if (!u || u.hostname !== "hooks.slack.com" || !u.pathname.startsWith("/services/")) return { error: "Paste the Slack “Incoming Webhook” URL — it starts with https://hooks.slack.com/services/" }; secret = u.toString(); }
    else if (!existing?.secret) return { error: "Paste your Slack Incoming Webhook URL." };
  } else if (kind === "email") {
    const to = (Array.isArray(b.recipients) ? b.recipients : String(b.recipients || "").split(/[,\s;]+/)).map((e: any) => String(e).trim().toLowerCase()).filter(Boolean);
    if (!to.length || to.length > 10 || to.some((e: string) => !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e))) return { error: "Enter 1–10 valid email addresses." };
    cfg.recipients = to;
  } else if (kind === "webhook") {
    const u = safeUrl(Array.isArray(b.recipients) ? b.recipients[0] : b.recipients);
    if (!u) return { error: "Enter a public https URL (for example your Zapier, Make or CRM webhook)." };
    cfg.recipients = [u.toString()];
    if (!existing?.secret) { signingSecret = randomBytes(24).toString("base64url"); secret = signingSecret; }
  } else if (kind === "whatsapp") {
    const to = (Array.isArray(b.recipients) ? b.recipients : String(b.recipients || "").split(/[,\s;]+/)).map((p: any) => phoneDigits(String(p))).filter(Boolean);
    if (!to.length || to.length > 10 || to.some((d: string) => d.length < 10 || d.length > 15)) return { error: "Enter 1–10 WhatsApp numbers with country code, e.g. 919876543210." };
    if (!/^\d{6,20}$/.test(String(b.phoneNumberId || existing?.config?.phoneNumberId || ""))) return { error: "Enter the Phone number ID from Meta (WhatsApp → API setup)." };
    cfg.recipients = to; cfg.phoneNumberId = String(b.phoneNumberId || existing?.config?.phoneNumberId);
    cfg.template = /^[a-z0-9_]{1,512}$/.test(String(b.template || "")) ? String(b.template) : undefined;
    cfg.templateLang = /^[a-z]{2}(_[A-Z]{2})?$/.test(String(b.templateLang || "")) ? String(b.templateLang) : "en";
    const tok = String(b.secret || "").trim();
    if (tok) { if (tok.length < 20 || /\s/.test(tok)) return { error: "That access token doesn't look right." }; secret = tok; }
    else if (!existing?.secret) return { error: "Paste your WhatsApp Cloud API access token." };
  }
  const row: any = { kind, name, config: cfg, enabled: b.enabled !== false, updated_at: new Date().toISOString() };
  if (secret) row.secret = seal(secret);
  return { row, signingSecret };
}
