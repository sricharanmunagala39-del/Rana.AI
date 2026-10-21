// RANA HQ → Sales CRM: RANA AI's own leads, from upload to closed deal.
// Five stages only: New → Contacted → Prospect → Deal (+ Not interested). Every lead has an industry.
import { sb, sbAll } from "./db";
import { PLANS, MAX_SALES_DISCOUNT, YEARLY_MONTHS_PAID } from "./pricing";

export const STAGES = [
  { key: "new", label: "New", hint: "Uploaded, not called yet" },
  { key: "contacted", label: "Contacted", hint: "We spoke or messaged" },
  { key: "prospect", label: "Prospect", hint: "Real chance of closing" },
  { key: "deal", label: "Deal", hint: "Closed — paid or signed" },
  { key: "not_interested", label: "Not interested", hint: "Dead lead" },
] as const;
export type Stage = (typeof STAGES)[number]["key"];
export const STAGE_KEYS = STAGES.map((s) => s.key) as Stage[];
export const OPEN_STAGES: Stage[] = ["new", "contacted", "prospect"];
/** Stages that must always have a next follow-up date. */
export const NEEDS_FOLLOW_UP: Stage[] = ["contacted", "prospect"];
/** Old stage names (before the simple pipeline) → new ones. */
const LEGACY: Record<string, Stage> = { demo_booked: "prospect", demo_done: "prospect", proposal: "prospect", won: "deal", lost: "not_interested" };
export const stageOf = (s: string): Stage => (STAGE_KEYS.includes(s as Stage) ? (s as Stage) : LEGACY[s] || "new");

export const INDUSTRIES = [
  { key: "real_estate", label: "Real estate", words: ["real estate", "realty", "developer", "builders", "construction", "properties", "property", "infra", "homes", "estates", "villas", "plots", "apartments", "housing", "venture"] },
  { key: "healthcare", label: "Healthcare", words: ["hospital", "clinic", "health", "medical", "dental", "dentist", "diagnostic", "pharma", "pharmacy", "care", "ayurved", "physio", "eye", "skin", "derma", "ivf", "fertility", "lab", "doctor", "dr "] },
  { key: "education", label: "Education & coaching", words: ["school", "college", "academy", "coaching", "institute", "education", "edu", "tuition", "classes", "university", "learning", "ias", "upsc", "neet", "jee", "tutorial", "edtech"] },
  { key: "hospitality", label: "Hospitality", words: ["hotel", "resort", "restaurant", "cafe", "café", "hospitality", "inn", "stay", "lodge", "banquet", "catering", "kitchen", "dhaba", "bar", "travel", "tours"] },
  { key: "retail", label: "Retail & e-commerce", words: ["store", "retail", "mart", "shop", "fashion", "boutique", "jewel", "garment", "textile", "ecommerce", "e-commerce", "electronics", "furniture", "showroom", "traders", "enterprises", "sarees", "footwear"] },
  { key: "bfsi", label: "Banking, loans & insurance", words: ["bank", "finance", "loan", "insurance", "capital", "fintech", "credit", "nbfc", "mutual fund", "wealth", "investment", "broking"] },
  { key: "automobile", label: "Automobile", words: ["motors", "auto", "automobile", "cars", "car ", "bikes", "honda", "hyundai", "maruti", "toyota", "tata", "service centre", "garage", "tyres"] },
  { key: "wellness", label: "Gyms, salons & wellness", words: ["gym", "fitness", "salon", "spa", "beauty", "wellness", "yoga", "parlour", "parlor", "unisex", "makeover"] },
  { key: "other", label: "Other", words: [] },
] as const;
export type IndustryKey = (typeof INDUSTRIES)[number]["key"];
export const INDUSTRY_KEYS = INDUSTRIES.map((i) => i.key) as IndustryKey[];
export const industryLabel = (k: string | null | undefined) => INDUSTRIES.find((i) => i.key === k)?.label || "Other";

/** Industry from what was typed ("Real Estate", "clinic") or, failing that, from the business name. */
export function guessIndustry(...texts: (string | null | undefined)[]): IndustryKey {
  const t = ` ${texts.filter(Boolean).join(" ").toLowerCase()} `;
  if (!t.trim()) return "other";
  for (const i of INDUSTRIES) if (t.includes(` ${i.label.toLowerCase()} `) || t.includes(i.key.replace("_", " "))) return i.key;
  for (const i of INDUSTRIES) if (i.words.some((w) => t.includes(w))) return i.key;
  return "other";
}

