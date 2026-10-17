// Explainable 0–100 lead score. Every point has a written reason; reasons are marked "fact" (we saw it on a
// source page) or "hypothesis" (our inference). Hypotheses are capped so guesses can't carry a lead on their own.
import type { CampaignConfig, ContactPerson, Prospect, ScoreReason } from "./types";

export const MAX_HYPOTHESIS_POINTS = 12;

export function bestContact(p: Pick<Prospect, "contacts" | "company">): { person: ContactPerson | null; phone: string | null; phoneType: ContactPerson["phoneType"] } {
  const dms = p.contacts.filter((c) => c.decisionMaker);
  const withDirect = dms.find((c) => c.phone && c.phoneType === "direct");
  if (withDirect) return { person: withDirect, phone: withDirect.phone, phoneType: "direct" };
  const dmAnyPhone = dms.find((c) => c.phone);
  if (dmAnyPhone) return { person: dmAnyPhone, phone: dmAnyPhone.phone, phoneType: dmAnyPhone.phoneType };
  // No personal line: the decision-maker (if known) reached via the company's published number.
  const person = dms[0] || p.contacts[0] || null;
  if (p.company.phone) return { person, phone: p.company.phone, phoneType: p.company.phoneType };
  const anyPhone = p.contacts.find((c) => c.phone);
  return { person: anyPhone || person, phone: anyPhone?.phone || null, phoneType: anyPhone?.phoneType || "none" };
}

export function scoreProspect(p: Prospect, cfg: CampaignConfig, now = new Date()): { score: number; reasons: ScoreReason[]; hypotheses: string[] } {
  const reasons: ScoreReason[] = [];
  const hyps: string[] = [];
  const fact = (points: number, reason: string, url?: string) => reasons.push({ points, reason, kind: "fact", url });
  const guess = (points: number, reason: string) => { reasons.push({ points, reason, kind: "hypothesis" }); hyps.push(reason); };

  // 1. Industry relevance (20)
  const srcInd = p.evidence.find((e) => e.field === "name" && e.verified);
  if (p.source === "osm") fact(20, `Listed on OpenStreetMap as a ${cfg.industry.replace("_", " ")} business`, srcInd?.url);
  else if (p.signals.some((s) => ["site_visit", "admissions", "appointments", "recruitment"].includes(s.key))) fact(18, `Website shows ${cfg.industry.replace("_", " ")} activity`, p.signals[0]?.url);
  else guess(10, `Assumed to be in ${cfg.industry.replace("_", " ")} because it's on the campaign list`);

  // 2. Evidence of a problem RANA solves (25)
  const problemSignals = p.signals.filter((s) => s.key !== "branches");
  let sigPts = 0;
  for (const s of problemSignals) { if (sigPts >= 25) break; const pts = Math.min(9, 25 - sigPts); sigPts += pts; fact(pts, `${s.label}: “${s.snippet.slice(0, 90)}”`, s.url); }
  if (!problemSignals.length) guess(4, "No call-handling signals found on the website; businesses in this industry usually take phone enquiries");

  // 3. Size / likely call volume (15)
  const br = p.signals.find((s) => s.key === "branches");
  if (br && p.company.branches > 1) fact(Math.min(15, 6 + p.company.branches), `${p.company.branches}+ locations mentioned`, br.url);
  else if (br) fact(8, "Mentions multiple branches/locations", br.url);
  const phonesListed = p.evidence.filter((e) => e.field === "phone" && e.verified).length;
  if (phonesListed >= 3) fact(4, `${phonesListed} public phone numbers listed`, p.evidence.find((e) => e.field === "phone")?.url);
  if (cfg.companySize === "large" && !br) guess(-5, "Couldn't confirm the company is large");

  // 4. Decision-maker known (15)
  const dm = p.contacts.find((c) => c.decisionMaker && c.verified);
  const anyDm = p.contacts.find((c) => c.decisionMaker);
  if (dm) fact(15, `Decision-maker named on their site: ${dm.name} (${dm.role})`, dm.sourceUrl || undefined);
  else if (anyDm) guess(7, `Decision-maker from your list (not confirmed on their website): ${anyDm.name}`);
  else if (p.contacts.length) fact(5, `A named contact is published: ${p.contacts[0].name}`, p.contacts[0].sourceUrl || undefined);

  // 5. Contact quality (15)
  const best = bestContact(p);
  const cq: Record<string, [number, string]> = {
    direct: [15, "Direct business line for the decision-maker"], mobile: [10, "Public business mobile number"],
    general: [7, "Company's general phone number (likely reception)"], unverified: [3, "Phone number not yet confirmed on a public page"], none: [0, ""],
  };
  const [cp, cr] = cq[best.phoneType] || cq.none;
  const phoneUrl = p.evidence.find((e) => e.field === "phone" && e.value === best.phone)?.url || (best.person?.phone === best.phone ? best.person?.sourceUrl : null) || undefined;
  if (cp) (best.phoneType === "unverified" ? guess : fact)(cp, cr, phoneUrl);
  else if (p.company.email || p.contacts.some((c) => c.email)) fact(3, "Only an email address is available");

  // 6. Current activity (10)
  if (p.evidence.some((e) => e.field === "description" && e.verified)) fact(4, "Website is live and loads", p.company.website || undefined);
  const yr = Number(p.evidence.find((e) => e.field === "active_year")?.value || 0);
  if (yr >= now.getFullYear() - 1) fact(6, `Website updated ${yr}`, p.company.website || undefined);
  else if (yr) fact(1, `Website last dated ${yr} — may be inactive`, p.company.website || undefined);

  // Hypotheses can't add more than MAX_HYPOTHESIS_POINTS in total.
  let hypTotal = 0;
  for (const r of reasons) if (r.kind === "hypothesis" && r.points > 0) {
    const allowed = Math.max(0, Math.min(r.points, MAX_HYPOTHESIS_POINTS - hypTotal));
    hypTotal += allowed; r.points = allowed;
  }
  const score = Math.max(0, Math.min(100, Math.round(reasons.reduce((n, r) => n + r.points, 0))));
  return { score, reasons, hypotheses: hyps };
}
