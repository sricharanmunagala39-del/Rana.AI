// The one-click workflow: discover → research → score & check → prepare → call → book → CRM → follow up.
// Runs in short, resumable steps ("ticks"): every step saves its result before the next one starts, so a
// crash, timeout or pause never loses work and never repeats a call. Only one worker can tick a campaign at a time.
import type { Campaign, CampaignConfig, Counters, EngineEvent, Prospect, ProspectStatus, LogLine } from "./types";
import type { Store } from "./store";
import type { Source } from "./sources";
import type { VoiceAdapter } from "./voice";
import type { BookingAdapter, Slot } from "./booking";
import type { CrmAdapter, CrmUpdate } from "./crmAdapter";
import { keyOf } from "./sources";
import { PoliteFetcher, researchWebsite } from "./research";
import { bestContact, scoreProspect } from "./scoring";
import { buildOutreach, unsafeClaims } from "./outreach";
import { insideCallingHours, liveCallBlocker, nextCallingTime, type LiveEnv } from "./rules";
import { hashOf } from "./voice";
import { slotLabel } from "./booking";
import { optOutPhrase } from "../compliance";

export type Deps = {
  store: Store;
  sources: Source[];
  fetcher: PoliteFetcher | null;
  voice: VoiceAdapter;
  booking: BookingAdapter;
  crm: CrmAdapter;
  liveEnv: LiveEnv;
  now?: () => Date;
};

export const DEFAULT_CONFIG: CampaignConfig = {
  name: "", country: "IN", region: "Hyderabad", industry: "real_estate", subIndustry: "", companySize: "any",
  companyTypes: [], roles: ["Founder", "CEO", "Managing Director", "Head of Sales", "Sales Director"], prospectCount: 25,
  problem: "Enquiry calls and site-visit requests get missed after hours and when the team is busy",
  useCase: "answers enquiry calls 24/7, qualifies callers and books site visits",
  language: "en", callingStart: 10 * 60, callingEnd: 18 * 60, timezone: "Asia/Kolkata", maxAttempts: 3, minScore: 35,
  qualification: [], demo: { days: [1, 2, 3, 4, 5], start: 11 * 60, end: 17 * 60, slotMinutes: 30, timezone: "Asia/Kolkata", bufferHours: 20, horizonDays: 7 },
  sources: ["osm"], uploadedList: [], mode: "simulation",
};

const TZ_OK = (tz: string) => { try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; } };

export function validateConfig(c: CampaignConfig): string[] {
  const e: string[] = [];
  if (!c.name?.trim()) e.push("Give the campaign a name.");
  if (!["IN", "US", "AU"].includes(c.country)) e.push("Pick India, the US or Australia.");
  if (!c.region?.trim()) e.push("Enter the city or region to search.");
  if (!(c.prospectCount >= 1 && c.prospectCount <= 200)) e.push("Prospects to research must be 1–200.");
  if (!(c.maxAttempts >= 1 && c.maxAttempts <= 5)) e.push("Maximum attempts must be 1–5.");
  if (!(c.minScore >= 0 && c.minScore <= 100)) e.push("Minimum score must be 0–100.");
  if (!["en", "hi", "te", "te-en"].includes(c.language)) e.push("Pick English, Hindi, Telugu or Telugu-English.");
  if (!TZ_OK(c.timezone) || !TZ_OK(c.demo?.timezone)) e.push("Unknown time zone.");
  if (!(c.callingEnd > c.callingStart)) e.push("Calling hours must end after they start.");
  if (!c.demo || !(c.demo.end > c.demo.start) || !c.demo.days?.length || !(c.demo.slotMinutes >= 15)) e.push("Set demo days, hours and a slot length of at least 15 minutes.");
  if (!c.sources?.length) e.push("Pick at least one lead source.");
  if (c.sources?.includes("list") && !c.uploadedList?.length) e.push("You picked “Your list” but didn't add any companies.");
  return e;
}

export function configHash(c: CampaignConfig): string {
  const { name: _n, ...rest } = c;
  const norm = JSON.stringify(rest, Object.keys(rest).sort());
  return hashOf(norm + JSON.stringify(rest.uploadedList || [])).toString(36) + "-" + hashOf(JSON.stringify(rest)).toString(36);
}

const clip = (log: LogLine[]) => log.slice(-80);
async function log(store: Store, c: Campaign, level: LogLine["level"], msg: string, at: Date) {
  c.log = clip([...(c.log || []), { at: at.toISOString(), level, msg }]);
  await store.updateCampaign(c.id, { log: c.log });
}

