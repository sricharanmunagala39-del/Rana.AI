// Reads a company's own web pages and pulls out only what is actually written there: phone numbers, emails,
// named people with their titles, and signs the business handles lots of calls. Each item keeps its page URL.
import type { ContactPerson, Country, PhoneType, Signal } from "./types";

export function normPhone(raw: string, country: Country): string | null {
  let s = String(raw || "").replace(/[^\d+]/g, "");
  if (!s) return null;
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (!s.startsWith("+")) {
    s = s.replace(/^0+/, "");
    const cc = country === "IN" ? "91" : country === "US" ? "1" : "61";
    if (country === "IN" && s.length === 12 && s.startsWith("91")) s = "+" + s;
    else if (country === "US" && s.length === 11 && s.startsWith("1")) s = "+" + s;
    else if (country === "AU" && s.length === 11 && s.startsWith("61")) s = "+" + s;
    else s = `+${cc}${s}`;
  }
  if (!/^\+[1-9]\d{8,14}$/.test(s)) return null;
  if (s.startsWith("+91") && s.length !== 13) return null; // Indian numbers are always 10 digits after +91
  if (s.startsWith("+1") && s.length !== 12) return null;
  return s;
}

/** A public number on a company page: Indian 10-digit mobiles are "mobile", everything else "general". */
export function phoneKind(phone: string): PhoneType {
  if (/^\+91[6-9]\d{9}$/.test(phone)) return "mobile";
  if (/^\+614\d{8}$/.test(phone)) return "mobile";
  return "general";
}

export const GENERIC_MAILBOX = /^(info|sales|contact|enquir(y|ies)|inquir(y|ies)|hello|hi|admin|support|office|mail|care|help|admissions|hr|careers|jobs|marketing|reception|booking|bookings|noreply|no-reply)@/i;

export function domainOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "").toLowerCase() || null;
  } catch { return null; }
}

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d));

/** Visible text, one line per block element. */
export function textOf(html: string): string {
  return decode(
    html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article|\/header|\/footer)\b[^>]*>/gi, "\n").replace(/<[^>]+>/g, " "),
  ).replace(/[ \t]+/g, " ").replace(/\n\s*/g, "\n").trim();
}

export function metaDescription(html: string): string | null {
  const m = html.match(/<meta[^>]+(?:name|property)=["'](?:og:)?description["'][^>]*content=["']([^"']{10,400})["']/i)
    || html.match(/<meta[^>]+content=["']([^"']{10,400})["'][^>]*(?:name|property)=["'](?:og:)?description["']/i);
  return m ? decode(m[1]).trim() : null;
}
export function titleOf(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]{2,200})<\/title>/i);
  return m ? decode(m[1]).trim() : null;
}

export function links(html: string, base: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["']/gi)) {
    try { out.add(new URL(m[1], base).toString()); } catch { /* bad href */ }
  }
  return [...out];
}

export function phonesIn(html: string, country: Country): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/href=["']tel:([^"']+)["']/gi)) { const p = normPhone(decodeURIComponent(m[1]), country); if (p) out.add(p); }
  const text = textOf(html);
  // Numbers written near a phone word only — random digit runs (prices, years, IDs) are ignored.
  for (const m of text.matchAll(/(?:phone|call|tel|mobile|mob|contact|ph|whatsapp|helpline|toll[- ]free)[^\d+\n]{0,15}(\+?[\d][\d\s().-]{7,18}\d)/gi)) {
    const p = normPhone(m[1], country); if (p) out.add(p);
  }
  return [...out].slice(0, 10);
}

export function emailsIn(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/mailto:([^"'?\s]+)/gi)) out.add(decodeURIComponent(m[1]).toLowerCase());
  for (const m of textOf(html).matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) out.add(m[0].toLowerCase());
  return [...out].filter((e) => !/\.(png|jpe?g|gif|svg|webp)$/i.test(e) && !/example\.com|sentry|wixpress/i.test(e)).slice(0, 10);
}

/** schema.org JSON-LD blocks, flattened (@graph unwrapped). */
export function jsonLd(html: string): any[] {
  const out: any[] = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const j = JSON.parse(m[1].trim());
      const push = (x: any) => { if (Array.isArray(x)) x.forEach(push); else if (x && typeof x === "object") { out.push(x); if (x["@graph"]) push(x["@graph"]); } };
      push(j);
    } catch { /* invalid JSON-LD is common; skip it */ }
  }
  return out;
}

