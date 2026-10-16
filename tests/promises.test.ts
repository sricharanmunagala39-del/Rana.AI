// Promise Engine tests. Run: npm test
// Transcript lines below are taken from real RANA calls (Sep–Oct 2026) with names of people and
// businesses replaced by [NAME] / [BUSINESS]. They cover the commitment patterns seen in production.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { detectPromises, industryOf, dedupeKey } from "../lib/promises/detect";
import { resolveDue, parseClock, dueFor } from "../lib/promises/when";
import { newTask, transition, recordAttempt, isOverdue, describe as describeTask, PromiseError } from "../lib/promises/lifecycle";
import { plan, toRow, promiseMode } from "../lib/promises/store";
import type { CallForPromises, DetectedPromise, TranscriptTurn } from "../lib/promises/types";

// 2026-10-16 13:30 IST (a Friday)
const ENDED = "2026-10-16T08:00:00.000Z";
const ist = (iso: string) => new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().slice(0, 16).replace("T", " ");

const call = (turns: [string, string][], extra: Partial<CallForPromises> = {}): CallForPromises => ({
  id: "11111111-1111-1111-1111-111111111111",
  client_id: "22222222-2222-2222-2222-222222222222",
  caller_phone: "+91 98480 12345",
  ended_at: ENDED,
  transcript: turns.map(([role, text]) => ({ role, text })) as TranscriptTurn[],
  ...extra,
});
const kinds = (ps: DetectedPromise[]) => ps.map((p) => p.kind).sort();
const one = (ps: DetectedPromise[], kind: string) => {
  const p = ps.find((x) => x.kind === kind);
  assert.ok(p, `expected a ${kind} promise, got [${kinds(ps).join(", ")}]`);
  return p!;
};