export const SOURCES: Record<string, string> = {
  manual: "Added by team", upload: "Excel / CSV upload", sheet: "Google Sheet", website: "Website demo form", proof: "Free proof run",
  ai_call: "AI sales call", referral: "Referral", inbox: "Connected app", walk_in: "Walk-in / event", linkedin: "LinkedIn", whatsapp: "WhatsApp",
  instagram: "Instagram DM / comment", facebook: "Facebook Messenger / comment", other: "Other",
};
export const ACTIVITY_KINDS: Record<string, string> = {
  note: "Note", call: "Call", whatsapp: "WhatsApp", email: "Email", meeting: "Meeting", stage: "Stage change", system: "Update",
};
export const DEAL_PLANS = ["starter", "growth", "scale", "enterprise"] as const;
/** A Prospect is "delayed" when its closing date has passed or nobody has touched it for this many days. */
export const DELAYED_AFTER_DAYS = 7;

/** Monthly value of a lead: list price minus the discount offered (enterprise has no list price). */
export function dealMonthly(d: { plan?: string | null; discount_pct?: number | string | null }): number {
  const p = d.plan && d.plan !== "enterprise" ? (PLANS as any)[d.plan] : null;
  if (!p?.pricePerMonth) return 0;
  const pct = Math.min(MAX_SALES_DISCOUNT, Math.max(0, Number(d.discount_pct) || 0));
  return Math.round(p.pricePerMonth * (1 - pct / 100));
}
export const dealFirstPayment = (d: { plan?: string | null; discount_pct?: number | string | null; billing?: string | null }) =>
  d.billing === "yearly" ? dealMonthly(d) * YEARLY_MONTHS_PAID : dealMonthly(d);

/** Follow-up status of an open lead, for badges, the Today box and the daily email. */
export function followState(d: any, now = Date.now()): "overdue" | "today" | "later" | "none" {
  if (!OPEN_STAGES.includes(stageOf(d.stage)) || !d.next_action_at) return "none";
  const t = Date.parse(d.next_action_at);
  if (t < now) return "overdue";
  const end = new Date(now + 5.5 * 3600e3); end.setUTCHours(23, 59, 59, 999); // end of today in India
  return t <= end.getTime() - 5.5 * 3600e3 ? "today" : "later";
}
export function isDelayed(d: any, now = Date.now()): boolean {
  if (stageOf(d.stage) !== "prospect") return false;
  if (d.expected_close_at && Date.parse(d.expected_close_at) < now) return true;
  const last = Date.parse(d.last_activity_at || d.updated_at || d.created_at);
  return now - last > DELAYED_AFTER_DAYS * 86400e3;
}
/** Lead row as the page sees it: new stage names, value and reminder flags. */
export function view(d: any) {
  return { ...d, stage: stageOf(d.stage), industry: INDUSTRY_KEYS.includes(d.industry) ? d.industry : guessIndustry(d.industry, d.business), monthly: dealMonthly(d), follow: followState(d), delayed: isDelayed(d) };
}

const clip = (v: any, n: number) => { const s = String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n); return s || null; };
/** Like clip, but keeps line breaks (for notes). */
const clipLines = (v: any, n: number) => { const s = String(v ?? "").replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, n); return s || null; };
/** Last 10 digits of a phone number: how numbers stored in different formats are matched. */
export const last10 = (p: string | null | undefined) => { const d = String(p || "").replace(/\D/g, ""); return d.length >= 10 ? d.slice(-10) : ""; };
/** Indian numbers → +91XXXXXXXXXX; anything else kept as digits. */
export function phoneOf(v: any): string | null {
  let d = String(v ?? "").replace(/[^\d+]/g, "");
  if (!d) return null;
  if (d.startsWith("+")) return d.length >= 8 ? d : null;
  d = d.replace(/^0+/, "");
  if (d.length === 10 && /^[6-9]/.test(d)) return `+91${d}`;
  if (d.length === 12 && d.startsWith("91")) return `+${d}`;
  return d.length >= 8 ? `+${d}` : null;
}

