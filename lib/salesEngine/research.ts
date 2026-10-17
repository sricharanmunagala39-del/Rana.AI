// Visits a company's own website politely (robots.txt respected, a few pages at most, a pause between requests,
// an honest user-agent) and turns what's written there into facts with sources.
import type { CampaignConfig, ContactPerson, Evidence, Prospect, Signal } from "./types";
import type { Http } from "./sources";
import { domainOf, emailsIn, GENERIC_MAILBOX, latestYear, metaDescription, pagesToVisit, peopleIn, phonesIn, signalsIn } from "./extract";

export const USER_AGENT = "RANA-AI-SalesResearch/1.0 (+https://ranaai.in/legal/contact)";

/** robots.txt rules for user-agent "*" (and ours). Missing or unreadable robots.txt = allowed, per the standard. */
export function robotsAllows(robots: string | null, path: string): boolean {
  if (!robots) return true;
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let cur: { agents: string[]; rules: { allow: boolean; path: string }[] } | null = null;
  let lastWasAgent = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === "user-agent") {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(v.toLowerCase()); lastWasAgent = true;
    } else if (cur && (k === "allow" || k === "disallow")) {
      lastWasAgent = false;
      if (v) cur.rules.push({ allow: k === "allow", path: v });
    } else lastWasAgent = false;
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && USER_AGENT.toLowerCase().includes(a)));
  const use = mine.length ? mine : groups.filter((g) => g.agents.includes("*"));
  let best: { allow: boolean; len: number } | null = null;
  for (const g of use) for (const r of g.rules) {
    const pat = r.path.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    const re = new RegExp("^" + pat + (r.path.endsWith("$") ? "" : ""));
    if (re.test(path) && (!best || r.path.length > best.len || (r.path.length === best.len && r.allow))) best = { allow: r.allow, len: r.path.length };
  }
  return best ? best.allow : true;
}

/** Wraps an Http with robots.txt, one request per host per `gapMs`, and a page cap. */
export class PoliteFetcher {
  private robots = new Map<string, string | null>();
  private last = new Map<string, number>();
  constructor(private http: Http, private gapMs = 1000, private sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))) {}

  async get(url: string): Promise<{ ok: boolean; status: number; html: string; url: string; blocked?: string }> {
    let u: URL;
    try { u = new URL(url); } catch { return { ok: false, status: 0, html: "", url, blocked: "Bad URL" }; }
    if (!/^https?:$/.test(u.protocol)) return { ok: false, status: 0, html: "", url, blocked: "Not a web page" };
    if (!this.robots.has(u.host)) {
      await this.wait(u.host);
      const r = await this.http(`${u.protocol}//${u.host}/robots.txt`, { timeoutMs: 6000, headers: { "User-Agent": USER_AGENT } }).catch(() => null);
      this.robots.set(u.host, r && r.status < 400 ? r.text : null);
    }
    if (!robotsAllows(this.robots.get(u.host) ?? null, u.pathname || "/")) return { ok: false, status: 0, html: "", url, blocked: "robots.txt asks crawlers not to read this page" };
    await this.wait(u.host);
    const r = await this.http(url, { timeoutMs: 8000, headers: { "User-Agent": USER_AGENT, Accept: "text/html" } });
    if (r.status === 401 || r.status === 403) return { ok: false, status: r.status, html: "", url, blocked: "Page needs a login or blocks automated visitors — skipped" };
    if (/captcha|cf-chl|challenge-platform/i.test(r.text.slice(0, 5000)) && r.text.length < 20_000) return { ok: false, status: r.status, html: "", url, blocked: "Page shows a CAPTCHA — skipped (never bypassed)" };
    return { ok: r.status < 400, status: r.status, html: r.text.slice(0, 600_000), url: r.url || url };
  }

  private async wait(host: string) {
    const prev = this.last.get(host) || 0;
    const left = prev + this.gapMs - Date.now();
    if (left > 0) await this.sleep(left);
    this.last.set(host, Date.now());
  }
}