export async function launch(deps: Pick<Deps, "store" | "liveEnv" | "voice" | "now">, config: CampaignConfig, by: string): Promise<{ campaign?: Campaign; error?: string; duplicateOf?: string }> {
  const errors = validateConfig(config);
  if (errors.length) return { error: errors.join(" ") };
  if (config.mode === "live") {
    if (!deps.liveEnv.liveSwitch) return { error: "Live mode is switched off for this deployment. Run in simulation, or set SALES_ENGINE_LIVE_CALLS=1 after the compliance checklist." };
    const nr = deps.voice.live ? deps.voice.notReady() : "No live telephony adapter is connected.";
    if (nr) return { error: `Live mode isn't available: ${nr}` };
  }
  const hash = configHash(config);
  const dup = await deps.store.findOpenByHash(hash);
  if (dup) return { error: `An identical campaign (“${dup.name}”) is already ${dup.status}. Open it instead of launching a copy.`, duplicateOf: dup.id };
  const now = (deps.now || (() => new Date()))();
  const campaign = await deps.store.createCampaign({
    name: config.name.trim(), config, configHash: hash, status: "running", phase: "discover", mode: config.mode, sourcesDone: [], sourceTries: {},
    nextRunAt: now.toISOString(), log: [{ at: now.toISOString(), level: "info", msg: `Launched by ${by} in ${config.mode === "live" ? "LIVE" : "SIMULATION"} mode` }],
    lockUntil: null, createdBy: by, completedAt: null,
  });
  return { campaign };
}

export async function control(store: Store, id: string, action: "pause" | "resume" | "cancel" | "retry", by: string, now = new Date()): Promise<{ campaign?: Campaign; error?: string }> {
  const c = await store.getCampaign(id);
  if (!c) return { error: "Campaign not found" };
  if (c.status === "cancelled" || (c.status === "completed" && action !== "retry")) return { error: `This campaign is ${c.status}.` };
  if (action === "pause") { if (c.status !== "running") return { error: "Only a running campaign can be paused." }; c.status = "paused"; }
  if (action === "resume") { if (c.status !== "paused") return { error: "Only a paused campaign can be resumed." }; c.status = "running"; c.nextRunAt = now.toISOString(); }
  if (action === "cancel") { c.status = "cancelled"; c.completedAt = now.toISOString(); }
  if (action === "retry") {
    // Re-queue only steps that failed because something broke — never re-calls anyone.
    const stuck = await store.listProspects(id, { statuses: ["new", "research_completed", "ready", "no_answer", "receptionist", "callback_requested"] });
    let n = 0;
    for (const p of stuck.filter((x) => x.errors.length)) { await store.updateProspect(p.id, { errors: [], researchTries: 0, nextActionAt: null }); n++; }
    c.sourceTries = {}; c.sourcesDone = c.sourcesDone.filter((s) => !s.startsWith("failed:"));
    if (c.status === "failed" || c.status === "completed") { c.status = "running"; c.phase = c.sourcesDone.length ? "research" : "discover"; c.completedAt = null; }
    c.nextRunAt = now.toISOString();
    c.log = clip([...c.log, { at: now.toISOString(), level: "info", msg: `Retry by ${by}: ${n} failed step(s) re-queued` }]);
  } else {
    c.log = clip([...c.log, { at: now.toISOString(), level: "info", msg: `${action[0].toUpperCase()}${action.slice(1)}d by ${by}` }]);
  }
  const saved = await store.updateCampaign(id, { status: c.status, nextRunAt: c.nextRunAt, completedAt: c.completedAt, log: c.log, sourceTries: c.sourceTries, sourcesDone: c.sourcesDone, phase: c.phase });
  return { campaign: saved };
}

const backoffMs = (tries: number) => Math.min(6 * 3600_000, 2 ** tries * 60_000);
const TERMINAL: ProspectStatus[] = ["demo_booked", "not_interested", "disqualified", "opted_out", "needs_other_approach", "blocked", "booking_pending", "interested"];
const CALLABLE: ProspectStatus[] = ["ready", "no_answer", "receptionist", "callback_requested"];

export type TickResult = { campaign: Campaign; worked: number; done: boolean; waitingUntil: string | null; message?: string };