/** Clean a create/update body into table columns. Only keys present in `b` are returned. */
export function dealPatch(b: any): { patch: any; error?: string } {
  const patch: any = {};
  if ("business" in b) { patch.business = clip(b.business, 150); if (!patch.business) return { patch, error: "Enter the business name." }; }
  if ("contactName" in b) patch.contact_name = clip(b.contactName, 100);
  if ("phone" in b) { const p = phoneOf(b.phone); if (String(b.phone || "").trim() && !p) return { patch, error: "That phone number doesn't look right." }; patch.phone = p; }
  if ("email" in b) { const e = clip(b.email, 150)?.toLowerCase() || null; if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { patch, error: "That email doesn't look right." }; patch.email = e; }
  if ("city" in b) patch.city = clip(b.city, 80);
  if ("industry" in b) patch.industry = INDUSTRY_KEYS.includes(b.industry) ? b.industry : guessIndustry(b.industry);
  if ("source" in b) patch.source = SOURCES[b.source] ? b.source : "other";
  if ("stage" in b) { if (!STAGE_KEYS.includes(b.stage)) return { patch, error: "Unknown stage." }; patch.stage = b.stage; }
  if ("plan" in b) patch.plan = DEAL_PLANS.includes(b.plan) ? b.plan : null;
  if ("billing" in b) patch.billing = b.billing === "yearly" ? "yearly" : "monthly";
  if ("discountPct" in b) { const p = Math.round(Number(b.discountPct) || 0); if (p < 0 || p > MAX_SALES_DISCOUNT) return { patch, error: `Discount must be 0–${MAX_SALES_DISCOUNT}%.` }; patch.discount_pct = p; }
  if ("owner" in b) patch.owner = clip(b.owner, 150)?.toLowerCase() || null;
  if ("nextAction" in b) patch.next_action = clip(b.nextAction, 200);
  if ("nextActionAt" in b) { const t = b.nextActionAt ? Date.parse(b.nextActionAt) : NaN; patch.next_action_at = Number.isFinite(t) ? new Date(t).toISOString() : null; }
  if ("expectedCloseAt" in b) { const t = b.expectedCloseAt ? Date.parse(b.expectedCloseAt) : NaN; patch.expected_close_at = Number.isFinite(t) ? new Date(t).toISOString() : null; }
  if ("lostReason" in b) patch.lost_reason = clip(b.lostReason, 300);
  if ("notes" in b) patch.notes = clipLines(b.notes, 4000);
  if ("clientId" in b) patch.client_id = /^[0-9a-f-]{36}$/i.test(String(b.clientId || "")) ? b.clientId : null;
  return { patch };
}

export async function addActivity(dealId: string, kind: string, text: string, by: string | null) {
  await sb(`/crm_activities`, { method: "POST", prefer: "return=minimal", body: JSON.stringify({ deal_id: dealId, kind: ACTIVITY_KINDS[kind] ? kind : "note", text: String(text).slice(0, 2000), created_by: by }) });
}

/* ───────────── adding many leads (upload, Google Sheet, connected apps) ───────────── */

export type LeadIn = { business?: any; contactName?: any; phone?: any; email?: any; city?: any; industry?: any; notes?: any };
export type ImportSummary = { added: number; duplicates: number; skipped: number; addedIds: string[]; problems: string[] };

/** Adds leads to New. Skips rows without a name and a phone/email, and any phone already in the CRM (or repeated in the batch). */
export async function importLeads(rows: LeadIn[], o: { source: string; owner?: string | null; by: string; batch?: string; defaultIndustry?: string | null }): Promise<ImportSummary> {
  const out: ImportSummary = { added: 0, duplicates: 0, skipped: 0, addedIds: [], problems: [] };
  const existing = (await sb<any[]>(`/crm_deals?select=phone,email,business&limit=20000`).catch(() => [])) || [];
  const phones = new Set(existing.map((e) => e.phone).filter(Boolean));
  const emails = new Set(existing.map((e) => (e.email || "").toLowerCase()).filter(Boolean));
  const names = new Set(existing.filter((e) => !e.phone && !e.email).map((e) => String(e.business || "").toLowerCase()));
  const toAdd: any[] = [];
  rows.slice(0, 5000).forEach((r, i) => {
    const business = clip(r.business, 150) || clip(r.contactName, 100);
    const phone = phoneOf(r.phone);
    const email = clip(r.email, 150)?.toLowerCase() || null;
    if (!business) { out.skipped++; if (out.problems.length < 20) out.problems.push(`Row ${i + 2}: no business or person name`); return; }
    if (!phone && !email) { out.skipped++; if (out.problems.length < 20) out.problems.push(`Row ${i + 2} (${business}): no phone or email`); return; }
    const key = phone || email!;
    if ((phone && phones.has(phone)) || (!phone && email && emails.has(email)) || (!phone && !email && names.has(business.toLowerCase()))) { out.duplicates++; return; }
    if (phone) phones.add(phone); if (email) emails.add(email);
    const ind = r.industry ? guessIndustry(String(r.industry)) : null;
    toAdd.push({
      business, contact_name: clip(r.contactName, 100), phone, email, city: clip(r.city, 80),
      industry: ind && ind !== "other" ? ind : INDUSTRY_KEYS.includes(o.defaultIndustry as any) ? o.defaultIndustry : guessIndustry(r.industry, business),
      notes: clip(r.notes, 2000), stage: "new", source: SOURCES[o.source] ? o.source : "other", owner: o.owner || null,
      created_by: o.by, import_batch: o.batch || null, last_activity_at: new Date().toISOString(),
    });
    void key;
  });
  for (let i = 0; i < toAdd.length; i += 500) {
    const chunk = toAdd.slice(i, i + 500);
    const res = await sb<any[]>(`/crm_deals?select=id`, { method: "POST", body: JSON.stringify(chunk) });
    out.added += chunk.length; out.addedIds.push(...(res || []).map((x) => x.id));
  }
  return out;
}

