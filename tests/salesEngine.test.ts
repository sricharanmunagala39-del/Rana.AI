// End-to-end tests for the Sales Engine, in simulation mode with mocked web, calendar and CRM.
// No network, no real calls. Each test name maps to a scenario in docs/sales-engine.md.
import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStore } from "../lib/salesEngine/store";
import { MemoryCrm } from "../lib/salesEngine/crmAdapter";
import { SimulatedVoice, SarvamLiveVoice, type VoiceAdapter } from "../lib/salesEngine/voice";
import { InternalCalendar, candidateSlots, type BookingAdapter } from "../lib/salesEngine/booking";
import { ListSource, OsmSource, osmToCandidates, type Http, type Source } from "../lib/salesEngine/sources";
import { PoliteFetcher, robotsAllows } from "../lib/salesEngine/research";
import { launch, tick, control, counters, DEFAULT_CONFIG, recordLiveOutcome, type Deps } from "../lib/salesEngine/engine";
import { liveCallBlocker, insideCallingHours } from "../lib/salesEngine/rules";
import { buildOutreach, unsafeClaims } from "../lib/salesEngine/outreach";
import { peopleIn, phonesIn } from "../lib/salesEngine/extract";
import type { CampaignConfig, Prospect, SimScenario } from "../lib/salesEngine/types";

// Tuesday 21 Oct 2026, 11:00 IST — inside calling hours.
const NOW = new Date("2026-10-20T05:30:00Z");

const SITES: Record<string, { status: number; body: string }> = {
  "https://skyline.example/robots.txt": { status: 200, body: "User-agent: *\nDisallow: /private\n" },
  "https://skyline.example": { status: 200, body: `<html><head><title>Skyline Homes</title><meta name="description" content="Premium villas and plots across Hyderabad. Book a site visit today.">
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Skyline Homes","founder":{"@type":"Person","name":"Ravi Kumar","jobTitle":"Founder & CEO","telephone":"+91 98480 11111"}}</script></head>
    <body><h1>Skyline Homes</h1><p>Book a free site visit this weekend. Enquire now!</p><p>We have 6 branches across Telangana.</p>
    <a href="/contact">Contact</a> <a href="/about">About</a> <a href="/private/x">Private</a><footer>© 2026 Skyline Homes. Call: 040 2345 6789</footer></body></html>` },
  "https://skyline.example/contact": { status: 200, body: `<p>Phone: <a href="tel:+914023456789">040 2345 6789</a></p><p><a href="mailto:info@skyline.example">info@skyline.example</a> <a href="mailto:ravi@skyline.example">ravi@skyline.example</a></p>` },
  "https://skyline.example/about": { status: 200, body: `<h2>Leadership</h2><p>Ravi Kumar, Founder & CEO</p><p>Meera Rao — Head of Sales</p>` },
  "https://quiet.example/robots.txt": { status: 404, body: "" },
  "https://quiet.example": { status: 200, body: `<html><body><p>Quiet Realty. © 2017</p></body></html>` },
  "https://blocked.example/robots.txt": { status: 200, body: "User-agent: *\nDisallow: /\n" },
  "https://blocked.example": { status: 200, body: "<p>should never be read</p>" },
};

function fakeHttp(log: string[] = []): Http {
  return async (url) => {
    log.push(url);
    const key = url.replace(/\/$/, "");
    const hit = SITES[key];
    if (!hit) return { status: 404, text: "", url };
    return { status: hit.status, text: hit.body, url: key };
  };
}

const cfg = (over: Partial<CampaignConfig> = {}): CampaignConfig => ({
  ...DEFAULT_CONFIG, name: "Hyd real estate", sources: ["list"], minScore: 20, prospectCount: 10,
  uploadedList: [
    { business: "Skyline Homes", website: "skyline.example", city: "Hyderabad" },
    { business: "Quiet Realty", website: "quiet.example", phone: "040 4000 0000" },
  ],
  ...over,
});