describe("detect — real call patterns", () => {
  test("retail: 'send Hi on WhatsApp and we will send the location' → customer_first send_info, not due yet", () => {
    const ps = detectPromises(call([
      ["user", "Madam, please can you send the location? The shop location."],
      ["agent", "Our store is located in Lakshmi Nagar Colony, near the NTR statue. If you want the location on WhatsApp, please send a 'Hi' to this number you called from, and we will send it immediately."],
    ]));
    assert.deepEqual(kinds(ps), ["send_info"]);
    const p = ps[0];
    assert.equal(p.owed, "customer_first");
    assert.equal(p.item, "location");
    assert.equal(p.channel, "whatsapp");
    assert.equal(p.dueAt, null);
    assert.equal(p.source.from, "agent");
  });

  test("retail: caller refuses to message first — the business owes the send", () => {
    const ps = detectPromises(call([
      ["agent", "Please send 'Hi' on WhatsApp to this number you called from, and we will send you the location."],
      ["user", "I won't send 'Hi' now; you send 'Hi', you send the location."],
      ["agent", "Alright, as soon as you send 'Hi', we will share the location."],
    ]));
    // Still customer_first: the agent never agreed to message first. The task exists so a person can see the gap.
    assert.equal(one(ps, "send_info").owed, "customer_first");
  });

  test("education: counsellor will call → counselling, owed by business, due within a day", () => {
    const ps = detectPromises(call([
      ["user", "Yes, I want to know about the IAS foundation batch."],
      ["agent", "Alright [NAME] garu, then I will arrange your counselling session. Our academic counsellor will call you and fix a time that is convenient for you. Thank you very much for calling [BUSINESS]."],
    ]), { industry: "education" });
    const p = one(ps, "counselling");
    assert.equal(p.owed, "business");
    assert.equal(p.dueText, "default");
    assert.equal(new Date(p.dueAt!).getTime() - new Date(ENDED).getTime(), 24 * 3600_000);
  });

  test("education: offer accepted — 'Shall I send the brochure on WhatsApp and call again on Monday?' → yes", () => {
    const ps = detectPromises(call([
      ["agent", "Of course. Shall I send the brochure on WhatsApp and call again on Monday?"],
      ["user", "Okay, send it."],
    ]));
    assert.deepEqual(kinds(ps), ["callback", "send_info"]);
    const send = one(ps, "send_info");
    assert.equal(send.item, "brochure");
    assert.equal(send.confidence, "high");
    const cb = one(ps, "callback");
    assert.equal(cb.dueText, "monday");
    assert.equal(ist(cb.dueAt!), "2026-10-19 11:00");
  });

  test("offer declined → no promise", () => {
    const ps = detectPromises(call([
      ["agent", "Shall I send the brochure on WhatsApp?"],
      ["user", "No, not now."],
    ]));
    assert.equal(ps.length, 0);
  });

  test("real estate: senior sales advisor will call + book the slot this evening", () => {
    const ps = detectPromises(call([
      ["agent", "We have various plot sizes, but our senior sales advisor can explain the exact details regarding 500 sq yards more clearly. That is why he will call you. If you tell me what time is convenient for you, I will book the slot."],
      ["user", "Book this slot for this evening."],
    ]), { industry: "real_estate" });
    assert.deepEqual(kinds(ps), ["confirm_slot", "connect_human"]);
    assert.equal(one(ps, "confirm_slot").dueText, "today");
    assert.equal(ist(one(ps, "confirm_slot").dueAt!), "2026-10-16 18:00");
  });

  test("real estate: 'I will check if our site team is available at 5 PM and confirm' → site_visit + confirm_slot at 5 PM", () => {
    const ps = detectPromises(call([
      ["user", "Can I come today at 5 PM to see the plots?"],
      ["agent", "Alright, you can also come at 5:00 PM in the evening. However, I will check if our site team is available at that time and confirm it to you."],
    ]), { industry: "real_estate" });
    assert.ok(kinds(ps).includes("confirm_slot"));
    assert.ok(kinds(ps).includes("site_visit"));
    assert.equal(ist(one(ps, "confirm_slot").dueAt!), "2026-10-16 17:00");
  });

  test("connect + callback in one turn is one connect_human promise", () => {
    const ps = detectPromises(call([
      ["user", "Please ask someone to call me."],
      ["agent", "Mr. [NAME], I will connect you with my team member. Whoever is available will call you."],
    ]));
    assert.deepEqual(kinds(ps), ["connect_human"]);
  });

  test("agent promises to text office number + details on WhatsApp → business-owed send", () => {
    const ps = detectPromises(call([
      ["user", "Okay, call me in the evening."],
      ["agent", "Okay [NAME] Sir, I will call you as you said. I will text our office number and all the details to you on WhatsApp."],
    ]));
    const send = one(ps, "send_info");
    assert.equal(send.owed, "business");
    assert.equal(send.item, "office_number");
    assert.equal(one(ps, "callback").dueText, "today");
  });

  test("agent refuses delivery — no send promise from 'we do not deliver'", () => {
    const ps = detectPromises(call([
      ["user", "Can you courier it to Vijayawada?"],
      ["agent", "Sorry, we do not deliver. You can come to the store and buy the clothes."],
    ]));
    assert.equal(ps.length, 0);
  });

  test("pure information call → nothing to track", () => {
    const ps = detectPromises(call([
      ["user", "What are the store timings?"],
      ["agent", "Our store is open every day from ten in the morning until ten at night."],
    ]));
    assert.equal(ps.length, 0);
  });

  test("agent-only transcript (voicemail / no answer) promises nothing", () => {
    const ps = detectPromises(call([["agent", "Hello, I will call you back later. We will send the details on WhatsApp."]]));
    assert.equal(ps.length, 0);
  });

  test("no transcript → falls back to summary", () => {
    const ps = detectPromises(call([], { transcript: [], summary: "The caller inquired about SSC coaching fees and eventually agreed to visit the branch for a demo class at the end of the month." }));
    const p = one(ps, "demo_class");
    assert.equal(p.source.from, "summary");
    assert.equal(p.confidence, "medium");
    assert.equal(p.dueText, "end of the month");
  });

  test("handoff on the call → connect_human due in 10 minutes (what the agent tells callers)", () => {
    const ps = detectPromises(call([["user", "I want to talk to the manager."], ["agent", "Sure — let me connect you to the right person on our team."]], { handoff: { rule: "asks_person", emailed: true } }));
    const p = one(ps, "connect_human");
    assert.equal(p.confidence, "high");
    assert.equal(p.dueText, "default");
    assert.equal(new Date(p.dueAt!).getTime() - new Date(ENDED).getTime(), 10 * 60_000);
  });

  test("dedupe key is stable per (client, call, kind) and differs across kinds", () => {
    const a = detectPromises(call([["agent", "I will call you back tomorrow."], ["user", "ok"]]));
    const b = detectPromises(call([["agent", "I will call you back tomorrow."], ["user", "ok"]]));
    assert.equal(a[0].dedupeKey, b[0].dedupeKey);
    assert.notEqual(dedupeKey("c", "x", "callback"), dedupeKey("c", "x", "send_info"));
  });
});

