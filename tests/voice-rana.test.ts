// RANA's own voice engine: request signing and how a finished call becomes a calls row.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { sign, verify, ranaPayloadToCall, payloadProblem, MAX_SKEW_MS, type RanaCallPayload } from "../lib/voice/rana";

const SECRET = "x".repeat(40);
const NOW = 1_792_000_000_000;

describe("signed requests", () => {
  const body = JSON.stringify({ hello: "world" });
  const ts = String(NOW);
  const good = { signature: sign(SECRET, ts, body), timestamp: ts };

  test("accepts a correctly signed, fresh request", () => {
    assert.equal(verify(SECRET, good, body, NOW + 1000), null);
  });
  test("rejects a changed body, a wrong secret, a bad or missing signature", () => {
    assert.match(verify(SECRET, good, body + " ", NOW)!, /Bad signature/);
    assert.match(verify("y".repeat(40), good, body, NOW)!, /Bad signature/);
    assert.match(verify(SECRET, { ...good, signature: "zz" }, body, NOW)!, /Bad signature/);
    assert.match(verify(SECRET, { ...good, signature: null }, body, NOW)!, /Bad signature/);
  });
  test("rejects replays older than 5 minutes and malformed timestamps", () => {
    assert.match(verify(SECRET, good, body, NOW + MAX_SKEW_MS + 1)!, /too old/);
    assert.match(verify(SECRET, { ...good, timestamp: "yesterday" }, body, NOW)!, /timestamp/);
  });
  test("refuses to work without a strong secret", () => {
    assert.match(verify(null, good, body, NOW)!, /not configured/);
  });
});

const call = (over: Partial<RanaCallPayload> = {}): RanaCallPayload => ({
  call_id: "RM_abc123",
  client_id: "22222222-2222-2222-2222-222222222222",
  script_id: "33333333-3333-3333-3333-333333333333",
  direction: "inbound",
  caller_phone: "98480 12345",
  agent_phone: "+914012345678",
  started_at: "2026-10-16T08:00:00.000Z",
  ended_at: "2026-10-16T08:01:30.000Z",
  answered: true,
  end_reason: "caller_hangup",
  transcript: [
    { role: "agent", text: "నమస్తే, RANA AI assistant మాట్లాడుతున్నాను. ఎలా సహాయం చేయగలను?" },
    { role: "user", text: "what is the fee for the batch? ready to join this week" },
    { role: "agent", text: "Fee details counsellor confirm చేస్తారు." },
  ],
  models: { stt: "indic-transcribe-core", llm: "sarvam-30b", tts: "indic-parler-tts" },
  metrics: { avg_reply_ms: 1100 },
  ...over,
});

describe("finished call → calls row", () => {
  test("answered inbound call: stable id, duration, normalised phone, classifier verdict", () => {
    const r = ranaPayloadToCall(call());
    assert.equal(r.interaction_id, "rana-RM_abc123");
    assert.equal(r.duration_seconds, 90);
    assert.equal(r.caller_phone, "+919848012345");
    assert.equal(r.direction, "inbound");
    assert.equal(r.source, "deployment");
    assert.equal(r.caller_turns, 1);
    assert.equal(r.lead_status, "ready_to_close"); // "ready to join" is a commitment signal in classifyCall
    assert.equal((r.agent_variables as any).rana_script_id, "33333333-3333-3333-3333-333333333333");
    assert.equal((r.raw_payload as any).engine, "rana");
  });
  test("unanswered outbound call is stored as not connected with zero duration", () => {
    const r = ranaPayloadToCall(call({ direction: "outbound", answered: false, end_reason: "no_answer", transcript: [] }));
    assert.equal(r.connectivity_status, "no_answer");
    assert.equal(r.duration_seconds, 0);
    assert.equal(r.lead_status, "no_answer");
    assert.equal(r.source, "instant_outbound");
  });
  test("drops empty or unknown-role turns", () => {
    const r = ranaPayloadToCall(call({ transcript: [{ role: "agent", text: "  " }, { role: "system" as any, text: "x" }, { role: "user", text: "hello" }] }));
    assert.deepEqual(r.transcript, [{ role: "user", text: "hello" }]);
  });
  test("payload validation", () => {
    assert.equal(payloadProblem(call()), null);
    assert.match(payloadProblem({ ...call(), client_id: "nope" })!, /UUID/);
    assert.match(payloadProblem({ ...call(), call_id: "a b" })!, /call_id/);
    assert.match(payloadProblem({ ...call(), direction: "sideways" })!, /direction/);
    assert.match(payloadProblem({ ...call(), transcript: "hi" })!, /array/);
  });
});