function makeDeps(store: MemoryStore, over: Partial<Deps> = {}): Deps & { crm: MemoryCrm } {
  const crm = new MemoryCrm();
  return {
    store, sources: [new ListSource()], fetcher: new PoliteFetcher(fakeHttp(), 0), voice: new SimulatedVoice(),
    booking: new InternalCalendar(store), crm, liveEnv: { liveSwitch: false, telephonyReady: false, indiaTelemarketerOk: false },
    now: () => NOW, ...over,
  } as any;
}

// Preparation runs "at night" (outside calling hours) so it stops at the call phase without dialling.
const NIGHT = new Date("2026-10-19T17:30:00Z");
async function runUntil(deps: Deps, id: string, phase: string, max = 20) {
  for (let i = 0; i < max; i++) {
    const r = await tick({ ...deps, now: () => NIGHT }, id, { budgetMs: 5000, maxItems: 50 });
    if (r.campaign.phase === phase || r.done) return r;
  }
  throw new Error("did not reach " + phase);
}

/** Launch, research and qualify; then force each prospect's simulated call scenario. */
async function readyCampaign(store: MemoryStore, deps: Deps, scenario: SimScenario, over: Partial<CampaignConfig> = {}) {
  const { campaign } = await launch(deps, cfg(over), "test@ranaai.in");
  await runUntil(deps, campaign!.id, "call");
  for (const p of await store.listProspects(campaign!.id)) await store.updateProspect(p.id, { simScenario: scenario });
  return campaign!;
}

let store: MemoryStore;
beforeEach(() => { store = new MemoryStore(); });

