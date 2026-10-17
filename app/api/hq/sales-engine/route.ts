export const runtime = "nodejs";
export const maxDuration = 60;
import { getSession } from "@/lib/session";
import { requireHq } from "@/lib/hq";
import { audit } from "@/lib/audit";
import { launch, tick, counters, DEFAULT_CONFIG } from "@/lib/salesEngine/engine";
import { prodDeps, tablesReady, liveEnv } from "@/lib/salesEngine/prod";
import { SupabaseStore } from "@/lib/salesEngine/supabaseStore";
import { callingWindow } from "@/lib/salesEngine/rules";
import type { CampaignConfig } from "@/lib/salesEngine/types";

/** Merge a posted config onto the defaults, keeping only known fields and sane sizes. */
function cleanConfig(b: any): CampaignConfig {
  const c: any = { ...DEFAULT_CONFIG, demo: { ...DEFAULT_CONFIG.demo } };
  const str = (v: any, n = 200) => String(v ?? "").slice(0, n);
  const num = (v: any, d: number) => (Number.isFinite(+v) ? Math.round(+v) : d);
  const arr = (v: any, n = 12) => (Array.isArray(v) ? v.map((x) => str(x, 80)).filter(Boolean).slice(0, n) : []);
  if (b.name !== undefined) c.name = str(b.name, 120);
  if (["IN", "US", "AU"].includes(b.country)) c.country = b.country;
  if (b.region !== undefined) c.region = str(b.region, 80);
  if (b.industry) c.industry = str(b.industry, 40);
  if (b.subIndustry !== undefined) c.subIndustry = str(b.subIndustry, 80);
  if (["any", "small", "mid", "large"].includes(b.companySize)) c.companySize = b.companySize;
  if (b.companyTypes) c.companyTypes = arr(b.companyTypes);
  if (b.roles) c.roles = arr(b.roles);
  if (b.prospectCount !== undefined) c.prospectCount = num(b.prospectCount, 25);
  if (b.problem !== undefined) c.problem = str(b.problem, 400);
  if (b.useCase !== undefined) c.useCase = str(b.useCase, 300);
  if (["en", "hi", "te", "te-en"].includes(b.language)) c.language = b.language;
  if (b.callingStart !== undefined) c.callingStart = num(b.callingStart, c.callingStart);
  if (b.callingEnd !== undefined) c.callingEnd = num(b.callingEnd, c.callingEnd);
  if (b.timezone) c.timezone = str(b.timezone, 60);
  if (b.maxAttempts !== undefined) c.maxAttempts = num(b.maxAttempts, 3);
  if (b.minScore !== undefined) c.minScore = num(b.minScore, 35);
  if (b.qualification) c.qualification = arr(b.qualification, 4);
  if (b.demo && typeof b.demo === "object") {
    c.demo = {
      days: Array.isArray(b.demo.days) ? b.demo.days.map(Number).filter((d: number) => d >= 0 && d <= 6) : c.demo.days,
      start: num(b.demo.start, c.demo.start), end: num(b.demo.end, c.demo.end), slotMinutes: num(b.demo.slotMinutes, 30),
      timezone: str(b.demo.timezone || c.demo.timezone, 60), bufferHours: num(b.demo.bufferHours, 20), horizonDays: Math.min(30, num(b.demo.horizonDays, 7)),
    };
  }
  if (Array.isArray(b.sources)) c.sources = b.sources.filter((s: any) => ["osm", "list", "crm"].includes(s));
  if (Array.isArray(b.uploadedList)) {
    c.uploadedList = b.uploadedList.slice(0, 500).map((r: any) => ({
      business: str(r.business, 150), website: r.website ? str(r.website, 200) : null, phone: r.phone ? str(r.phone, 30) : null, email: r.email ? str(r.email, 150) : null,
      city: r.city ? str(r.city, 80) : null, contactName: r.contactName ? str(r.contactName, 100) : null, contactRole: r.contactRole ? str(r.contactRole, 80) : null,
      consent: r.consent === true || /^(y|yes|true|1)$/i.test(String(r.consent || "")),
    })).filter((r: any) => r.business);
  }
  c.mode = b.mode === "live" ? "live" : "simulation";
  return c;
}

