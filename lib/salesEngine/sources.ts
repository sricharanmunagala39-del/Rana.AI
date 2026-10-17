// Where candidate companies come from. Every source is free and allowed for this use:
//  • OpenStreetMap (Overpass API) — open data under ODbL ("© OpenStreetMap contributors" shown on the dashboard);
//    one identified query per campaign, far inside the public instance's fair-use policy
//    (https://wiki.openstreetmap.org/wiki/Overpass_API). Coverage of Indian SMB phones/websites is thin, so the
//    uploaded-list and CRM sources matter most in India.
//  • A list you upload (your own data).
//  • Leads already in RANA's Sales CRM that nobody has called yet.
// No search-engine scraping, no LinkedIn scraping, no logins, no CAPTCHA bypassing.
import type { CampaignConfig, Company, ContactPerson, Evidence, SourceId, UploadedCompany } from "./types";
import { domainOf, normPhone, phoneKind, roleMatches, GENERIC_MAILBOX } from "./extract";

export type Http = (url: string, opts?: { timeoutMs?: number; method?: string; body?: string; headers?: Record<string, string> }) => Promise<{ status: number; text: string; url: string }>;

export type Candidate = { company: Company; contacts: ContactPerson[]; evidence: Evidence[]; source: SourceId; consent?: boolean };

export interface Source {
  id: SourceId;
  label: string;
  find(cfg: CampaignConfig, limit: number): Promise<Candidate[]>;
}

const now = () => new Date().toISOString();

export function blankCompany(cfg: CampaignConfig, name: string): Company {
  return {
    name, website: null, domain: null, industry: cfg.industry, country: cfg.country, region: cfg.region, city: null, address: null,
    description: null, services: [], phone: null, phoneType: "none", email: null, branches: 1,
  };
}

/** OpenStreetMap tags for each industry RANA sells into. */
export const OSM_TAGS: Record<string, string[]> = {
  real_estate: ['["office"="estate_agent"]', '["office"="property_management"]', '["office"="real_estate_agent"]', '["shop"="estate_agent"]'],
  education: ['["amenity"="college"]', '["amenity"="language_school"]', '["amenity"="training"]', '["office"="educational_institution"]', '["amenity"="prep_school"]', '["amenity"="school"]["operator:type"="private"]'],
  healthcare: ['["amenity"="clinic"]', '["amenity"="hospital"]', '["amenity"="dentist"]', '["healthcare"="clinic"]'],
  recruitment: ['["office"="employment_agency"]', '["office"="recruitment"]'],
  hospitality: ['["tourism"="hotel"]', '["tourism"="resort"]'],
  other: ['["office"="company"]'],
};

export function overpassQuery(cfg: CampaignConfig, limit: number): string {
  const tags = OSM_TAGS[cfg.industry] || OSM_TAGS.other;
  const area = cfg.region.replace(/"/g, "");
  const iso = cfg.country;
  // Only places that publish a website or phone: without one there is nothing to research or call.
  const parts = tags.flatMap((t) => [`nwr(area.r)${t}["website"];`, `nwr(area.r)${t}["contact:website"];`, `nwr(area.r)${t}["phone"];`]);
  return `[out:json][timeout:25];area["ISO3166-1"="${iso}"]->.c;area["name"="${area}"](area.c)->.r;(${parts.join("")});out tags center ${Math.min(200, limit * 3)};`;
}

export class OsmSource implements Source {
  id: SourceId = "osm";
  label = "OpenStreetMap";
  constructor(private http: Http, private endpoint = "https://overpass-api.de/api/interpreter") {}
  async find(cfg: CampaignConfig, limit: number): Promise<Candidate[]> {
    const q = overpassQuery(cfg, limit);
    const r = await this.http(this.endpoint, { method: "POST", body: `data=${encodeURIComponent(q)}`, headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "RANA-AI-SalesResearch/1.0 (+https://ranaai.in/legal/contact)" }, timeoutMs: 30_000 });
    // Overpass usage policy: back off after a 429 (the engine waits minutes, not seconds, before retrying).
    if (r.status === 429) throw new Error("OpenStreetMap is busy (rate limited). The engine will try again later.");
    if (r.status >= 400) throw new Error(`OpenStreetMap search failed (${r.status})`);
    let data: any;
    try { data = JSON.parse(r.text); } catch { throw new Error("OpenStreetMap returned something that isn't JSON"); }
    return osmToCandidates(cfg, data?.elements || []).slice(0, limit * 3);
  }
}

