// Storage the engine runs on. Two implementations: MemoryStore (tests, local dry runs) and SupabaseStore
// (production, tables from supabase/migrations/*_sales_engine.sql). The engine only ever talks to this interface.
import type { Booking, Campaign, CampaignConfig, EngineEvent, EventKind, Prospect } from "./types";

export type SuppressionHit = { reason: string; source: string } | null;

export interface Store {
  createCampaign(c: Omit<Campaign, "id" | "createdAt" | "updatedAt">): Promise<Campaign>;
  getCampaign(id: string): Promise<Campaign | null>;
  updateCampaign(id: string, patch: Partial<Campaign>): Promise<Campaign>;
  listCampaigns(limit?: number): Promise<Campaign[]>;
  /** A campaign with the same settings that is still running or paused (stops double launches). */
  findOpenByHash(hash: string): Promise<Campaign | null>;
  /** Take the campaign's work lock until `until`. False when another worker holds it. */
  lock(id: string, until: Date, now: Date): Promise<boolean>;
  unlock(id: string): Promise<void>;

  /** Insert unless this campaign already has the key. */
  insertProspect(p: Omit<Prospect, "id" | "createdAt" | "updatedAt">): Promise<{ prospect: Prospect; created: boolean }>;
  getProspect(id: string): Promise<Prospect | null>;
  updateProspect(id: string, patch: Partial<Prospect>): Promise<Prospect>;
  listProspects(campaignId: string, opts?: { statuses?: string[]; limit?: number }): Promise<Prospect[]>;
  /** The same company or number in another campaign (any status) — so nobody is called twice by two campaigns. */
  findOtherCampaignProspect(campaignId: string, key: string, phone: string | null): Promise<Prospect | null>;

  /** Opt-outs, do-not-call numbers and existing CRM ownership. */
  checkSuppression(x: { phone?: string | null; email?: string | null; domain?: string | null }): Promise<SuppressionHit>;
  suppress(x: { phone?: string | null; email?: string | null; domain?: string | null; reason: string; source: string }): Promise<void>;

  addEvent(campaignId: string, prospectId: string | null, kind: EventKind, data: any): Promise<void>;
  listEvents(campaignId: string, limit?: number): Promise<EngineEvent[]>;

  listPresets(): Promise<{ id: string; name: string; config: CampaignConfig; updatedAt: string }[]>;
  savePreset(name: string, config: CampaignConfig, by: string): Promise<void>;

  listBookings(fromIso: string, toIso: string): Promise<Booking[]>;
  /** Fails (throws) when the slot is already taken — the database unique index is the real guard. */
  createBooking(b: Omit<Booking, "id" | "createdAt">): Promise<Booking>;
  bookingForProspect(prospectId: string): Promise<Booking | null>;
}