/** Do as much work as fits before `deadline`. Safe to call repeatedly and concurrently (a lock makes extras no-ops). */
export async function tick(deps: Deps, campaignId: string, opts: { budgetMs?: number; maxItems?: number } = {}): Promise<TickResult> {
  const { store } = deps;
  const clock = deps.now || (() => new Date());
  const start = clock();
  const budget = opts.budgetMs ?? 8000;
  const maxItems = opts.maxItems ?? 25;
  const deadline = Date.now() + budget;
  let c = await store.getCampaign(campaignId);
  if (!c) throw new Error("Campaign not found");
  if (c.status !== "running") return { campaign: c, worked: 0, done: c.status !== "paused", waitingUntil: null, message: `Campaign is ${c.status}` };
  if (!(await store.lock(c.id, new Date(start.getTime() + budget + 30_000), start))) return { campaign: c, worked: 0, done: false, waitingUntil: null, message: "Another worker is running this campaign" };
  let worked = 0;
  const timeLeft = () => Date.now() < deadline && worked < maxItems;
  const stillRunning = async () => { const x = await store.getCampaign(campaignId); if (x) c = { ...c!, status: x.status }; return x?.status === "running"; };
  try {
    const cfg = c.config;

    // Recover steps interrupted mid-call: a real call may have happened, so never re-dial automatically.
    for (const p of await store.listProspects(c.id, { statuses: ["calling"] })) {
      if (Date.parse(p.updatedAt) < start.getTime() - 10 * 60_000) {
        await store.updateProspect(p.id, { status: p.lastCall?.simulated === false || c.mode === "live" ? "awaiting_outcome" : "ready", statusReason: "Recovered after an interruption during a call", nextActionAt: null });
        await log(store, c, "warn", `Recovered ${p.company.name} after an interrupted call step`, start);
      }
    }

    // ── 1. Discover ──
    if (c.phase === "discover") {
      const have = (await store.listProspects(c.id)).length;
      let total = have;
      for (const src of deps.sources.filter((s) => cfg.sources.includes(s.id))) {
        if (c.sourcesDone.includes(src.id) || c.sourcesDone.includes(`failed:${src.id}`) || total >= cfg.prospectCount || !timeLeft()) continue;
        try {
          const found = await src.find(cfg, cfg.prospectCount - total);
          let added = 0, skippedElsewhere = 0, dup = 0;
          for (const cand of found) {
            if (total >= cfg.prospectCount) break;
            const key = keyOf(cand.company);
            const other = await store.findOtherCampaignProspect(c.id, key, cand.company.phone);
            if (other) { skippedElsewhere++; continue; }
            const { created } = await store.insertProspect({
              campaignId: c.id, key, company: cand.company, contacts: cand.contacts, evidence: cand.evidence, signals: [], hypotheses: [], score: null, scoreReasons: [],
              status: "new", statusReason: null, attempts: 0, frontDeskAttempts: 0, researchTries: 0, nextActionAt: null, outreach: null, lastCall: null, booking: null,
              crmDealId: null, source: cand.source, errors: [],
            });
            if (created) { added++; total++; } else dup++;
          }
          c.sourcesDone = [...c.sourcesDone, src.id];
          await store.updateCampaign(c.id, { sourcesDone: c.sourcesDone });
          await log(store, c, "info", `${src.label}: ${added} new companies${dup ? `, ${dup} duplicates merged` : ""}${skippedElsewhere ? `, ${skippedElsewhere} skipped (already in another campaign)` : ""}`, clock());
          worked++;
        } catch (e: any) {
          const tries = (c.sourceTries[src.id] || 0) + 1;
          c.sourceTries = { ...c.sourceTries, [src.id]: tries };
          if (tries >= 3) c.sourcesDone = [...c.sourcesDone, `failed:${src.id}`];
          await store.updateCampaign(c.id, { sourceTries: c.sourceTries, sourcesDone: c.sourcesDone, nextRunAt: new Date(clock().getTime() + backoffMs(tries)).toISOString() });
          await store.addEvent(c.id, null, "error", { step: "discover", source: src.id, message: String(e?.message || e), tries });
          await log(store, c, "error", `${src.label} failed (try ${tries}/3): ${String(e?.message || e).slice(0, 200)}`, clock());
          worked++;
        }
      }
      const pending = deps.sources.filter((s) => cfg.sources.includes(s.id) && !c!.sourcesDone.includes(s.id) && !c!.sourcesDone.includes(`failed:${s.id}`));
      const count = (await store.listProspects(c.id)).length;
      if (!pending.length || count >= cfg.prospectCount) {
        if (!count) {
          c.status = "completed"; c.phase = "done"; c.completedAt = clock().toISOString();
          await store.updateCampaign(c.id, { status: c.status, phase: c.phase, completedAt: c.completedAt });
          await log(store, c, "warn", "No companies found. Try a bigger city, another industry, or upload your own list.", clock());
          return finish(store, c, worked, null);
        }
        c.phase = "research";
        await store.updateCampaign(c.id, { phase: c.phase });
      } else return finish(store, c, worked, c.nextRunAt);
    }

    // ── 2. Research each company's own website ──
    if (c.phase === "research") {
      const todo = (await store.listProspects(c.id, { statuses: ["new"] }));
      for (const p of todo) {
        if (!timeLeft() || !(await stillRunning())) break;
        if (p.nextActionAt && Date.parse(p.nextActionAt) > clock().getTime()) continue;
        try {
          const r = deps.fetcher ? await researchWebsite(deps.fetcher, p, cfg) : null;
          const company = { ...p.company };
          if (r) {
            company.description = r.description || company.description;
            if (!company.phone && r.phone) { company.phone = r.phone; company.phoneType = r.phone.startsWith("+91") && /^\+91[6-9]/.test(r.phone) ? "mobile" : "general"; }
            if (company.phoneType === "unverified" && r.evidence.some((e) => e.field === "phone" && e.value === company.phone)) company.phoneType = /^\+91[6-9]/.test(company.phone!) ? "mobile" : "general";
            if (!company.email && r.email) company.email = r.email;
            company.branches = Math.max(company.branches, r.branches);
          }
          // List contacts confirmed on the company's site become verified.
          const contacts = [...p.contacts];
          for (const fc of r?.contacts || []) {
            const same = contacts.find((x) => x.name && fc.name && x.name.toLowerCase() === fc.name.toLowerCase());
            if (same) { same.verified = true; same.role = same.role || fc.role; same.sourceUrl = fc.sourceUrl; same.decisionMaker = same.decisionMaker || fc.decisionMaker; if (fc.phone) { same.phone = fc.phone; same.phoneType = "direct"; } same.email = same.email || fc.email; }
            else contacts.push(fc);
          }
          await store.updateProspect(p.id, {
            company, contacts, evidence: [...p.evidence, ...(r?.evidence || [])], signals: r?.signals || [], status: "research_completed",
            statusReason: r?.notes.length ? r.notes.join("; ") : null, nextActionAt: null,
          });
        } catch (e: any) {
          const tries = p.researchTries + 1;
          const msg = `Research failed: ${String(e?.message || e).slice(0, 200)}`;
          await store.addEvent(c.id, p.id, "error", { step: "research", message: msg, tries });
          if (tries >= 3) await store.updateProspect(p.id, { status: "research_completed", researchTries: tries, errors: [...p.errors, msg], statusReason: "Website research failed 3 times — scored on the source record only" });
          else await store.updateProspect(p.id, { researchTries: tries, errors: [...p.errors, msg], nextActionAt: new Date(clock().getTime() + backoffMs(tries)).toISOString() });
        }
        worked++;
      }
      const left = await store.listProspects(c.id, { statuses: ["new"] });
      if (left.length) return finish(store, c, worked, earliest(left));
      c.phase = "score";
      await store.updateCampaign(c.id, { phase: c.phase });
      await log(store, c, "info", "Research finished — scoring and checking every company", clock());
    }

    // ── 3. Score, check suppression lists, prepare the call plan ──
    if (c.phase === "score") {
      for (const p of await store.listProspects(c.id, { statuses: ["research_completed"] })) {
        if (!timeLeft() || !(await stillRunning())) break;
        await qualify(deps, c, p, clock());
        worked++;
      }
      if ((await store.listProspects(c.id, { statuses: ["research_completed"] })).length) return finish(store, c, worked, null);
      c.phase = "call";
      await store.updateCampaign(c.id, { phase: c.phase });
      const ready = (await store.listProspects(c.id, { statuses: ["ready"] })).length;
      await log(store, c, "info", `${ready} prospect(s) qualified and call-ready`, clock());
    }

    // ── 4. Call, book, update CRM, schedule follow-ups ──
    if (c.phase === "call" || c.phase === "follow_up") {
      const now = clock();
      const due = (await store.listProspects(c.id, { statuses: CALLABLE })).filter((p) => p.attempts < cfg.maxAttempts && (!p.nextActionAt || Date.parse(p.nextActionAt) <= now.getTime()));
      if (due.length && !insideCallingHours(cfg, now)) {
        const next = nextCallingTime(cfg, now).toISOString();
        await store.updateCampaign(c.id, { nextRunAt: next });
        if (!c.log.slice(-1)[0]?.msg.startsWith("Outside calling hours")) await log(store, c, "info", `Outside calling hours — calls resume ${slotLabel(next, cfg.timezone)}`, now);
        return finish(store, c, worked, next);
      }
      for (const p of due) {
        if (!timeLeft() || !(await stillRunning())) break;
        await callOne(deps, c, p, clock());
        worked++;
      }
      // Anyone out of attempts is handed to a person.
      for (const p of await store.listProspects(c.id, { statuses: CALLABLE })) {
        if (p.attempts >= cfg.maxAttempts) await store.updateProspect(p.id, { status: "needs_other_approach", statusReason: `No decision reached after ${p.attempts} attempt(s) — try email or a manual call`, nextActionAt: null });
      }
      const open = await store.listProspects(c.id, { statuses: [...CALLABLE, "calling"] });
      if (!open.length) {
        c.status = "completed"; c.phase = "done"; c.completedAt = clock().toISOString();
        await store.updateCampaign(c.id, { status: c.status, phase: c.phase, completedAt: c.completedAt, nextRunAt: null });
        await log(store, c, "info", "Campaign complete — every prospect has an outcome", clock());
        return finish(store, c, worked, null);
      }
      const soonest = earliest(open);
      const anyDueNow = open.some((p) => !p.nextActionAt || Date.parse(p.nextActionAt) <= clock().getTime());
      if (!anyDueNow && c.phase !== "follow_up") { c.phase = "follow_up"; await store.updateCampaign(c.id, { phase: c.phase }); }
      if (anyDueNow && c.phase === "follow_up") { c.phase = "call"; await store.updateCampaign(c.id, { phase: c.phase }); }
      return finish(store, c, worked, anyDueNow ? clock().toISOString() : soonest);
    }
    return finish(store, c, worked, null);
  } catch (e: any) {
    await store.addEvent(c!.id, null, "error", { step: "tick", message: String(e?.message || e) }).catch(() => {});
    await log(store, c!, "error", `Engine error: ${String(e?.message || e).slice(0, 300)} — progress is saved; it will continue on the next run`, clock()).catch(() => {});
    return { campaign: c!, worked, done: false, waitingUntil: new Date(clock().getTime() + 60_000).toISOString(), message: String(e?.message || e) };
  } finally {
    await store.unlock(campaignId).catch(() => {});
  }
}