/** Website demo requests and proof runs become leads automatically (once each). */
export async function importDemoRequests(): Promise<number> {
  const reqs = (await sb<any[]>(`/demo_requests?order=created_at.asc&limit=500&select=id,created_at,name,phone,email,company,industry,city,kind,wants,volume,best_time,message,status,lead_count`).catch(() => [])) || [];
  if (!reqs.length) return 0;
  const have = (await sb<any[]>(`/crm_deals?demo_request_id=not.is.null&select=demo_request_id`).catch(() => [])) || [];
  const seen = new Set(have.map((h) => h.demo_request_id));
  const map: Record<string, Stage> = { new: "new", contacted: "contacted", demo_booked: "prospect", won: "deal", lost: "not_interested" };
  const rows = reqs.filter((r) => !seen.has(r.id)).map((r) => ({
    business: r.company || r.name || "Website enquiry", contact_name: r.name || null, phone: phoneOf(r.phone), email: r.email || null,
    city: r.city || null, industry: guessIndustry(r.industry, r.company), source: r.kind === "proof" ? "proof" : "website", stage: map[r.status] || "new",
    demo_request_id: r.id, created_at: r.created_at, created_by: "website", last_activity_at: r.created_at,
    notes: [r.wants && `Wants: ${r.wants}`, r.volume && `Volume: ${r.volume}`, r.best_time && `Best time: ${r.best_time}`, r.lead_count && `Proof-run leads: ${r.lead_count}`, r.message].filter(Boolean).join("\n") || null,
  }));
  if (!rows.length) return 0;
  await sb(`/crm_deals`, { method: "POST", prefer: "return=minimal", body: JSON.stringify(rows) });
  return rows.length;
}

/* ───────────── column matching for uploads and sheets ───────────── */

export const LEAD_FIELDS = [
  { key: "business", label: "Business name", words: ["business", "company", "firm", "organisation", "organization", "brand", "shop", "store", "clinic", "hospital", "school", "account", "lead name", "name of business"] },
  { key: "contactName", label: "Contact person", words: ["contact", "person", "owner", "name", "customer", "client", "full name", "first name"] },
  { key: "phone", label: "Phone", words: ["phone", "mobile", "number", "contact no", "whatsapp", "cell", "ph", "mob", "tel"] },
  { key: "email", label: "Email", words: ["email", "e-mail", "mail"] },
  { key: "city", label: "City", words: ["city", "location", "area", "town", "place", "district", "state"] },
  { key: "industry", label: "Industry", words: ["industry", "sector", "category", "segment", "type", "vertical", "domain"] },
  { key: "notes", label: "Notes", words: ["note", "notes", "remark", "remarks", "comment", "comments", "requirement", "details", "description"] },
] as const;
export type LeadField = (typeof LEAD_FIELDS)[number]["key"] | "ignore";

/** Which column is which, from the header row (with a peek at the values for phone/email). */
export function guessLeadColumns(header: string[], body: string[][]): LeadField[] {
  const used = new Set<string>();
  const out: LeadField[] = header.map(() => "ignore");
  const h = header.map((x) => String(x || "").toLowerCase().trim());
  const order: LeadField[] = ["email", "phone", "business", "industry", "city", "notes", "contactName"];
  for (const f of order) {
    const def = LEAD_FIELDS.find((x) => x.key === f)!;
    let best = -1;
    h.forEach((col, i) => { if (best < 0 && out[i] === "ignore" && !used.has(f) && def.words.some((w) => col === w || col.includes(w))) best = i; });
    if (best < 0 && (f === "phone" || f === "email")) {
      h.forEach((_, i) => {
        if (best >= 0 || out[i] !== "ignore") return;
        const vals = body.slice(0, 20).map((r) => String(r[i] || ""));
        const hits = vals.filter((v) => (f === "email" ? /@/.test(v) : v.replace(/\D/g, "").length >= 10)).length;
        if (hits >= Math.max(1, vals.filter(Boolean).length * 0.6)) best = i;
      });
    }
    if (best >= 0) { out[best] = f; used.add(f); }
  }
  // A lone "Name" column with no business column → treat it as the business.
  if (!used.has("business") && used.has("contactName")) out[out.indexOf("contactName")] = "business";
  return out;
}
export function rowsToLeads(body: string[][], map: LeadField[]): LeadIn[] {
  return body.map((r) => {
    const o: any = {};
    map.forEach((f, i) => { if (f !== "ignore") { const v = String(r[i] ?? "").trim(); if (v) o[f] = o[f] ? `${o[f]} ${v}` : v; } });
    return o as LeadIn;
  }).filter((o) => Object.keys(o).length);
}