export function osmToCandidates(cfg: CampaignConfig, elements: any[]): Candidate[] {
  const out: Candidate[] = [];
  for (const el of elements) {
    const t = el.tags || {};
    const name = t.name || t["name:en"] || t.brand;
    if (!name) continue;
    const url = `https://www.openstreetmap.org/${el.type}/${el.id}`;
    const at = now();
    const c = blankCompany(cfg, String(name));
    const site = t.website || t["contact:website"] || t.url || null;
    c.website = site ? (/^https?:\/\//i.test(site) ? site : `https://${site}`) : null;
    c.domain = domainOf(c.website);
    c.city = t["addr:city"] || cfg.region;
    c.address = [t["addr:housenumber"], t["addr:street"], t["addr:suburb"], t["addr:city"], t["addr:postcode"]].filter(Boolean).join(", ") || null;
    const rawPhone = String(t.phone || t["contact:phone"] || t["contact:mobile"] || "").split(/[;,]/)[0];
    const phone = rawPhone ? normPhone(rawPhone, cfg.country) : null;
    if (phone) { c.phone = phone; c.phoneType = phoneKind(phone); }
    const email = t.email || t["contact:email"] || null;
    if (email) c.email = String(email).toLowerCase();
    if (t.description) c.description = String(t.description);
    const evidence: Evidence[] = [{ field: "name", value: c.name, url, at, verified: true }];
    if (c.website) evidence.push({ field: "website", value: c.website, url, at, verified: true });
    if (phone) evidence.push({ field: "phone", value: phone, url, at, verified: true });
    if (c.email) evidence.push({ field: "email", value: c.email, url, at, verified: true });
    if (c.address) evidence.push({ field: "address", value: c.address, url, at, verified: true });
    out.push({ company: c, contacts: [], evidence, source: "osm" });
  }
  return out;
}

/** Companies the team uploaded. Their facts are "from your list" until the website confirms them. */
export class ListSource implements Source {
  id: SourceId = "list";
  label = "Your uploaded list";
  async find(cfg: CampaignConfig, limit: number): Promise<Candidate[]> {
    return (cfg.uploadedList || []).slice(0, Math.max(limit * 3, 50)).map((row) => listRowToCandidate(cfg, row)).filter(Boolean) as Candidate[];
  }
}

export function listRowToCandidate(cfg: CampaignConfig, row: UploadedCompany): Candidate | null {
  const name = String(row.business || "").trim();
  if (!name) return null;
  const at = now();
  const url = "uploaded-list";
  const c = blankCompany(cfg, name.slice(0, 150));
  if (row.website) { c.website = /^https?:\/\//i.test(row.website) ? row.website : `https://${row.website}`; c.domain = domainOf(c.website); }
  c.city = row.city || cfg.region;
  const phone = row.phone ? normPhone(row.phone, cfg.country) : null;
  const email = row.email ? String(row.email).toLowerCase().trim() : null;
  const evidence: Evidence[] = [{ field: "name", value: c.name, url, at, verified: false }];
  const contacts: ContactPerson[] = [];
  if (row.contactName) {
    contacts.push({
      name: row.contactName, role: row.contactRole || null, decisionMaker: roleMatches(row.contactRole || null, cfg.roles),
      phone, phoneType: phone ? "unverified" : "none", email: email && !GENERIC_MAILBOX.test(email) ? email : null, sourceUrl: url, verified: false, consent: !!row.consent,
    });
  } else {
    if (phone) { c.phone = phone; c.phoneType = "unverified"; }
    if (email) c.email = email;
  }
  if (phone) evidence.push({ field: "phone", value: phone, url, at, verified: false });
  if (email) evidence.push({ field: "email", value: email, url, at, verified: false });
  if (c.website) evidence.push({ field: "website", value: c.website, url, at, verified: false });
  return { company: c, contacts, evidence, source: "list", consent: !!row.consent };
}

/** Uncalled CRM leads in this industry (production only; injected so tests don't need a database). */
export class CrmSource implements Source {
  id: SourceId = "crm";
  label = "Sales CRM (not called yet)";
  constructor(private load: (industry: string, limit: number) => Promise<UploadedCompany[]>) {}
  async find(cfg: CampaignConfig, limit: number): Promise<Candidate[]> {
    const rows = await this.load(cfg.industry, limit * 2);
    return rows.map((r) => listRowToCandidate(cfg, r)).filter(Boolean).map((c) => ({ ...c!, source: "crm" as SourceId }));
  }
}

/** Dedupe key: website domain, else phone, else name + city. */
export function keyOf(c: Company): string {
  if (c.domain) return `d:${c.domain}`;
  if (c.phone) return `p:${c.phone}`;
  return `n:${c.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}|${(c.city || "").toLowerCase()}`;
}