function earliest(ps: Prospect[]): string | null {
  const t = ps.map((p) => (p.nextActionAt ? Date.parse(p.nextActionAt) : 0)).filter((x) => x > 0).sort((a, b) => a - b)[0];
  return t ? new Date(t).toISOString() : null;
}

async function finish(store: Store, c: Campaign, worked: number, waitingUntil: string | null): Promise<TickResult> {
  if (waitingUntil !== undefined) await store.updateCampaign(c.id, { nextRunAt: waitingUntil }).catch(() => {});
  const fresh = (await store.getCampaign(c.id)) || c;
  return { campaign: fresh, worked, done: ["completed", "cancelled", "failed"].includes(fresh.status), waitingUntil };
}

/** Score, run the do-not-contact checks and prepare the call plan. */
async function qualify(deps: Deps, c: Campaign, p: Prospect, now: Date) {
  const { store } = deps;
  const cfg = c.config;
  const phones = [p.company.phone, ...p.contacts.map((x) => x.phone)].filter(Boolean) as string[];
  const emails = [p.company.email, ...p.contacts.map((x) => x.email)].filter(Boolean) as string[];
  for (const ph of phones.length ? phones : [null]) {
    for (const em of emails.length ? emails : [null]) {
      const hit = await store.checkSuppression({ phone: ph, email: em, domain: p.company.domain });
      if (!hit) continue;
      if (hit.source === "crm" && p.source === "crm") continue; // the CRM itself was the source
      const optedOut = hit.source !== "crm";
      await store.updateProspect(p.id, { status: optedOut ? "opted_out" : "disqualified", statusReason: hit.reason });
      await store.addEvent(c.id, p.id, "suppressed", { reason: hit.reason, source: hit.source });
      return;
    }
  }
  const s = scoreProspect(p, cfg, now);
  const best = bestContact({ ...p });
  if (s.score < cfg.minScore) {
    await store.updateProspect(p.id, { score: s.score, scoreReasons: s.reasons, hypotheses: s.hypotheses, status: "disqualified", statusReason: `Score ${s.score} is below the campaign minimum of ${cfg.minScore}` });
    return;
  }
  if (!best.phone) {
    const email = best.person?.email || p.company.email;
    await store.updateProspect(p.id, {
      score: s.score, scoreReasons: s.reasons, hypotheses: s.hypotheses, status: email ? "needs_other_approach" : "disqualified",
      statusReason: email ? `No phone number found — send a personalised email to ${email}` : "No phone number or email found",
    });
    return;
  }
  const plan = buildOutreach(p, cfg);
  const bad = unsafeClaims(plan);
  if (bad.length) {
    await store.updateProspect(p.id, { score: s.score, scoreReasons: s.reasons, hypotheses: s.hypotheses, status: "blocked", statusReason: `Call script failed safety checks: ${bad.join(", ")}` });
    return;
  }
  await store.updateProspect(p.id, {
    score: s.score, scoreReasons: s.reasons, hypotheses: s.hypotheses, outreach: plan, status: "ready",
    statusReason: best.phoneType === "direct" ? `Direct line for ${best.person?.name}` : best.person?.decisionMaker ? `Ask for ${best.person.name} via the company number` : "Company number — ask for the person who handles sales calls",
  });
}

