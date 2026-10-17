// Writes outcomes into RANA HQ's Sales CRM (crm_deals + crm_activities) so the human team sees every
// interested prospect, callback and booked demo where they already work. One deal per phone/email — never duplicated.
import type { Prospect } from "./types";
import { bestContact } from "./scoring";

export type CrmStage = "new" | "contacted" | "prospect" | "not_interested";
export type CrmUpdate = { stage: CrmStage; nextAction?: string | null; nextActionAt?: string | null; note: string; lostReason?: string | null };

export interface CrmAdapter {
  id: string;
  /** Create or update the prospect's deal; returns the deal id. */
  upsert(p: Prospect, u: CrmUpdate): Promise<string>;
}

export class MemoryCrm implements CrmAdapter {
  id = "memory";
  deals = new Map<string, { id: string; business: string; phone: string | null; email: string | null; stage: CrmStage; nextAction: string | null; nextActionAt: string | null; activities: string[] }>();
  failNext = false;
  async upsert(p: Prospect, u: CrmUpdate) {
    if (this.failNext) { this.failNext = false; throw new Error("CRM unavailable"); }
    const best = bestContact(p);
    const existing = [...this.deals.values()].find((d) => (best.phone && d.phone === best.phone) || (p.crmDealId && d.id === p.crmDealId));
    const id = existing?.id || `deal-${this.deals.size + 1}`;
    const row = existing || { id, business: p.company.name, phone: best.phone, email: best.person?.email || p.company.email, stage: u.stage, nextAction: null, nextActionAt: null, activities: [] as string[] };
    row.stage = u.stage; row.nextAction = u.nextAction ?? null; row.nextActionAt = u.nextActionAt ?? null; row.activities.push(u.note);
    this.deals.set(id, row);
    return id;
  }
}