describe("discovery, research and qualification", () => {
  it("1. discovers and saves companies with source evidence", async () => {
    const deps = makeDeps(store);
    const { campaign } = await launch(deps, cfg(), "t");
    await tick(deps, campaign!.id);
    const ps = await store.listProspects(campaign!.id);
    expect(ps.map((p) => p.company.name).sort()).toEqual(["Quiet Realty", "Skyline Homes"]);
    expect(ps.every((p) => p.evidence.some((e) => e.field === "name"))).toBe(true);
  });

  it("1b. turns OpenStreetMap results into candidates with OSM source links", async () => {
    const http: Http = async () => ({ status: 200, url: "x", text: JSON.stringify({ elements: [
      { type: "node", id: 42, tags: { name: "Lotus Estates", office: "estate_agent", website: "lotus.example", phone: "+91 40 1111 2222", "addr:city": "Hyderabad" } },
      { type: "node", id: 43, tags: { office: "estate_agent" } }, // no name → skipped
    ] }) });
    const found = await new OsmSource(http).find(cfg({ sources: ["osm"] }), 5);
    expect(found).toHaveLength(1);
    expect(found[0].evidence[0].url).toBe("https://www.openstreetmap.org/node/42");
    expect(found[0].company.phone).toBe("+914011112222");
  });

  it("2. finds a decision-maker with verified source evidence on the company's own site", async () => {
    const deps = makeDeps(store);
    const { campaign } = await launch(deps, cfg(), "t");
    await runUntil(deps, campaign!.id, "call");
    const p = (await store.listProspects(campaign!.id)).find((x) => x.company.name === "Skyline Homes")!;
    const ravi = p.contacts.find((c) => c.name === "Ravi Kumar")!;
    expect(ravi.decisionMaker).toBe(true);
    expect(ravi.verified).toBe(true);
    expect(ravi.phoneType).toBe("direct");
    expect(ravi.phone).toBe("+919848011111");
    expect(ravi.sourceUrl).toMatch(/skyline\.example/);
    expect(ravi.email).toBe("ravi@skyline.example");
    expect(p.contacts.find((c) => c.name === "Meera Rao")?.role).toMatch(/Head of Sales/);
    expect(p.signals.map((s) => s.key)).toEqual(expect.arrayContaining(["site_visit", "branches", "enquiries"]));
    expect(p.status).toBe("ready");
  });

  it("3. handles a lead with no phone: email path, never a made-up number", async () => {
    const deps = makeDeps(store);
    const { campaign } = await launch(deps, cfg({ minScore: 0, uploadedList: [{ business: "Mail Only Ltd", email: "owner@mailonly.example" }, { business: "Ghost Co" }] }), "t");
    await runUntil(deps, campaign!.id, "call");
    const ps = await store.listProspects(campaign!.id);
    const mail = ps.find((p) => p.company.name === "Mail Only Ltd")!;
    expect(mail.status).toBe("needs_other_approach");
    expect(mail.statusReason).toMatch(/owner@mailonly\.example/);
    expect(ps.find((p) => p.company.name === "Ghost Co")!.status).toBe("disqualified");
    expect(ps.every((p) => !p.company.phone)).toBe(true);
  });

  it("4. detects duplicate companies and contacts (in a batch, across campaigns, and in the CRM)", async () => {
    const deps = makeDeps(store);
    store.crmPhones.add("+914040000000"); // Quiet Realty's number is already a CRM lead
    const dupList = [...cfg().uploadedList!, { business: "Skyline Homes (dup)", website: "https://www.skyline.example/" }];
    const { campaign } = await launch(deps, cfg({ uploadedList: dupList }), "t");
    await runUntil(deps, campaign!.id, "call");
    const ps = await store.listProspects(campaign!.id);
    expect(ps.filter((p) => p.company.domain === "skyline.example")).toHaveLength(1);
    expect(ps.find((p) => p.company.name === "Quiet Realty")!.statusReason).toMatch(/Already in the Sales CRM/);
    // Same companies in a second campaign are skipped, not called twice.
    const second = await launch(deps, cfg({ name: "Again", region: "Secunderabad" }), "t");
    await tick(deps, second.campaign!.id);
    expect(await store.listProspects(second.campaign!.id)).toHaveLength(0);
    // And the identical campaign can't be launched twice while open.
    const twin = await launch(deps, cfg({ uploadedList: dupList, name: "Twin" }), "t");
    expect(twin.error).toMatch(/identical campaign/);
  });

  it("5. filters out a low-scoring prospect with written reasons", async () => {
    const deps = makeDeps(store);
    const { campaign } = await launch(deps, cfg({ minScore: 40 }), "t");
    await runUntil(deps, campaign!.id, "call");
    const quiet = (await store.listProspects(campaign!.id)).find((p) => p.company.name === "Quiet Realty")!;
    // Quiet Realty is also already in nobody's CRM here, so it is judged on score alone.
    expect(quiet.status).toBe("disqualified");
    expect(quiet.statusReason).toMatch(/below the campaign minimum/);
    expect(quiet.scoreReasons.length).toBeGreaterThan(0);
    expect(quiet.scoreReasons.some((r) => r.kind === "hypothesis")).toBe(true);
    const sky = (await store.listProspects(campaign!.id)).find((p) => p.company.name === "Skyline Homes")!;
    expect(sky.score!).toBeGreaterThan(60);
    expect(sky.scoreReasons.filter((r) => r.kind === "fact").every((r) => r.url)).toBe(true);
  });

  it("6. prepares a personalised, grounded, honest call plan in each language", async () => {
    const deps = makeDeps(store);
    const { campaign } = await launch(deps, cfg(), "t");
    await runUntil(deps, campaign!.id, "call");
    const sky = (await store.listProspects(campaign!.id)).find((p) => p.company.name === "Skyline Homes")!;
    expect(sky.outreach!.opening).toMatch(/Ravi/);
    expect(sky.outreach!.opening).toMatch(/AI assistant/);
    expect(sky.outreach!.problem).toMatch(/site-visit/);
    expect(sky.outreach!.groundedOn[0].url).toMatch(/skyline\.example/);
    expect(unsafeClaims(sky.outreach!)).toEqual([]);
    for (const language of ["hi", "te", "te-en"] as const) {
      const plan = buildOutreach(sky, cfg({ language }));
      expect(unsafeClaims(plan)).toEqual([]);
      expect(plan.language).toBe(language);
    }
    expect(buildOutreach(sky, cfg({ language: "te" })).opening).toMatch(/నమస్కారం/);
  });
});