/** One call attempt and everything that follows from it. */
async function callOne(deps: Deps, c: Campaign, p: Prospect, now: Date) {
  const { store, crm } = deps;
  const cfg = c.config;
  const best = bestContact(p);
  const phone = best.phone;
  if (!phone || !p.outreach) { await store.updateProspect(p.id, { status: "needs_other_approach", statusReason: "Nothing to call" }); return; }

  // Re-check opt-outs right before dialling: someone may have opted out from another call since scoring.
  const hit = await store.checkSuppression({ phone, email: best.person?.email || p.company.email, domain: p.company.domain });
  if (hit && !(hit.source === "crm" && p.source === "crm")) { await store.updateProspect(p.id, { status: hit.source === "crm" ? "disqualified" : "opted_out", statusReason: hit.reason }); return; }

  // Front desk keeps answering and there's no direct line: stop calling reception, hand over another route.
  const directLine = best.phoneType === "direct" || best.phoneType === "mobile";
  if (p.status === "receptionist" && p.frontDeskAttempts >= 2 && !directLine) {
    const email = best.person?.email || p.company.email;
    await store.updateProspect(p.id, { status: "needs_other_approach", statusReason: `Reached reception ${p.frontDeskAttempts} times with no direct line${email ? ` — email ${email}` : " — try LinkedIn InMail or a referral"}`, nextActionAt: null });
    return;
  }

  const blocker = liveCallBlocker(cfg, p, deps.liveEnv);
  if (c.mode === "live") {
    if (blocker) { await store.updateProspect(p.id, { status: "blocked", statusReason: blocker, nextActionAt: null }); await store.addEvent(c.id, p.id, "status", { blocked: blocker }); return; }
    if (!deps.voice.live) { await store.updateProspect(p.id, { status: "blocked", statusReason: "Live mode, but only the simulator is connected — no real call placed" }); return; }
  } else if (deps.voice.live) {
    // Simulation must never reach a real phone.
    throw new Error("Refusing to place a real call in simulation mode");
  }

  const slots: Slot[] = await deps.booking.freeSlots(cfg.demo, now, 3, cfg.timezone).catch(() => []);
  // Mark the attempt BEFORE dialling so an interruption can never cause a second call.
  await store.updateProspect(p.id, { status: "calling", attempts: p.attempts + 1 });
  let result;
  try {
    result = await deps.voice.call({ prospect: { ...p, attempts: p.attempts }, plan: p.outreach, phone, slots, askFor: best.person?.name || null, now });
  } catch (e: any) {
    const msg = `Call failed: ${String(e?.message || e).slice(0, 200)}`;
    await store.updateProspect(p.id, { status: p.status, errors: [...p.errors, msg], nextActionAt: new Date(now.getTime() + backoffMs(p.attempts + 1)).toISOString() });
    await store.addEvent(c.id, p.id, "error", { step: "call", message: msg });
    return;
  }
  await store.addEvent(c.id, p.id, "call", { ...result, wouldBeBlockedLive: c.mode === "simulation" ? blocker : null, phone, phoneType: best.phoneType, attempt: p.attempts + 1 });
  const attempts = p.attempts + 1;
  const base = { lastCall: result, attempts };
  const syncCrm = async (u: CrmUpdate) => {
    try { const id = await crm.upsert({ ...p, ...base }, u); await store.updateProspect(p.id, { crmDealId: id }); await store.addEvent(c.id, p.id, "crm", { stage: u.stage, dealId: id }); }
    catch (e: any) { await store.addEvent(c.id, p.id, "error", { step: "crm", message: String(e?.message || e) }); await store.updateProspect(p.id, { errors: [...p.errors, `CRM update failed: ${e?.message || e}`] }); }
  };
  const tag = result.simulated ? "[SIMULATED] " : "";
  const transcriptNote = result.transcript.slice(0, 12).map((l) => `${l.who === "agent" ? "Rana" : "Them"}: ${l.text}`).join("\n");

  switch (result.outcome) {
    case "pending":
      await store.updateProspect(p.id, { ...base, status: "awaiting_outcome", statusReason: `Real call placed (${result.providerCallId}); waiting for the result`, nextActionAt: null });
      return;
    case "no_answer": {
      const next = nextCallingTime(cfg, new Date(now.getTime() + 4 * 3600_000)).toISOString();
      await store.updateProspect(p.id, { ...base, status: "no_answer", statusReason: `No answer (attempt ${attempts}/${cfg.maxAttempts})`, nextActionAt: attempts < cfg.maxAttempts ? next : null });
      return;
    }
    case "referred": {
      const fd = p.frontDeskAttempts + 1;
      const next = nextCallingTime(cfg, new Date(now.getTime() + 24 * 3600_000)).toISOString();
      await store.updateProspect(p.id, { ...base, frontDeskAttempts: fd, status: "receptionist", statusReason: `Reception answered${result.referredTo ? ` and suggested ${result.referredTo}` : ""}`, nextActionAt: next });
      return;
    }
    case "opted_out": {
      for (const ph of [phone, p.company.phone, ...p.contacts.map((x) => x.phone)].filter(Boolean) as string[]) await store.suppress({ phone: ph, reason: "Asked not to be called again", source: "opt_out" });
      await store.suppress({ domain: p.company.domain, email: best.person?.email || p.company.email, reason: "Asked not to be contacted again", source: "opt_out" });
      await store.updateProspect(p.id, { ...base, status: "opted_out", statusReason: "Asked not to be contacted again — added to the do-not-call list", nextActionAt: null });
      await syncCrm({ stage: "not_interested", note: `${tag}Opted out on an AI sales call. Do not contact.\n${transcriptNote}`, lostReason: "Opted out — do not contact" });
      return;
    }
    case "not_interested":
      await store.updateProspect(p.id, { ...base, status: "not_interested", statusReason: (result.objections || []).join(", ") || "Not interested", nextActionAt: null });
      await syncCrm({ stage: "not_interested", note: `${tag}Not interested on the AI sales call.\n${transcriptNote}`, lostReason: (result.objections || [])[0] || "Not interested" });
      return;
    case "callback": {
      const at = result.callbackAt ? nextCallingTime(cfg, new Date(result.callbackAt)).toISOString() : nextCallingTime(cfg, new Date(now.getTime() + 24 * 3600_000)).toISOString();
      await store.updateProspect(p.id, { ...base, status: "callback_requested", statusReason: `Asked for a call back at ${slotLabel(at, cfg.timezone)}`, nextActionAt: at });
      await syncCrm({ stage: "contacted", nextAction: "AI call back (requested by prospect)", nextActionAt: at, note: `${tag}Asked for a call back.\n${transcriptNote}` });
      return;
    }
    case "interested": {
      const slot = result.acceptedSlot != null ? slots[result.acceptedSlot] : null;
      const quals = Object.entries(result.qualification || {}).map(([q, a]) => `${q} → ${a}`).join("\n");
      if (slot) {
        try {
          const b = await deps.booking.book(slot, { ...p, ...base }, c.id, `${tag}${quals}`, cfg.timezone);
          await store.updateProspect(p.id, { ...base, status: "demo_booked", booking: b, statusReason: `Demo booked: ${slot.label}`, nextActionAt: null });
          await store.addEvent(c.id, p.id, "booking", { slotStart: b.slotStart, label: slot.label, bookingId: b.id, simulated: result.simulated });
          await syncCrm({ stage: "prospect", nextAction: `${result.simulated ? "[SIM] " : ""}Demo: ${slot.label}`, nextActionAt: b.slotStart, note: `${tag}Demo booked for ${slot.label}.\n${quals}\n${transcriptNote}` });
          return;
        } catch (e: any) {
          await store.addEvent(c.id, p.id, "booking_failed", { slot: slot.label, message: String(e?.message || e) });
          await store.updateProspect(p.id, { ...base, status: "booking_pending", statusReason: `Agreed to a demo but booking failed (${String(e?.message || e).slice(0, 120)}) — confirm a time manually`, nextActionAt: null });
          await syncCrm({ stage: "contacted", nextAction: "Confirm demo time (automatic booking failed)", nextActionAt: now.toISOString(), note: `${tag}Interested in a demo; booking failed — call back to confirm a time.\n${quals}\n${transcriptNote}` });
          return;
        }
      }
      await store.updateProspect(p.id, { ...base, status: "booking_pending", statusReason: slots.length ? "Interested — didn't pick a slot; confirm a demo time" : "Interested — no free demo slots in the calendar; confirm a time manually", nextActionAt: null });
      await syncCrm({ stage: "contacted", nextAction: "Confirm demo time", nextActionAt: now.toISOString(), note: `${tag}Interested in a demo.\n${quals}\n${transcriptNote}` });
      return;
    }
  }
}