export const ROLE_WORDS = [
  "co-founder", "cofounder", "founder", "chief executive officer", "ceo", "managing director", "md", "director", "chairman",
  "head of sales", "sales head", "sales director", "vice president", "vp sales", "head of customer experience", "customer experience head",
  "operations director", "head of operations", "coo", "chief operating officer", "contact center manager", "contact centre manager",
  "marketing director", "head of marketing", "cmo", "chief marketing officer", "principal", "owner", "proprietor", "partner",
  "general manager", "admissions head", "head of admissions", "medical director", "hr head", "head of hr", "talent acquisition head",
];

/** Does a title match the campaign's target roles? Loose on purpose ("Founder & CEO" matches "CEO"). */
export function roleMatches(title: string | null, targets: string[]): boolean {
  if (!title) return false;
  const t = title.toLowerCase();
  const wanted = targets.length ? targets.map((x) => x.toLowerCase()) : ["founder", "ceo", "managing director", "head of sales", "director", "owner"];
  return wanted.some((w) => t.includes(w) || (w === "ceo" && /chief executive/.test(t)) || (w === "managing director" && /\bmd\b/.test(t)) || (w === "founder" && /co-?founder/.test(t)));
}

const NAME = String.raw`((?:Dr\.?|Mr\.?|Mrs\.?|Ms\.?|Prof\.?) )?([A-Z][a-zA-Z'.-]+(?: [A-Z][a-zA-Z'.-]+){1,3})`;
const ROLE = String.raw`((?:Co-?Founder|Founder|Chief Executive Officer|CEO|Managing Director|Chairman|Director(?: of [A-Z][a-z]+)?|Head of [A-Z][a-zA-Z ]{2,30}|Sales Director|Vice President[^\n,]{0,25}|VP[^\n,]{0,20}|COO|CMO|Chief [A-Z][a-z]+ Officer|Principal|Owner|Proprietor|Partner|General Manager|Medical Director)(?:\s*(?:&|and|/)\s*(?:Co-?Founder|Founder|CEO|Managing Director|Director|Chairman|Principal))?)`;
const PERSON_RE = [
  new RegExp(String.raw`${NAME} *[,|–—:-] *${ROLE}`, "g"),
  new RegExp(String.raw`${ROLE} *[,|–—:-] *${NAME}`, "g"),
  new RegExp(String.raw`${NAME} *\n *${ROLE}`, "g"),
];

const NOT_A_NAME = /^(Our|The|About|Contact|Meet|Team|Read|View|Call|Book|Home|More|Board|Leadership|Message|Welcome|From|Get|Learn|All|Privacy|Terms)\b/;

/** Named people with titles written on the company's own page. Only names a reader could see on that page. */
export function peopleIn(html: string, url: string, country: Country, targets: string[]): ContactPerson[] {
  const found = new Map<string, ContactPerson>();
  const add = (name: string, role: string, phone?: string | null, email?: string | null) => {
    name = name.replace(/\s+/g, " ").trim(); role = role.replace(/\s+/g, " ").trim();
    if (!name || name.split(" ").length < 2 || name.length > 60 || NOT_A_NAME.test(name)) return;
    const key = name.toLowerCase();
    if (found.has(key)) return;
    const p = phone ? normPhone(phone, country) : null;
    found.set(key, {
      name, role, decisionMaker: roleMatches(role, targets),
      // A number published against the person (JSON-LD telephone) is their direct business line.
      phone: p, phoneType: p ? "direct" : "none", email: email ? email.toLowerCase() : null, sourceUrl: url, verified: true,
    });
  };
  const isPerson = (x: any) => x && typeof x === "object" && (x["@type"] === "Person" || (Array.isArray(x["@type"]) && x["@type"].includes("Person")));
  for (const node of jsonLd(html)) {
    if (isPerson(node) && node.name && node.jobTitle) add(String(node.name), String(node.jobTitle), node.telephone, node.email);
    for (const x of ([] as any[]).concat(node.founder || [], node.founders || [])) {
      if (x?.name) add(String(x.name), String(x.jobTitle || "Founder"), x.telephone, x.email);
    }
    for (const x of ([] as any[]).concat(node.employee || [], node.member || [])) {
      if (x?.name && x.jobTitle) add(String(x.name), String(x.jobTitle), x.telephone, x.email);
    }
  }
  const text = textOf(html);
  for (const re of PERSON_RE) {
    for (const m of text.matchAll(re)) {
      const nameFirst = re === PERSON_RE[0] || re === PERSON_RE[2];
      const name = nameFirst ? m[2] : m[3];
      const role = nameFirst ? m[3] : m[1];
      if (name && role) add(name, role);
    }
  }
  return [...found.values()].slice(0, 12);
}