describe("simulated calls", () => {
  it("7. reaches a receptionist, asks politely, then stops calling the front desk", async () => {
    const deps = makeDeps(store);
    const c = await readyCampaign(store, deps, "receptionist", { uploadedList: [{ business: "Front Desk Co", website: "quiet.example", phone: "040 4000 0000" }], minScore: 0 });
    let p = (await store.listProspects(c.id))[0];
    await tick(deps, c.id);
    p = (await store.getProspect(p.id))!;
    expect(p.status).toBe("receptionist");
    expect(p.lastCall!.transcript.some((l) => /who looks after/i.test(l.text))).toBe(true);
    // Second front-desk call, then the engine stops and asks for another route.
    await store.updateProspect(p.id, { nextActionAt: null });
    await tick(deps, c.id);
    await store.updateProspect(p.id, { nextActionAt: null });
    await tick(deps, c.id);
    p = (await store.getProspect(p.id))!;
    expect(p.status).toBe("needs_other_approach");
    expect(p.frontDeskAttempts).toBe(2);
    expect(p.attempts).toBe(2);
  });

  it("8 & 12. reaches the decision-maker, who books a real free slot", async () => {
    const deps = makeDeps(store);
    const c = await readyCampaign(store, deps, "interested_book");
    await tick(deps, c.id);
    const sky = (await store.listProspects(c.id)).find((p) => p.company.name === "Skyline Homes")!;
    expect(sky.lastCall!.reached).toBe("decision_maker");
    expect(sky.lastCall!.simulated).toBe(true);
    expect(sky.status).toBe("demo_booked");
    expect(sky.booking!.slotStart >= new Date(NOW.getTime() + 20 * 3600e3).toISOString()).toBe(true);
    expect(store.bookings).toHaveLength(1);
    const deal = [...deps.crm.deals.values()].find((d) => d.business === "Skyline Homes")!;
    expect(deal.stage).toBe("prospect");
    expect(deal.activities[0]).toMatch(/\[SIMULATED\]/);
  });

  it("12b. two interested prospects never get the same slot", async () => {
    const deps = makeDeps(store);
    const c = await readyCampaign(store, deps, "interested_book", { minScore: 0 });
    await tick(deps, c.id);
    const slots = store.bookings.map((b) => b.slotStart);
    expect(slots.length).toBe(2);
    expect(new Set(slots).size).toBe(2);
  });

  it("9. honours a callback request with a follow-up at that time", async () => {
    const deps = makeDeps(store);
    const c = await readyCampaign(store, deps, "callback");
    await tick(deps, c.id);
    const sky = (await store.listProspects(c.id)).find((p) => p.company.name === "Skyline Homes")!;
    expect(sky.status).toBe("callback_requested");
    expect(Date.parse(sky.nextActionAt!)).toBeGreaterThan(NOW.getTime());
    const deal = [...deps.crm.deals.values()].find((d) => d.business === "Skyline Homes")!;
    expect(deal.stage).toBe("contacted");
    expect(deal.nextActionAt).toBe(sky.nextActionAt);
    expect((await store.getCampaign(c.id))!.phase).toBe("follow_up");
  });

  it("10. records a decline and stops", async () => {
    const deps = makeDeps(store);
    const c = await readyCampaign(store, deps, "decline");
    await tick(deps, c.id);
    const sky = (await store.listProspects(c.id)).find((p) => p.company.name === "Skyline Homes")!;
    expect(sky.status).toBe("not_interested");
    expect([...deps.crm.deals.values()].find((d) => d.business === "Skyline Homes")!.stage).toBe("not_interested");
    expect((await store.getCampaign(c.id))!.status).toBe("completed");
  });

  it("11. applies an opt-out everywhere: suppressed now and in future campaigns", async () => {
    const deps = makeDeps(store);
    const c = await readyCampaign(store, deps, "opt_out");
    await tick(deps, c.id);
    const sky = (await store.listProspects(c.id)).find((p) => p.company.name === "Skyline Homes")!;
    expect(sky.status).toBe("opted_out");
    expect(store.suppressions.some((s) => s.phone === "+919848011111")).toBe(true);
    // A different campaign that finds the same number again must not call it.
    const other = await launch(deps, cfg({ name: "New list", uploadedList: [{ business: "Ravi direct", phone: "98480 11111" }], minScore: 0 }), "t");
    await runUntil(deps, other.campaign!.id, "call");
    const again = (await store.listProspects(other.campaign!.id))[0];
    expect(again.status).toBe("opted_out");
  });

  it("13. a failed booking is NOT reported as booked", async () => {
    const failing: BookingAdapter = { id: "broken", freeSlots: new InternalCalendar(store).freeSlots.bind(new InternalCalendar(store)), book: async () => { throw new Error("Calendar API down"); } };
    const deps = makeDeps(store, { booking: failing });
    const c = await readyCampaign(store, deps, "interested_book");
    await tick(deps, c.id);
    const sky = (await store.listProspects(c.id)).find((p) => p.company.name === "Skyline Homes")!;
    expect(sky.status).toBe("booking_pending");
    expect(sky.booking).toBeNull();
    expect(store.bookings).toHaveLength(0);
    const n = counters(await store.listProspects(c.id), await store.listEvents(c.id));
    expect(n.demosBooked).toBe(0);
    expect(n.bookingsPending).toBe(1);
    expect((await store.listEvents(c.id)).some((e) => e.kind === "booking_failed")).toBe(true);
  });
});