/** Result of a real call, delivered later by the provider's webhook. Opt-outs are applied at once; anything else
 *  goes to a person to review, because judging interest from a live transcript automatically is unreliable. */
export async function recordLiveOutcome(deps: Pick<Deps, "store" | "crm">, prospectId: string, r: { connected: boolean; transcript: string; summary?: string | null; durationSec?: number | null }) {
  const { store } = deps;
  const p = await store.getProspect(prospectId);
  if (!p || p.status !== "awaiting_outcome") return { applied: false };
  const optOut = optOutPhrase(r.transcript);
  const best = bestContact(p);
  if (optOut) {
    for (const ph of [best.phone, p.company.phone].filter(Boolean) as string[]) await store.suppress({ phone: ph, reason: `Said “${optOut}” on a live call`, source: "opt_out" });
    await store.updateProspect(p.id, { status: "opted_out", statusReason: `Opted out on the live call (“${optOut}”)` });
  } else {
    await store.updateProspect(p.id, { status: r.connected ? "decision_maker_reached" : "no_answer", statusReason: r.connected ? "Live call connected — review the transcript and set the next step" : "Live call not answered" });
  }
  try {
    const id = await deps.crm.upsert(p, { stage: optOut ? "not_interested" : "contacted", nextAction: optOut ? null : "Review AI call transcript", nextActionAt: optOut ? null : new Date().toISOString(), note: `Live AI call${r.durationSec ? ` (${r.durationSec}s)` : ""}: ${r.summary || ""}\n${r.transcript.slice(0, 1500)}`, lostReason: optOut ? "Opted out — do not contact" : null });
    await store.updateProspect(p.id, { crmDealId: id });
  } catch { /* CRM is best-effort here; the outcome is already saved */ }
  await store.addEvent(p.campaignId, p.id, "call", { simulated: false, connected: r.connected, outcome: optOut ? "opted_out" : "review", summary: r.summary || null });
  return { applied: true };
}