export type ResearchResult = {
  evidence: Evidence[]; signals: Signal[]; contacts: ContactPerson[]; description: string | null;
  phone: string | null; email: string | null; branches: number; activeYear: number | null; reachable: boolean; notes: string[];
};

/** Reads the home page plus up to 4 contact/about/team pages. Never throws for a bad site; reports why instead. */
export async function researchWebsite(fetcher: PoliteFetcher, p: Prospect, cfg: CampaignConfig): Promise<ResearchResult> {
  const out: ResearchResult = { evidence: [], signals: [], contacts: [], description: null, phone: null, email: null, branches: 1, activeYear: null, reachable: false, notes: [] };
  const site = p.company.website;
  if (!site) { out.notes.push("No website listed — research limited to the source record"); return out; }
  const at = new Date().toISOString();
  const home = await fetcher.get(site);
  if (!home.ok) { out.notes.push(home.blocked || `Website didn't load (HTTP ${home.status || "error"})`); return out; }
  out.reachable = true;
  const pages: { html: string; url: string }[] = [home];
  for (const link of pagesToVisit(home.url, home.html).slice(0, 4)) {
    const r = await fetcher.get(link).catch(() => null);
    if (r?.ok) pages.push(r); else if (r?.blocked) out.notes.push(`${new URL(link).pathname}: ${r.blocked}`);
  }
  out.description = metaDescription(home.html);
  if (out.description) out.evidence.push({ field: "description", value: out.description, url: home.url, at, verified: true });
  const siteDomain = domainOf(home.url);
  const phones = new Map<string, string>();
  const emails = new Map<string, string>();
  const people = new Map<string, ContactPerson>();
  const signals = new Map<string, Signal>();
  for (const pg of pages) {
    for (const ph of phonesIn(pg.html, cfg.country)) if (!phones.has(ph)) phones.set(ph, pg.url);
    for (const em of emailsIn(pg.html)) if (!emails.has(em)) emails.set(em, pg.url);
    for (const pr of peopleIn(pg.html, pg.url, cfg.country, cfg.roles)) if (!people.has(pr.name!.toLowerCase())) people.set(pr.name!.toLowerCase(), pr);
    for (const s of signalsIn(pg.html, pg.url, cfg.industry)) if (!signals.has(s.key)) signals.set(s.key, s);
    const y = latestYear(pg.html); if (y && (!out.activeYear || y > out.activeYear)) out.activeYear = y;
  }
  for (const [ph, url] of phones) out.evidence.push({ field: "phone", value: ph, url, at, verified: true });
  for (const [em, url] of emails) out.evidence.push({ field: "email", value: em, url, at, verified: true });
  // Prefer a company-domain mailbox; any domain if that's all there is.
  const em = [...emails.keys()].sort((a, b) => Number(b.endsWith(`@${siteDomain}`)) - Number(a.endsWith(`@${siteDomain}`)))[0] || null;
  out.email = em;
  out.phone = [...phones.keys()][0] || null;
  for (const pr of people.values()) {
    // A named person's own email only when it's clearly theirs (firstname@ / firstname.lastname@ on the company domain).
    if (!pr.email) {
      const first = pr.name!.toLowerCase().replace(/^(dr|mr|mrs|ms|prof)\.?\s/, "").split(" ")[0];
      const own = [...emails.keys()].find((e) => !GENERIC_MAILBOX.test(e) && e.split("@")[0].includes(first) && e.endsWith(`@${siteDomain}`));
      if (own) pr.email = own;
    }
    out.contacts.push(pr);
    out.evidence.push({ field: "person", value: `${pr.name} — ${pr.role}`, url: pr.sourceUrl!, at, verified: true });
  }
  out.signals = [...signals.values()];
  const br = out.signals.find((s) => s.key === "branches")?.snippet.match(/(\d{1,3})\+?\s+(branches|centres|centers|locations|offices|clinics|campuses|outlets)/i);
  if (br) out.branches = Math.max(1, +br[1]);
  if (out.activeYear) out.evidence.push({ field: "active_year", value: String(out.activeYear), url: home.url, at, verified: true });
  return out;
}