describe("reliability, control and safety", () => {
  it("14. recovers when a worker or API fails mid-run, without repeating calls", async () => {
    const deps = makeDeps(store);
    const c = await readyCampaign(store, deps, "no_answer");
    // Voice provider throws on the first attempt.
    let calls = 0;
    const flaky: VoiceAdapter = { id: "flaky", live: false, notReady: () => null, call: async (i) => { calls++; if (calls === 1) throw new Error("socket hang up"); return new SimulatedVoice().call(i); } };
    const r = await tick({ ...deps, voice: flaky }, c.id);
    expect(r.campaign.status).toBe("running");
    const errored = (await store.listProspects(c.id)).find((p) => p.errors.length)!;
    expect(errored.errors[0]).toMatch(/socket hang up/);
    expect(errored.nextActionAt).not.toBeNull();
    // A crashed step left in "calling" is recovered as not-redialled.
    await store.updateProspect(errored.id, { status: "calling" });
    store.prospects.get(errored.id)!.updatedAt = new Date(NOW.getTime() - 3600e3).toISOString();
    await tick(deps, c.id);
    expect((await store.getCampaign(c.id))!.log.some((l) => /Recovered .* interrupted call/.test(l.msg))).toBe(true);
    expect((await store.getProspect(errored.id))!.status).not.toBe("calling");
    // A source that throws is retried with back-off, then given up after 3 tries.
    const bad: Source = { id: "osm", label: "OSM", find: async () => { throw new Error("429 busy"); } };
    const s2 = new MemoryStore();
    const d2 = makeDeps(s2, { sources: [bad] });
    const l = await launch(d2, cfg({ sources: ["osm"], name: "osm" }), "t");
    for (let i = 0; i < 3; i++) await tick(d2, l.campaign!.id);
    const after = (await s2.getCampaign(l.campaign!.id))!;
    expect(after.sourceTries.osm).toBe(3);
    expect(after.status).toBe("completed");
    expect(after.log.some((x) => /No companies found/.test(x.msg))).toBe(true);
  });

  it("14b. concurrent ticks don't double-process (lock)", async () => {
    const deps = makeDeps(store);
    const c = await readyCampaign(store, deps, "decline");
    const ready = (await store.listProspects(c.id, { statuses: ["ready"] })).length;
    expect(ready).toBeGreaterThan(0);
    const [a, b] = await Promise.all([tick(deps, c.id), tick(deps, c.id)]);
    expect([a.message, b.message]).toContain("Another worker is running this campaign");
    await tick(deps, c.id);
    // Every ready prospect called exactly once, no matter how many workers ran.
    const calls = (await store.listEvents(c.id)).filter((e) => e.kind === "call");
    expect(calls).toHaveLength(ready);
    expect(new Set(calls.map((e) => e.prospectId)).size).toBe(ready);
  });

  it("15. pause, resume and cancel", async () => {
    const deps = makeDeps(store);
    const c = await readyCampaign(store, deps, "decline");
    expect((await control(store, c.id, "pause", "t")).campaign!.status).toBe("paused");
    const r = await tick(deps, c.id);
    expect(r.worked).toBe(0);
    expect((await store.listEvents(c.id)).filter((e) => e.kind === "call")).toHaveLength(0);
    expect((await control(store, c.id, "resume", "t")).campaign!.status).toBe("running");
    expect((await control(store, c.id, "cancel", "t")).campaign!.status).toBe("cancelled");
    await tick(deps, c.id);
    expect((await store.listEvents(c.id)).filter((e) => e.kind === "call")).toHaveLength(0);
    expect((await control(store, c.id, "resume", "t")).error).toMatch(/cancelled/);
  });

  it("16. no live call happens without a live telephony integration and passed checks", async () => {
    let placed = 0;
    const live = new SarvamLiveVoice(async () => { placed++; return { attemptId: "a1" }; }, null);
    // Launching live with the switch off is refused outright.
    const off = await launch(makeDeps(store, { voice: live }), cfg({ mode: "live" }), "t");
    expect(off.error).toMatch(/switched off/);
    // Switch on but India telemarketer registration not confirmed → prospects blocked, nothing dialled.
    const deps = makeDeps(store, { voice: live, liveEnv: { liveSwitch: true, telephonyReady: true, indiaTelemarketerOk: false } });
    const { campaign } = await launch(deps, cfg({ mode: "live" }), "t");
    await runUntil(deps, campaign!.id, "call");
    await tick(deps, campaign!.id);
    expect(placed).toBe(0);
    const sky = (await store.listProspects(campaign!.id)).find((p) => p.company.name === "Skyline Homes")!;
    expect(sky.status).toBe("blocked");
    expect(sky.statusReason).toMatch(/TRAI/);
    // Simulation mode wired to a live adapter refuses to dial.
    const s2 = new MemoryStore();
    const d2 = makeDeps(s2, { voice: live });
    const c2 = await readyCampaign(s2, d2, "decline");
    await tick(d2, c2.id);
    expect(placed).toBe(0);
    // US/AU need consent on record even when everything else is on.
    expect(liveCallBlocker(cfg({ country: "US" }), sky, { liveSwitch: true, telephonyReady: true, indiaTelemarketerOk: true })).toMatch(/TCPA/);
    expect(liveCallBlocker(cfg({ country: "AU" }), sky, { liveSwitch: true, telephonyReady: true, indiaTelemarketerOk: true })).toMatch(/Do Not Call Register/);
  });

  it("16b. a live call that is placed waits for the real outcome; a spoken opt-out is applied", async () => {
    let placed = 0;
    const live = new SarvamLiveVoice(async () => { placed++; return { attemptId: `att-${placed}` }; }, null);
    const deps = makeDeps(store, { voice: live, liveEnv: { liveSwitch: true, telephonyReady: true, indiaTelemarketerOk: true } });
    const { campaign } = await launch(deps, cfg({ mode: "live" }), "t");
    await runUntil(deps, campaign!.id, "call");
    await tick(deps, campaign!.id);
    const sky = (await store.listProspects(campaign!.id)).find((p) => p.company.name === "Skyline Homes")!;
    expect(sky.status).toBe("awaiting_outcome");
    expect(placed).toBeGreaterThan(0);
    await recordLiveOutcome(deps, sky.id, { connected: true, transcript: "Rana: ... Them: please remove my number from your list" });
    expect((await store.getProspect(sky.id))!.status).toBe("opted_out");
  });

  it("16c. respects calling hours (no calls at night or on Sunday)", async () => {
    const night = new Date("2026-10-20T17:30:00Z"); // 11pm IST
    const sunday = new Date("2026-10-25T06:30:00Z");
    expect(insideCallingHours(cfg(), night)).toBe(false);
    expect(insideCallingHours(cfg(), sunday)).toBe(false);
    const deps = makeDeps(store);
    const c = await readyCampaign(store, deps, "decline");
    const r = await tick({ ...deps, now: () => night }, c.id);
    expect((await store.listEvents(c.id)).filter((e) => e.kind === "call")).toHaveLength(0);
    expect(r.waitingUntil).not.toBeNull();
  });

  it("17. works with every paid service off (no LLM, no live telephony, no paid data)", async () => {
    const saved = { a: process.env.ANTHROPIC_API_KEY, o: process.env.OPENAI_API_KEY, s: process.env.SARVAM_API_KEY };
    delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENAI_API_KEY; delete process.env.SARVAM_API_KEY;
    try {
      const deps = makeDeps(store);
      const { campaign } = await launch(deps, cfg(), "t");
      for (let i = 0; i < 10; i++) await tick(deps, campaign!.id);
      const c = (await store.getCampaign(campaign!.id))!;
      expect(["follow_up", "done", "call"]).toContain(c.phase);
      expect((await store.listEvents(campaign!.id)).filter((e) => e.kind === "call").every((e) => e.data.simulated)).toBe(true);
    } finally { Object.assign(process.env, { ANTHROPIC_API_KEY: saved.a, OPENAI_API_KEY: saved.o, SARVAM_API_KEY: saved.s }); }
  });

  it("18. dashboard counters match the saved records exactly", async () => {
    const deps = makeDeps(store);
    const { campaign } = await launch(deps, cfg({ minScore: 0, uploadedList: [
      { business: "A Homes", website: "skyline.example" },
      { business: "B Realty", phone: "98480 22222" },
      { business: "C Estates", phone: "98480 33333" },
      { business: "D Mail", email: "d@d.example" },
    ] }), "t");
    await runUntil(deps, campaign!.id, "call");
    const ps = await store.listProspects(campaign!.id);
    const set = async (name: string, s: SimScenario) => store.updateProspect(ps.find((p) => p.company.name === name)!.id, { simScenario: s });
    await set("A Homes", "interested_book"); await set("B Realty", "callback"); await set("C Estates", "opt_out");
    await tick(deps, campaign!.id);
    const n = counters(await store.listProspects(campaign!.id), await store.listEvents(campaign!.id));
    expect(n).toMatchObject({ companiesDiscovered: 4, callsAttempted: 3, callsConnected: 3, decisionMakersReached: 3, interested: 1, demosBooked: 1, followUpsScheduled: 1, optedOut: 1, needsOtherApproach: 1, simulatedCalls: 3, liveCalls: 0 });
    expect(store.bookings).toHaveLength(n.demosBooked);
  });
});

