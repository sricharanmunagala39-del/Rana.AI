// RANA HQ → Sales CRM: RANA AI's own prospects and deals (not clients' leads).
import { sb } from "./db";
import { PLANS, MAX_SALES_DISCOUNT, YEARLY_MONTHS_PAID } from "./pricing";

export const STAGES = [
  { key: "new", label: "New", hint: "Not contacted yet" },
  { key: "contacted", label: "Contacted", hint: "Spoke once, interested" },
  { key: "demo_booked", label: "Demo booked", hint: "Meeting on the calendar" },
  { key: "demo_done", label: "Demo done", hint: "Saw RANA working" },
  { key: "proposal", label: "Proposal / negotiation", hint: "Price and plan shared" },
  { key: "won", label: "Won", hint: "Paid or signed" },
  { key: "lost", label: "Lost", hint: "Not now" },
] as const;
export type Stage = (typeof STAGES)[number]["key"];
export const STAGE_KEYS = STAGES.map((s) => s.key) as Stage[];
export const OPEN_STAGES: Stage[] = ["new", "contacted", "demo_booked", "demo_done", "proposal"];

export const SOURCES: Record<string, string> = {
  manual: "Added by team", website: "Website demo form", proof: "Free proof run", ai_call: "AI sales call",
  referral: "Referral", walk_in: "Walk-in / event", linkedin: "LinkedIn", whatsapp: "WhatsApp", other: "Other",
};
export const ACTIVITY_KINDS: Record<string, string> = {
  note: "Note", call: "Call", whatsapp: "WhatsApp", email: "Email", meeting: "Meeting", stage: "Stage change", system: "Update",
};
export const DEAL_PLANS = ["starter", "growth", "scale", "enterprise"] as const;

/** Monthly value of a deal: list price minus the discount offered (enterprise has no list price). */
export function dealMonthly(d: { plan?: string | null; discount_pct?: number | string | null }): number {
  const p = d.plan && d.plan !== "enterprise" ? (PLANS as any)[d.plan] : null;
  if (!p?.pricePerMonth) return 0;
  const pct = Math.min(MAX_SALES_DISCOUNT, Math.max(0, Number(d.discount_pct) || 0));
  return Math.round(p.pricePerMonth * (1 - pct / 100));
}
/** What the client pays for the first period: one month, or a year (10 months' price) on yearly. */
export function dealFirstPayment(d: { plan?: string | null; discount_pct?: number | string | null; billing?: string | null }): number {
  const m = dealMonthly(d);
  return d.billing === "yearly" ? m * YEARLY_MONTHS_PAID : m;
}

const clip = (v: any, n: number) => { const s = String(v ?? "").trim().slice(0, n); return s || null; };
const phoneOf = (v: any) => { const d = String(v ?? "").replace(/[^\d+]/g, ""); return d ? (d.startsWith("+") ? d : d.length === 10 ? `+91${d}` : d) : null; };

/** Clean a create/update body into table columns. Only keys present in `b` are returned. */
export function dealPatch(b: any): { patch: any; error?: string } {
  const patch: any = {};
  if ("business" in b) { patch.business = clip(b.business, 150); if (!patch.business) return { patch, error: "Enter the business name." }; }
  if ("contactName" in b) patch.contact_name = clip(b.contactName, 100);
  if ("phone" in b) patch.phone = phoneOf(b.phone);
  if ("email" in b) { const e = clip(b.email, 150)?.toLowerCase() || null; if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { patch, error: "That email doesn't look right." }; patch.email = e; }
  if ("city" in b) patch.city = clip(b.city, 80);
  if ("industry" in b) patch.industry = clip(b.industry, 80);
  if ("source" in b) patch.source = SOURCES[b.source] ? b.source : "other";
  if ("stage" in b) { if (!STAGE_KEYS.includes(b.stage)) return { patch, error: "Unknown stage." }; patch.stage = b.stage; }
  if ("plan" in b) patch.plan = DEAL_PLANS.includes(b.plan) ? b.plan : null;
  if ("billing" in b) patch.billing = b.billing === "yearly" ? "yearly" : "monthly";
  if ("discountPct" in b) { const p = Math.round(Number(b.discountPct) || 0); if (p < 0 || p > MAX_SALES_DISCOUNT) return { patch, error: `Discount must be 0–${MAX_SALES_DISCOUNT}%.` }; patch.discount_pct = p; }
  if ("owner" in b) patch.owner = clip(b.owner, 150)?.toLowerCase() || null;
  if ("nextAction" in b) patch.next_action = clip(b.nextAction, 200);
  if ("nextActionAt" in b) { const t = b.nextActionAt ? Date.parse(b.nextActionAt) : NaN; patch.next_action_at = Number.isFinite(t) ? new Date(t).toISOString() : null; }
  if ("lostReason" in b) patch.lost_reason = clip(b.lostReason, 300);
  if ("notes" in b) patch.notes = clip(b.notes, 4000);
  if ("clientId" in b) patch.client_id = /^[0-9a-f-]{36}$/i.test(String(b.clientId || "")) ? b.clientId : null;
  return { patch };
}

export async function addActivity(dealId: string, kind: string, text: string, by: string | null) {
  await sb(`/crm_activities`, { method: "POST", prefer: "return=minimal", body: JSON.stringify({ deal_id: dealId, kind: ACTIVITY_KINDS[kind] ? kind : "note", text: String(text).slice(0, 2000), created_by: by }) });
}

/** Website demo requests and proof runs become deals automatically (once each). */
export async function importDemoRequests(): Promise<number> {
  const reqs = (await sb<any[]>(`/demo_requests?order=created_at.asc&limit=500&select=id,created_at,name,phone,email,company,industry,city,kind,wants,volume,best_time,message,status,lead_count`).catch(() => [])) || [];
  if (!reqs.length) return 0;
  const have = (await sb<any[]>(`/crm_deals?demo_request_id=not.is.null&select=demo_request_id`).catch(() => [])) || [];
  const seen = new Set(have.map((h) => h.demo_request_id));
  const map: Record<string, string> = { new: "new", contacted: "contacted", demo_booked: "demo_booked", won: "won", lost: "lost" };
  const rows = reqs.filter((r) => !seen.has(r.id)).map((r) => ({
    business: r.company || r.name || "Website enquiry", contact_name: r.name || null, phone: phoneOf(r.phone), email: r.email || null,
    city: r.city || null, industry: r.industry || null, source: r.kind === "proof" ? "proof" : "website", stage: map[r.status] || "new",
    demo_request_id: r.id, created_at: r.created_at, created_by: "website",
    notes: [r.wants && `Wants: ${r.wants}`, r.volume && `Volume: ${r.volume}`, r.best_time && `Best time: ${r.best_time}`, r.lead_count && `Proof-run leads: ${r.lead_count}`, r.message].filter(Boolean).join("\n") || null,
  }));
  if (!rows.length) return 0;
  await sb(`/crm_deals`, { method: "POST", prefer: "return=minimal", body: JSON.stringify(rows) });
  return rows.length;
}