describe("when — due times (IST)", () => {
  const ref = new Date(ENDED); // Fri 13:30 IST
  test("clock formats", () => {
    assert.deepEqual(parseClock("at 5 pm"), { h: 17, min: 0 });
    assert.deepEqual(parseClock("5:30 PM"), { h: 17, min: 30 });
    assert.deepEqual(parseClock("17:45"), { h: 17, min: 45 });
    assert.deepEqual(parseClock("6 o'clock in the evening"), { h: 18, min: 0 });
    assert.equal(parseClock("no time here"), null);
  });
  test("relative words incl. Telugu/Hindi", () => {
    assert.equal(ist(resolveDue("call me tomorrow", ref)!.at.toISOString()), "2026-10-17 11:00");
    assert.equal(ist(resolveDue("repu call cheyandi", ref)!.at.toISOString()), "2026-10-17 11:00");
    assert.equal(ist(resolveDue("kal 4 pm call karo", ref)!.at.toISOString()), "2026-10-17 16:00");
    assert.equal(ist(resolveDue("within an hour", ref)!.at.toISOString()), "2026-10-16 14:30");
    assert.equal(ist(resolveDue("this evening", ref)!.at.toISOString()), "2026-10-16 18:00");
    assert.equal(ist(resolveDue("on Friday", ref)!.at.toISOString()), "2026-10-23 11:00"); // next Friday, not today
    assert.equal(ist(resolveDue("end of the month", ref)!.at.toISOString()), "2026-10-31 11:00");
  });
  test("a clock time already past today rolls to tomorrow", () => {
    assert.equal(ist(resolveDue("at 9 am", ref)!.at.toISOString()), "2026-10-17 09:00");
  });
  test("no time words → null; dueFor applies the default", () => {
    assert.equal(resolveDue("we will send it", ref), null);
    const d = dueFor("send_info", "business", "we will send it", ref);
    assert.equal(d.dueText, "default");
    assert.equal(new Date(d.dueAt!).getTime() - ref.getTime(), 30 * 60_000);
    assert.deepEqual(dueFor("send_info", "customer_first", "tomorrow", ref), { dueAt: null, dueText: "after the customer messages" });
  });
});

