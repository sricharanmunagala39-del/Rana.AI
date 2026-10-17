// Production storage on RANA's Supabase (tables from supabase/migrations/20261017_sales_engine.sql).
// Also checks the existing do-not-call list (dnc_numbers) and the Sales CRM (crm_deals), and writes outcomes back.
import { sb, inList } from "../db";
import { addDnc } from "../compliance";
import type { Store, SuppressionHit } from "./store";
import type { Booking, Campaign, CampaignConfig, EngineEvent, EventKind, Prospect } from "./types";
import type { CrmAdapter, CrmUpdate } from "./crmAdapter";
import { bestContact } from "./scoring";

const enc = encodeURIComponent;
/** A value inside a PostgREST or=(...) filter: quoted, because emails, timestamps and phones contain . : + characters. */
const q = (v: string) => encodeURIComponent(`"${String(v).replace(/"/g, '\\"')}"`);

function toCampaign(r: any): Campaign {
  return {
    id: r.id, name: r.name, config: r.config, configHash: r.config_hash, status: r.status, phase: r.phase, mode: r.mode,
    sourcesDone: r.sources_done || [], sourceTries: r.source_tries || {}, nextRunAt: r.next_run_at, log: r.log || [], lockUntil: r.lock_until,
    createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at, completedAt: r.completed_at,
  };
}
const CAMPAIGN_COLS: Record<string, string> = {
  name: "name", config: "config", configHash: "config_hash", status: "status", phase: "phase", mode: "mode", sourcesDone: "sources_done",
  sourceTries: "source_tries", nextRunAt: "next_run_at", log: "log", lockUntil: "lock_until", createdBy: "created_by", completedAt: "completed_at",
};
function campaignRow(p: Partial<Campaign>) {
  const out: any = {};
  for (const [k, v] of Object.entries(p)) if (CAMPAIGN_COLS[k]) out[CAMPAIGN_COLS[k]] = v;
  return out;
}

/** Columns kept outside the JSON blob so they can be filtered and indexed. */
const P_COLS = ["status", "nextActionAt", "score"] as const;
function toProspect(r: any): Prospect {
  return { ...(r.data || {}), id: r.id, campaignId: r.campaign_id, key: r.key, status: r.status, nextActionAt: r.next_action_at, score: r.score, createdAt: r.created_at, updatedAt: r.updated_at };
}
function prospectData(p: Partial<Prospect>) {
  const { id: _i, campaignId: _c, key: _k, status: _s, nextActionAt: _n, score: _sc, createdAt: _ca, updatedAt: _u, ...data } = p as any;
  return data;
}
function phoneOfProspect(p: Partial<Prospect>): string | null {
  if (!p.company) return null;
  return bestContact({ contacts: p.contacts || [], company: p.company } as any).phone || p.company.phone || null;
}

export class SupabaseStore implements Store {
  constructor(private hqClientId: string | null) {}