const SIGNALS: { key: string; label: string; re: RegExp; industries?: string[] }[] = [
  { key: "branches", label: "Several branches or locations", re: /\b(\d{1,3}\+?\s+(branches|centres|centers|locations|offices|clinics|campuses|outlets))\b|\bour (branches|centres|centers|locations)\b/i },
  { key: "site_visit", label: "Books property site visits", re: /\b(book|schedule)\s+(a\s+)?(free\s+)?site\s+visit\b|\bsite visit\b/i, industries: ["real_estate"] },
  { key: "enquiries", label: "Asks visitors to enquire / call", re: /\b(enquire now|enquiry form|send (an )?enquiry|request a call ?back|call us now|get a call back|talk to (an )?expert)\b/i },
  { key: "admissions", label: "Runs admissions / course enquiries", re: /\b(admissions? (open|enquiry|process)|apply now|enrol(l)? now|new batch(es)?|course enquiry|counsell?ing session)\b/i, industries: ["education"] },
  { key: "appointments", label: "Takes appointment bookings", re: /\b(book (an )?appointment|schedule (an )?appointment|appointment booking|book a consultation)\b/i },
  { key: "support", label: "Runs a support / helpline", re: /\b(24\s*[x×\/]\s*7|helpline|toll[- ]free|customer (care|support) (number|team))\b/i },
  { key: "recruitment", label: "Handles candidate / hiring enquiries", re: /\b(submit (your )?(cv|resume)|current openings|we are hiring|job openings|register as (a )?candidate)\b/i },
  { key: "follow_ups", label: "Follows up with leads by phone / WhatsApp", re: /\b(our (team|executive|counsell?or) will (call|contact|get back)|we will call you|whatsapp us)\b/i },
];

export function signalsIn(html: string, url: string, industry: string): Signal[] {
  const text = textOf(html);
  const out: Signal[] = [];
  for (const s of SIGNALS) {
    if (s.industries && !s.industries.includes(industry)) continue;
    const m = text.match(s.re);
    if (!m || m.index == null) continue;
    const snippet = text.slice(Math.max(0, m.index - 60), m.index + m[0].length + 60).replace(/\s+/g, " ").trim();
    out.push({ key: s.key, label: s.label, snippet, url });
  }
  return out;
}

/** Years written on the page (© 2026, "updated 2025"), used as a light sign the business is active. */
export function latestYear(html: string): number | null {
  const years = [...textOf(html).matchAll(/(?:©|copyright|\bupdated\b)\D{0,10}(20\d\d)/gi)].map((m) => +m[1]).filter((y) => y >= 2000 && y <= 2100);
  return years.length ? Math.max(...years) : null;
}

/** Same-site pages worth reading for contacts and people (max 5). */
export function pagesToVisit(home: string, html: string): string[] {
  const d = domainOf(home);
  const wanted = /(contact|about|team|leadership|management|founder|people|who-we-are|our-story)/i;
  return links(html, home).filter((u) => domainOf(u) === d && wanted.test(new URL(u).pathname)).slice(0, 5);
}