let n = 0;
const uid = () => `${Date.now().toString(36)}-${(n++).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

/** In-memory store. Same rules as the database version, including unique keys and slot conflicts. */
export class MemoryStore implements Store {
  campaigns = new Map<string, Campaign>();
  prospects = new Map<string, Prospect>();
  events: EngineEvent[] = [];
  presets = new Map<string, { id: string; name: string; config: CampaignConfig; updatedAt: string }>();
  bookings: Booking[] = [];
  suppressions: { phone?: string | null; email?: string | null; domain?: string | null; reason: string; source: string }[] = [];
  /** Phones/emails already owned by the human sales team (mirrors crm_deals). */
  crmPhones = new Set<string>();
  crmEmails = new Set<string>();
  /** Test hook: make a method throw once. */
  failNext: Record<string, string> = {};

  private maybeFail(name: string) {
    if (this.failNext[name]) { const m = this.failNext[name]; delete this.failNext[name]; throw new Error(m); }
  }

  async createCampaign(c: Omit<Campaign, "id" | "createdAt" | "updatedAt">) {
    const now = new Date().toISOString();
    const row: Campaign = { ...clone(c), id: uid(), createdAt: now, updatedAt: now };
    this.campaigns.set(row.id, row);
    return clone(row);
  }
  async getCampaign(id: string) { const c = this.campaigns.get(id); return c ? clone(c) : null; }
  async updateCampaign(id: string, patch: Partial<Campaign>) {
    const c = this.campaigns.get(id); if (!c) throw new Error("Campaign not found");
    const row = { ...c, ...clone(patch), updatedAt: new Date().toISOString() };
    this.campaigns.set(id, row); return clone(row);
  }
  async listCampaigns(limit = 50) { return [...this.campaigns.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit).map(clone); }
  async findOpenByHash(hash: string) {
    const c = [...this.campaigns.values()].find((x) => x.configHash === hash && (x.status === "running" || x.status === "paused"));
    return c ? clone(c) : null;
  }
  async lock(id: string, until: Date, now: Date) {
    const c = this.campaigns.get(id); if (!c) return false;
    if (c.lockUntil && Date.parse(c.lockUntil) > now.getTime()) return false;
    c.lockUntil = until.toISOString(); return true;
  }
  async unlock(id: string) { const c = this.campaigns.get(id); if (c) c.lockUntil = null; }

  async insertProspect(p: Omit<Prospect, "id" | "createdAt" | "updatedAt">) {
    this.maybeFail("insertProspect");
    const existing = [...this.prospects.values()].find((x) => x.campaignId === p.campaignId && x.key === p.key);
    if (existing) return { prospect: clone(existing), created: false };
    const now = new Date().toISOString();
    const row: Prospect = { ...clone(p), id: uid(), createdAt: now, updatedAt: now };
    this.prospects.set(row.id, row);
    return { prospect: clone(row), created: true };
  }
  async getProspect(id: string) { const p = this.prospects.get(id); return p ? clone(p) : null; }
  async updateProspect(id: string, patch: Partial<Prospect>) {
    this.maybeFail("updateProspect");
    const p = this.prospects.get(id); if (!p) throw new Error("Prospect not found");
    const row = { ...p, ...clone(patch), updatedAt: new Date().toISOString() };
    this.prospects.set(id, row); return clone(row);
  }
  async listProspects(campaignId: string, opts: { statuses?: string[]; limit?: number } = {}) {
    return [...this.prospects.values()]
      .filter((p) => p.campaignId === campaignId && (!opts.statuses || opts.statuses.includes(p.status)))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .slice(0, opts.limit ?? 10_000).map(clone);
  }
  async findOtherCampaignProspect(campaignId: string, key: string, phone: string | null) {
    const p = [...this.prospects.values()].find((x) => x.campaignId !== campaignId && (x.key === key || (!!phone && x.company.phone === phone)));
    return p ? clone(p) : null;
  }

  async checkSuppression(x: { phone?: string | null; email?: string | null; domain?: string | null }) {
    const hit = this.suppressions.find((s) => (x.phone && s.phone === x.phone) || (x.email && s.email === x.email?.toLowerCase()) || (x.domain && s.domain === x.domain));
    if (hit) return { reason: hit.reason, source: hit.source };
    if (x.phone && this.crmPhones.has(x.phone)) return { reason: "Already in the Sales CRM — the team owns this lead", source: "crm" };
    if (x.email && this.crmEmails.has(x.email.toLowerCase())) return { reason: "Already in the Sales CRM — the team owns this lead", source: "crm" };
    return null;
  }
  async suppress(x: { phone?: string | null; email?: string | null; domain?: string | null; reason: string; source: string }) {
    this.suppressions.push({ ...x, email: x.email?.toLowerCase() ?? null });
  }

  async addEvent(campaignId: string, prospectId: string | null, kind: EventKind, data: any) {
    this.events.push({ id: uid(), campaignId, prospectId, kind, data: clone(data ?? null), at: new Date().toISOString() });
  }
  async listEvents(campaignId: string, limit = 500) { return this.events.filter((e) => e.campaignId === campaignId).slice(-limit).map(clone); }

  async listPresets() { return [...this.presets.values()].map(clone); }
  async savePreset(name: string, config: CampaignConfig) {
    const old = this.presets.get(name.toLowerCase());
    this.presets.set(name.toLowerCase(), { id: old?.id || uid(), name, config: clone(config), updatedAt: new Date().toISOString() });
  }

  async listBookings(fromIso: string, toIso: string) {
    return this.bookings.filter((b) => b.status === "confirmed" && b.slotStart >= fromIso && b.slotStart < toIso).map(clone);
  }
  async createBooking(b: Omit<Booking, "id" | "createdAt">) {
    this.maybeFail("createBooking");
    if (this.bookings.some((x) => x.status === "confirmed" && x.slotStart === b.slotStart)) throw new Error("Slot already booked");
    if (this.bookings.some((x) => x.status === "confirmed" && x.prospectId === b.prospectId)) throw new Error("This prospect already has a demo");
    const row: Booking = { ...clone(b), id: uid(), createdAt: new Date().toISOString() };
    this.bookings.push(row); return clone(row);
  }
  async bookingForProspect(prospectId: string) {
    const b = this.bookings.find((x) => x.prospectId === prospectId && x.status === "confirmed");
    return b ? clone(b) : null;
  }
}