  async createCampaign(c: Omit<Campaign, "id" | "createdAt" | "updatedAt">) {
    const [r] = await sb<any[]>(`/se_campaigns`, { method: "POST", body: JSON.stringify(campaignRow(c)) });
    return toCampaign(r);
  }
  async getCampaign(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const [r] = (await sb<any[]>(`/se_campaigns?id=eq.${id}&limit=1`)) || [];
    return r ? toCampaign(r) : null;
  }
  async updateCampaign(id: string, patch: Partial<Campaign>) {
    const [r] = await sb<any[]>(`/se_campaigns?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ ...campaignRow(patch), updated_at: new Date().toISOString() }) });
    return toCampaign(r);
  }
  async listCampaigns(limit = 50) { return ((await sb<any[]>(`/se_campaigns?order=created_at.desc&limit=${limit}`)) || []).map(toCampaign); }
  async findOpenByHash(hash: string) {
    const [r] = (await sb<any[]>(`/se_campaigns?config_hash=eq.${enc(hash)}&status=in.(running,paused)&limit=1`)) || [];
    return r ? toCampaign(r) : null;
  }
  async lock(id: string, until: Date, now: Date) {
    // Atomic: only matches when nobody holds an unexpired lock.
    const rows = await sb<any[]>(`/se_campaigns?id=eq.${id}&or=(lock_until.is.null,lock_until.lt.${q(now.toISOString())})`, { method: "PATCH", body: JSON.stringify({ lock_until: until.toISOString() }) });
    return (rows || []).length === 1;
  }
  async unlock(id: string) { await sb(`/se_campaigns?id=eq.${id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ lock_until: null }) }); }

  async insertProspect(p: Omit<Prospect, "id" | "createdAt" | "updatedAt">) {
    const row = { campaign_id: p.campaignId, key: p.key, status: p.status, next_action_at: p.nextActionAt, score: p.score, phone: phoneOfProspect(p), data: prospectData(p) };
    const ins = await sb<any[]>(`/se_prospects?on_conflict=campaign_id,key`, { method: "POST", prefer: "resolution=ignore-duplicates,return=representation", body: JSON.stringify(row) });
    if (ins?.length) return { prospect: toProspect(ins[0]), created: true };
    const [r] = await sb<any[]>(`/se_prospects?campaign_id=eq.${p.campaignId}&key=eq.${enc(p.key)}&limit=1`);
    return { prospect: toProspect(r), created: false };
  }
  async getProspect(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const [r] = (await sb<any[]>(`/se_prospects?id=eq.${id}&limit=1`)) || [];
    return r ? toProspect(r) : null;
  }
  async updateProspect(id: string, patch: Partial<Prospect>) {
    const cur = await this.getProspect(id);
    if (!cur) throw new Error("Prospect not found");
    const merged = { ...cur, ...patch };
    const row: any = { data: prospectData(merged), updated_at: new Date().toISOString(), phone: phoneOfProspect(merged) };
    for (const k of P_COLS) if (k in patch) row[k === "nextActionAt" ? "next_action_at" : k] = (patch as any)[k];
    const [r] = await sb<any[]>(`/se_prospects?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(row) });
    return toProspect(r);
  }
  async listProspects(campaignId: string, opts: { statuses?: string[]; limit?: number } = {}) {
    const st = opts.statuses ? `&status=in.${inList(opts.statuses)}` : "";
    const out: Prospect[] = [];
    const max = opts.limit ?? 5000;
    for (let off = 0; off < max; off += 1000) {
      const page = (await sb<any[]>(`/se_prospects?campaign_id=eq.${campaignId}${st}&order=created_at.asc,id.asc&limit=${Math.min(1000, max - off)}&offset=${off}`)) || [];
      out.push(...page.map(toProspect));
      if (page.length < 1000) break;
    }
    return out;
  }
  async findOtherCampaignProspect(campaignId: string, key: string, phone: string | null) {
    const or = phone ? `&or=(key.eq.${q(key)},phone.eq.${q(phone)})` : `&key=eq.${enc(key)}`;
    const [r] = (await sb<any[]>(`/se_prospects?campaign_id=neq.${campaignId}${or}&limit=1`)) || [];
    return r ? toProspect(r) : null;
  }

  async checkSuppression(x: { phone?: string | null; email?: string | null; domain?: string | null }): Promise<SuppressionHit> {
    const ors = [x.phone && `phone.eq.${q(x.phone)}`, x.email && `email.eq.${q(x.email.toLowerCase())}`, x.domain && `domain.eq.${q(x.domain)}`].filter(Boolean);
    if (ors.length) {
      const [s] = (await sb<any[]>(`/se_suppressions?or=(${ors.join(",")})&limit=1`)) || [];
      if (s) return { reason: s.reason, source: s.source };
    }
    if (x.phone && this.hqClientId) {
      const [d] = (await sb<any[]>(`/dnc_numbers?client_id=eq.${this.hqClientId}&phone=eq.${enc(x.phone)}&select=reason&limit=1`)) || [];
      if (d) return { reason: `On RANA's do-not-call list${d.reason ? ` (${d.reason})` : ""}`, source: "dnc" };
    }
    const crmOr = [x.phone && `phone.eq.${q(x.phone)}`, x.email && `email.eq.${q(x.email.toLowerCase())}`].filter(Boolean);
    if (crmOr.length) {
      const [c] = (await sb<any[]>(`/crm_deals?or=(${crmOr.join(",")})&select=business,stage,owner,source&limit=1`)) || [];
      if (c && c.source !== "ai_call") return { reason: `Already in the Sales CRM (${c.business}, stage ${c.stage}${c.owner ? `, owner ${c.owner}` : ""}) — the team owns this lead`, source: "crm" };
      if (c && c.stage === "not_interested") return { reason: "Marked not interested in the Sales CRM", source: "crm" };
    }
    return null;
  }
  async suppress(x: { phone?: string | null; email?: string | null; domain?: string | null; reason: string; source: string }) {
    await sb(`/se_suppressions`, { method: "POST", prefer: "return=minimal", body: JSON.stringify({ phone: x.phone || null, email: x.email?.toLowerCase() || null, domain: x.domain || null, reason: x.reason, source: x.source }) });
    // Opt-outs also join RANA's existing do-not-call list, which every other campaign already checks.
    if (x.phone && this.hqClientId && x.source === "opt_out") await addDnc(this.hqClientId, [{ phone: x.phone, source: "caller_request", reason: x.reason }]).catch(() => {});
  }

  async addEvent(campaignId: string, prospectId: string | null, kind: EventKind, data: any) {
    await sb(`/se_events`, { method: "POST", prefer: "return=minimal", body: JSON.stringify({ campaign_id: campaignId, prospect_id: prospectId, kind, data }) });
  }
  async listEvents(campaignId: string, limit = 2000): Promise<EngineEvent[]> {
    const rows = (await sb<any[]>(`/se_events?campaign_id=eq.${campaignId}&order=at.asc&limit=${limit}`)) || [];
    return rows.map((r) => ({ id: r.id, campaignId: r.campaign_id, prospectId: r.prospect_id, kind: r.kind, data: r.data, at: r.at }));
  }

  async listPresets() {
    return ((await sb<any[]>(`/se_presets?order=updated_at.desc&limit=100`)) || []).map((r) => ({ id: r.id, name: r.name, config: r.config, updatedAt: r.updated_at }));
  }
  async savePreset(name: string, config: CampaignConfig, by: string) {
    await sb(`/se_presets?on_conflict=name_key`, { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: JSON.stringify({ name, name_key: name.trim().toLowerCase(), config, updated_by: by, updated_at: new Date().toISOString() }) });
  }

  async listBookings(fromIso: string, toIso: string): Promise<Booking[]> {
    const rows = (await sb<any[]>(`/se_bookings?status=eq.confirmed&slot_start=gte.${enc(fromIso)}&slot_start=lt.${enc(toIso)}&order=slot_start.asc`)) || [];
    return rows.map(toBooking);
  }
  async createBooking(b: Omit<Booking, "id" | "createdAt">) {
    // The unique index on confirmed slot_start rejects a double booking with HTTP 409.
    const [r] = await sb<any[]>(`/se_bookings`, { method: "POST", body: JSON.stringify({
      campaign_id: b.campaignId, prospect_id: b.prospectId, slot_start: b.slotStart, slot_end: b.slotEnd, timezone: b.timezone, company: b.company,
      contact_name: b.contactName, phone: b.phone, email: b.email, notes: b.notes, status: b.status,
    }) });
    return toBooking(r);
  }
  async bookingForProspect(prospectId: string) {
    const [r] = (await sb<any[]>(`/se_bookings?prospect_id=eq.${prospectId}&status=eq.confirmed&limit=1`)) || [];
    return r ? toBooking(r) : null;
  }
}