/** Dashboard numbers, always recomputed from the saved records so they can't drift from reality. */
export function counters(prospects: Prospect[], events: EngineEvent[]): Counters {
  const calls = events.filter((e) => e.kind === "call");
  const is = (...s: ProspectStatus[]) => prospects.filter((p) => s.includes(p.status)).length;
  return {
    companiesDiscovered: prospects.length,
    decisionMakers: prospects.filter((p) => p.contacts.some((x) => x.decisionMaker)).length,
    contactsVerified: prospects.filter((p) => { const b = bestContact(p); return !!b.phone && b.phoneType !== "unverified"; }).length,
    qualified: prospects.filter((p) => p.score != null && p.status !== "disqualified" && p.status !== "opted_out" && !(p.status === "blocked" && !p.lastCall)).length,
    callReady: is("ready"),
    callsAttempted: calls.length,
    callsConnected: calls.filter((e) => e.data?.connected).length,
    decisionMakersReached: calls.filter((e) => e.data?.reached === "decision_maker").length,
    interested: prospects.filter((p) => p.lastCall?.outcome === "interested").length,
    demosBooked: is("demo_booked"),
    bookingsPending: is("booking_pending"),
    followUpsScheduled: prospects.filter((p) => ["callback_requested", "no_answer", "receptionist"].includes(p.status) && !!p.nextActionAt).length,
    disqualified: is("disqualified"),
    optedOut: is("opted_out"),
    needsOtherApproach: is("needs_other_approach"),
    blocked: is("blocked"),
    errors: events.filter((e) => e.kind === "error" || e.kind === "booking_failed").length,
    simulatedCalls: calls.filter((e) => e.data?.simulated === true).length,
    liveCalls: calls.filter((e) => e.data?.simulated === false).length,
  };
}

export { TERMINAL };