describe("lifecycle — completion needs evidence", () => {
  const detected = () => detectPromises(call([["agent", "I will call you back tomorrow at 4 pm."], ["user", "okay"]]))[0];
  const fresh = () => newTask(detected(), { id: "t1", clientId: "c1", callId: "k1", customerPhone: "+919848012345", customerName: null, now: new Date(ENDED) }).task;

  test("new business-owed task starts 'created'; customer_first starts 'pending'", () => {
    assert.equal(fresh().status, "created");
    const cf = detectPromises(call([["agent", "Please send 'Hi' on WhatsApp and we will send the location."], ["user", "ok"]]))[0];
    assert.equal(newTask(cf, { id: "t2", clientId: "c", callId: "k", customerPhone: null, customerName: null }).task.status, "pending");
  });

  test("cannot complete without evidence, or with empty/unknown evidence", () => {
    const t = transition(fresh(), "in_progress", { actor: "rana" }).task;
    assert.throws(() => transition(t, "completed", { actor: "rana" }), PromiseError);
    assert.throws(() => transition(t, "completed", { actor: "rana", evidence: { type: "message_id", ref: "  " } }), PromiseError);
    assert.throws(() => transition(t, "completed", { actor: "rana", evidence: { type: "agent_said_so" as any, ref: "x" } }), PromiseError);
    assert.throws(() => transition(t, "completed", { actor: "rana", evidence: { type: "human_confirmation", ref: "note" } }), /name who confirmed/);
    const done = transition(t, "completed", { actor: "rana", evidence: { type: "call_id", ref: "call_789" } }).task;
    assert.equal(done.status, "completed");
    assert.equal(done.evidence?.ref, "call_789");
  });

  test("terminal states can't be reopened; failures need a reason; every change needs an actor", () => {
    const t = transition(fresh(), "cancelled", { actor: "hq@ranaai.in", reason: "Customer joined elsewhere" }).task;
    assert.throws(() => transition(t, "in_progress", { actor: "rana" }), /Cannot move a cancelled/);
    assert.throws(() => transition(fresh(), "cancelled", { actor: "rana" }), /needs a reason/);
    assert.throws(() => transition(fresh(), "pending", { actor: " " }), /actor/);
  });

  test("recordAttempt: success without evidence counts as failure; 3 failures → needs_human", () => {
    let t = fresh();
    let r = recordAttempt(t, { ok: true, actor: "whatsapp-bot" });
    assert.equal(r.task.status, "failed");
    assert.match(r.task.lastError!, /evidence/);
    r = recordAttempt(r.task, { ok: false, error: "WhatsApp 131026: undeliverable", actor: "whatsapp-bot" });
    assert.equal(r.task.status, "failed");
    r = recordAttempt(r.task, { ok: false, error: "timeout", actor: "whatsapp-bot" });
    assert.equal(r.task.status, "needs_human");
    assert.equal(r.task.attempts, 3);
    assert.match(describeTask(r.task), /Needs a person/);
  });

  test("recordAttempt: success with provider message id → completed", () => {
    const r = recordAttempt(fresh(), { ok: true, evidence: { type: "message_id", ref: "wamid.HBgM" }, actor: "whatsapp-bot" });
    assert.equal(r.task.status, "completed");
    assert.deepEqual(r.events.map((e) => e.to), ["in_progress", "completed"]);
  });

  test("overdue only for open, business-owed tasks past due", () => {
    const t = fresh(); // due 2026-10-17 16:00 IST
    assert.equal(isOverdue(t, new Date("2026-10-17T09:00:00Z")), false);
    assert.equal(isOverdue(t, new Date("2026-10-17T11:00:00Z")), true);
    assert.equal(isOverdue({ ...t, owed: "customer_first", dueAt: null }, new Date("2030-01-01")), false);
  });
});

describe("store — planning rows (no database)", () => {
  test("mode defaults to off", () => {
    const prev = process.env.RANA_PROMISES;
    delete process.env.RANA_PROMISES;
    assert.equal(promiseMode(), "off");
    process.env.RANA_PROMISES = "shadow";
    assert.equal(promiseMode(), "shadow");
    process.env.RANA_PROMISES = "anything-else";
    assert.equal(promiseMode(), "off");
    if (prev === undefined) delete process.env.RANA_PROMISES; else process.env.RANA_PROMISES = prev;
  });

  test("plan normalises the phone with the existing importer and builds rows that satisfy the DB checks", () => {
    const planned = plan(call([["agent", "Our counsellor will call you tomorrow."], ["user", "Okay"]]), "edtech", new Date(ENDED));
    assert.equal(planned.length, 1);
    const row = toRow(planned[0].task, "shadow");
    assert.equal(row.customer_phone, "+919848012345");
    assert.equal(row.shadow, true);
    assert.equal(row.status, "created");
    assert.equal(row.evidence, null);
    assert.ok(["business", "customer_first"].includes(row.owed));
    assert.equal(planned[0].event.to, "created");
  });

  test("industry mapping", () => {
    assert.equal(industryOf("edtech"), "education");
    assert.equal(industryOf("realestate"), "real_estate");
    assert.equal(industryOf(null), "other");
  });
});