function toBooking(r: any): Booking {
  return { id: r.id, campaignId: r.campaign_id, prospectId: r.prospect_id, slotStart: new Date(r.slot_start).toISOString(), slotEnd: new Date(r.slot_end).toISOString(), timezone: r.timezone, company: r.company, contactName: r.contact_name, phone: r.phone, email: r.email, notes: r.notes, status: r.status, createdAt: r.created_at };
}

const CRM_INDUSTRY: Record<string, string> = { real_estate: "real_estate", education: "education", healthcare: "healthcare", hospitality: "hospitality", recruitment: "other", other: "other" };
const STAGE_RANK: Record<string, number> = { new: 0, contacted: 1, prospect: 2, deal: 3, not_interested: 1 };

/** RANA HQ Sales CRM. One deal per phone (else email); never moves a deal backwards or off "Deal". */
export class SupabaseCrm implements CrmAdapter {
  id = "supabase";
  async upsert(p: Prospect, u: CrmUpdate): Promise<string> {
    const best = bestContact(p);
    const email = best.person?.email || p.company.email || null;
    let deal: any = null;
    if (p.crmDealId) [deal] = (await sb<any[]>(`/crm_deals?id=eq.${p.crmDealId}&limit=1`)) || [];
    if (!deal && best.phone) [deal] = (await sb<any[]>(`/crm_deals?phone=eq.${enc(best.phone)}&limit=1`)) || [];
    if (!deal && email) [deal] = (await sb<any[]>(`/crm_deals?email=eq.${enc(email)}&limit=1`)) || [];
    const now = new Date().toISOString();
    if (!deal) {
      [deal] = await sb<any[]>(`/crm_deals`, { method: "POST", body: JSON.stringify({
        business: p.company.name.slice(0, 150), contact_name: best.person?.name?.slice(0, 100) || null, phone: best.phone, email, city: p.company.city,
        industry: CRM_INDUSTRY[p.company.industry] || "other", source: "ai_call", stage: u.stage, next_action: u.nextAction ?? null, next_action_at: u.nextActionAt ?? null,
        lost_reason: u.lostReason ?? null, notes: [p.company.website, p.statusReason].filter(Boolean).join("\n") || null, created_by: "sales-engine", last_activity_at: now, last_contact_at: now,
      }) });
    } else {
      const forward = deal.stage !== "deal" && (STAGE_RANK[u.stage] ?? 0) >= (STAGE_RANK[deal.stage] ?? 0);
      const patch: any = { last_activity_at: now, last_contact_at: now, updated_at: now };
      if (forward) Object.assign(patch, { stage: u.stage, next_action: u.nextAction ?? deal.next_action, next_action_at: u.nextActionAt ?? deal.next_action_at, ...(u.lostReason ? { lost_reason: u.lostReason } : {}) });
      await sb(`/crm_deals?id=eq.${deal.id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify(patch) });
    }
    await sb(`/crm_activities`, { method: "POST", prefer: "return=minimal", body: JSON.stringify({ deal_id: deal.id, kind: "call", text: u.note.slice(0, 2000), created_by: "sales-engine" }) });
    return deal.id;
  }
}

/** Uncalled leads already in the CRM, as campaign input (source "crm"). */
export async function crmLeadsForIndustry(industry: string, limit: number) {
  const ind = CRM_INDUSTRY[industry] || "other";
  const rows = (await sb<any[]>(`/crm_deals?stage=eq.new&industry=eq.${ind}&phone=not.is.null&select=business,contact_name,phone,email,city&order=created_at.desc&limit=${Math.min(500, limit)}`).catch(() => [])) || [];
  return rows.map((r) => ({ business: r.business, phone: r.phone, email: r.email, city: r.city, contactName: r.contact_name }));
}