describe("helpers", () => {
  it("respects robots.txt and never reads disallowed pages", async () => {
    expect(robotsAllows("User-agent: *\nDisallow: /private\n", "/private/x")).toBe(false);
    expect(robotsAllows("User-agent: *\nDisallow: /private\nAllow: /private/ok", "/private/ok")).toBe(true);
    expect(robotsAllows(null, "/anything")).toBe(true);
    const log: string[] = [];
    const f = new PoliteFetcher(fakeHttp(log), 0);
    const r = await f.get("https://blocked.example");
    expect(r.ok).toBe(false);
    expect(r.blocked).toMatch(/robots/);
    expect(log).not.toContain("https://blocked.example");
  });

  it("extracts only numbers written as phones, and names next to titles", () => {
    expect(phonesIn("<p>Founded 2019. Price ₹45,00,000. Call us: 98480 12345</p>", "IN")).toEqual(["+919848012345"]);
    const people = peopleIn("<p>Our Team</p><p>Anita Sharma, Managing Director</p><p>Read More — Founder</p>", "https://x.example/about", "IN", ["Managing Director"]);
    expect(people.map((p) => p.name)).toEqual(["Anita Sharma"]);
    expect(people[0].decisionMaker).toBe(true);
  });

  it("demo slots follow demo hours, buffer and time zone", () => {
    const slots = candidateSlots({ ...DEFAULT_CONFIG.demo }, NOW, new Date(NOW.getTime() + 3 * 86400e3));
    expect(slots.length).toBeGreaterThan(0);
    expect(slots[0].start.getTime()).toBeGreaterThanOrEqual(NOW.getTime() + 20 * 3600e3);
    // 11:00 IST = 05:30 UTC
    expect(slots[0].start.toISOString().slice(11, 16)).toBe("05:30");
  });

  it("osm parser keeps addresses with evidence", () => {
    const c = osmToCandidates(cfg(), [{ type: "way", id: 7, tags: { name: "X", "addr:street": "Road 1", "addr:city": "Hyderabad" } }]);
    expect(c[0].company.address).toBe("Road 1, Hyderabad");
  });
});

void ({} as Prospect);