/** Google Sheet link → its CSV export link (the sheet must be shared as "Anyone with the link can view"). */
export function sheetCsvUrl(url: string): string | null {
  const m = String(url || "").match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/);
  if (!m) return null;
  const gid = String(url).match(/[#&?]gid=(\d+)/)?.[1];
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv${gid ? `&gid=${gid}` : ""}`;
}

/* ───────────── hot AI calls on RANA's own line → leads ───────────── */

/** RANA HQ's own workspace id (its calls are RANA's sales calls, not a client's). Cached per instance. */
let hqIdCache: string | null = null;
export async function hqClientId(): Promise<string | null> {
  if (hqIdCache) return hqIdCache;
  const [c] = (await sb<any[]>(`/clients?is_hq=eq.true&select=id&limit=1`).catch(() => [])) || [];
  hqIdCache = c?.id || null;
  return hqIdCache;
}
const HOT_CALL = ["hot", "ready_to_close"];
/** Hot / ready-to-close calls on RANA HQ's line whose number isn't in the CRM yet (preview or import). */
export async function hotCallsNotInCrm(): Promise<any[]> {
  const hq = await hqClientId();
  if (!hq) return [];
  const calls = (await sb<any[]>(`/calls?client_id=eq.${hq}&lead_status=in.(${HOT_CALL.join(",")})&order=created_at.desc&limit=500&select=id,caller_phone,caller_name,summary,lead_status,lead_reason,created_at,agent_variables`).catch(() => [])) || [];
  const have = await sbAll<any>(`/crm_deals?phone=not.is.null&select=phone&order=id.asc`).catch(() => [] as any[]);
  const phones = new Set(have.map((h) => last10(h.phone)).filter(Boolean));
  const out: any[] = []; const seen = new Set<string>();
  for (const c of calls) {
    if (!/^\+?\d[\d\s-]{7,}$/.test(String(c.caller_phone || ""))) continue; // skip website test calls ("website…")
    const phone = phoneOf(c.caller_phone);
    const k = last10(phone);
    if (!phone || !k || phones.has(k) || seen.has(k)) continue;
    seen.add(k); out.push({ ...c, phone });
  }
  return out;
}
export async function importHotCalls(by: string): Promise<number> {
  const list = await hotCallsNotInCrm();
  if (!list.length) return 0;
  const v = (c: any, k: string) => clip(c.agent_variables?.[k], 150);
  const rows = list.map((c) => ({
    business: v(c, "business") || v(c, "company") || clip(c.caller_name, 100) || `Caller ${c.phone}`,
    contact_name: clip(c.caller_name, 100), phone: c.phone, city: v(c, "city"),
    industry: guessIndustry(v(c, "industry"), v(c, "business"), c.summary), source: "ai_call", stage: "new", created_by: by,
    notes: [`AI call (${c.lead_status === "ready_to_close" ? "ready to close" : "hot"}) on ${new Date(c.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`, c.lead_reason, c.summary].filter(Boolean).join("\n").slice(0, 4000),
    created_at: c.created_at, last_activity_at: c.created_at,
  }));
  await sb(`/crm_deals`, { method: "POST", prefer: "return=minimal", body: JSON.stringify(rows) });
  return rows.length;
}

/** Active RANA HQ teammates' emails (tasks can only be given to them; the morning email goes to the owner). */
export async function hqStaffEmails(clientId: string): Promise<Set<string>> {
  const rows = (await sb<any[]>(`/users?client_id=eq.${encodeURIComponent(clientId)}&is_active=eq.true&select=email&limit=500`).catch(() => [])) || [];
  return new Set(rows.map((r) => String(r.email || "").toLowerCase()).filter(Boolean));
}