function capabilities() {
  const env = liveEnv();
  return {
    liveCalling: env.liveSwitch && env.telephonyReady,
    liveNotes: [
      !env.liveSwitch && "Live calling is OFF (SALES_ENGINE_LIVE_CALLS ≠ 1). Every call is simulated — no cost, no real phones.",
      env.liveSwitch && !env.telephonyReady && "Live switch is on, but SALES_ENGINE_SARVAM_SCRIPT_ID or the Sarvam connection isn't set.",
      !env.indiaTelemarketerOk && "India live calls stay blocked until TRAI telemarketer registration (140-series + DLT) is confirmed.",
      "US & Australia live calls need consent on record for each contact.",
    ].filter(Boolean),
    sources: { osm: "OpenStreetMap (free, ODbL)", list: "Your uploaded list", crm: "Uncalled Sales CRM leads" },
    calendar: "RANA internal demo calendar (no double booking). Not synced to Google Calendar.",
    ai: "No paid AI is used: call plans are templates filled only with verified facts.",
  };
}

/** GET → campaigns with live counters, saved presets, defaults and what this deployment can do. */
export async function GET(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session, "view"); if (denied) return denied;
  if (!(await tablesReady())) return Response.json({ setupNeeded: true, defaults: DEFAULT_CONFIG, capabilities: capabilities() });
  const store = new SupabaseStore(null);
  const [campaigns, presets] = await Promise.all([store.listCampaigns(30), store.listPresets()]);
  const withCounts = await Promise.all(campaigns.map(async (c, i) => {
    if (i >= 10 && !["running", "paused"].includes(c.status)) return { ...c, counters: null };
    const [ps, ev] = await Promise.all([store.listProspects(c.id), store.listEvents(c.id)]);
    return { ...c, config: { ...c.config, uploadedList: undefined, uploadedCount: c.config.uploadedList?.length || 0 }, counters: counters(ps, ev), window: callingWindow(c.config).law };
  }));
  return Response.json({ campaigns: withCounts, presets, defaults: DEFAULT_CONFIG, capabilities: capabilities() });
}

/** POST { action: "launch", config } → creates the campaign and starts it. POST { action: "preset", name, config } → saves a preset. */
export async function POST(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session, "clients"); if (denied) return denied;
  if (!(await tablesReady())) return Response.json({ error: "The Sales Engine tables aren't set up yet. Apply supabase/migrations/20261017_sales_engine.sql first." }, { status: 503 });
  const b = await req.json().catch(() => ({} as any));
  const config = cleanConfig(b.config || {});
  if (b.action === "preset") {
    const name = String(b.name || config.name || "").trim().slice(0, 80);
    if (!name) return Response.json({ error: "Name the preset." }, { status: 400 });
    await new SupabaseStore(null).savePreset(name, { ...config, uploadedList: [] }, session!.email);
    return Response.json({ ok: true });
  }
  if (b.action !== "launch") return Response.json({ error: "Unknown action" }, { status: 400 });
  const deps = await prodDeps(config.mode);
  const r = await launch(deps, config, session!.email);
  if (r.error) return Response.json({ error: r.error, duplicateOf: r.duplicateOf || null }, { status: r.duplicateOf ? 409 : 400 });
  await audit(session!, "campaign_launched", { req, targetType: "sales_engine", targetId: r.campaign!.id, detail: { name: config.name, mode: config.mode, industry: config.industry, country: config.country } }).catch(() => {});
  // Start straight away; the dashboard keeps it moving while open, and the cron does the rest.
  const first = await tick(deps, r.campaign!.id, { budgetMs: 20_000 }).catch(() => null);
  return Response.json({ ok: true, campaign: first?.campaign || r.campaign }, { status: 201 });
}
