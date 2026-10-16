// Finds the commitments made on a finished call.
//
// Deterministic on purpose: every task it creates can be traced to one quoted line, it costs nothing to
// run on every call, and it behaves the same on a retried webhook. It reads the agent's own turns first
// (that is where promises are made), the caller's requests second, and the AI summary only as a fallback
// when there is no transcript.
//
// It NEVER marks anything as done. Detection only opens a task; completion needs evidence (lifecycle.ts).

import { createHash } from "crypto";
import type { CallForPromises, Channel, DetectedPromise, Industry, Owed, PromiseKind, TranscriptTurn } from "./types";
import { dueFor, IST_OFFSET_MIN } from "./when";

const WE_WILL = String.raw`\b(?:we|i|our (?:store |sales |site )?team|they|he|she)\s*(?:will|'ll|shall)\s+(?:immediately\s+|definitely\s+|surely\s+|also\s+)?`;

const RX = {
  sendPromise: new RegExp(`${WE_WILL}(?:send|share|text|forward|whatsapp|message|mail|email)\\b`, "i"),
  sendOffer: /\b(?:shall|should|can|may) i (?:send|share|text|whatsapp)\b/i,
  customerFirst: /\bsend (?:a |us a )?['"‘’]?hi['"‘’]?\b/i,
  callbackPromise: new RegExp(`${WE_WILL}(?:call you|give you a call|call you back|call back|get back to you|contact you)\\b|\\bwill call you\\b|\\bcall (?:you )?again\\b`, "i"),
  callbackOffer: /\b(?:shall|should|can) (?:i|we) call (?:you )?(?:back|again|later|tomorrow)\b/i,
  connectHuman: /\b(?:connect|transfer|put) you (?:with|to|through)\b|\b(?:team member|senior|sales (?:advisor|executive|manager)|manager|counsell?or|expert|executive)\b[^.?!]{0,60}\bwill (?:call|contact|reach)\b/i,
  counselling: /\b(?:arrange|book|schedule|fix|set up)\b[^.?!]{0,40}\bcounsell?ing\b|\bcounsell?or will (?:call|contact)\b/i,
  demo: /\b(?:arrange|book|schedule|fix|reserve)\b[^.?!]{0,40}\bdemo\b|\bdemo class\b[^.?!]{0,40}\b(?:book|booked|confirm|arrange|schedule)/i,
  siteVisit: /\bsite visit\b|\bvisit (?:the|our) (?:site|project|venture|plots?)\b|\bsite team\b/i,
  bookSlot: /\b(?:i|we)\s*(?:will|'ll|shall)\s+(?:book|block|reserve)\b|\bbook (?:the |a |your )?(?:slot|visit|appointment)\b/i,
  humanRole: /\b(?:team member|senior|sales (?:advisor|executive|manager)|manager|expert|executive|colleague)\b/i,
  theyWillCall: /\b(?:he|she|they|whoever is (?:free|available))\b[^.?!]{0,20}\bwill (?:call|contact|reach)\b/i,
  confirmLater: /\b(?:will|'ll|shall)\s+(?:check|verify|confirm)\b[^.?!]{0,80}\b(?:confirm|get back|let you know|inform)\b|\bconfirm (?:it )?(?:to|with) you\b/i,
  // Caller side
  askCallback: /\bcall (?:me )?(?:back|later|tomorrow|after|in the evening)\b|\b(?:kal|baad mein) call\b|\b(?:repu|tarvata) call\b/i,
  askSend: /\b(?:send|share|whatsapp) (?:me |us )?(?:the |your |some )?(location|brochure|details|photos?|pics|price ?list|address|number)\b/i,
  affirm: /^\s*(?:yes|yeah|yep|ok|okay|sure|haan|ha|ji|avunu|sare|alright|fine|please|correct|right|done|theek)\b/i,
  decline: /^\s*(?:no|nahi|vaddu|ledu|not now|don'?t)\b/i,
  // Things the agent clearly is NOT promising
  negated: /\b(?:cannot|can't|won't|will not|do not|don't|not able to)\s+(?:send|share|call|deliver)\b/i,
};

const ITEMS: [string, RegExp][] = [
  ["location", /\b(?:location|address|map|live location)\b/i],
  ["brochure", /\bbrochure\b/i],
  ["price_list", /\bprice ?list\b|\bprices?\b/i],
  ["photos", /\b(?:photos?|pics|pictures|images)\b/i],
  ["wholesale_details", /\bwholesale\b/i],
  ["office_number", /\b(?:office|contact) number\b/i],
  ["details", /\b(?:details|information|info)\b/i],
];

function itemOf(text: string): string | null {
  for (const [k, rx] of ITEMS) if (rx.test(text)) return k;
  return null;
}
function channelOf(text: string): Channel | null {
  if (/whatsapp/i.test(text)) return "whatsapp";
  if (/\b(?:e-?mail|mail)\b/i.test(text)) return "email";
  if (/\b(?:sms|text message|text you)\b/i.test(text)) return "sms";
  return null;
}
const clip = (s: string, n = 220) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const textOf = (t: TranscriptTurn | undefined) => String(t?.text || "").replace(/\s+/g, " ").trim();
const isAgent = (t: TranscriptTurn) => /^(agent|assistant|bot|ai)$/i.test(String(t.role));
const isCaller = (t: TranscriptTurn) => /^(user|caller|customer|human)$/i.test(String(t.role));

/** Was an agent question ("Shall I send…?") accepted by the caller's next turn? */
function acceptedNext(turns: TranscriptTurn[], i: number): boolean | null {
  for (let j = i + 1; j < Math.min(turns.length, i + 3); j++) {
    if (!isCaller(turns[j])) continue;
    const said = textOf(turns[j]);
    if (RX.decline.test(said)) return false;
    if (RX.affirm.test(said)) return true;
    return null;
  }
  return null;
}
/** Did the agent's reply to a caller request go along with it (not refuse it)? */
function agentWentAlong(turns: TranscriptTurn[], i: number): boolean {
  for (let j = i + 1; j < Math.min(turns.length, i + 3); j++) {
    if (!isAgent(turns[j])) continue;
    return !RX.negated.test(textOf(turns[j]));
  }
  return false;
}

const TITLES: Record<PromiseKind, (item: string | null, ch: Channel | null) => string> = {
  send_info: (item, ch) => `Send ${(item || "details").replace(/_/g, " ")}${ch ? ` on ${ch === "whatsapp" ? "WhatsApp" : ch.toUpperCase()}` : ""}`,
  callback: () => "Call the customer back",
  connect_human: () => "Team member to call the customer",
  counselling: () => "Arrange counselling session",
  demo_class: () => "Book demo class",
  site_visit: () => "Schedule site visit",
  confirm_slot: () => "Confirm the requested time slot",
};

type Hit = { kind: PromiseKind; owed: Owed; item: string | null; channel: Channel | null; confidence: "high" | "medium"; from: "agent" | "caller" | "summary" | "handoff"; turn: number | null; quote: string; timeText: string };

export function dedupeKey(clientId: string, callId: string, kind: PromiseKind): string {
  return createHash("sha256").update(`${clientId}|${callId}|${kind}`).digest("hex").slice(0, 40);
}

/** Turn-level detection. Exported for tests. */
export function hitsFromTranscript(turns: TranscriptTurn[], industry: Industry = "other"): Hit[] {
  const hits: Hit[] = [];
  turns.forEach((turn, i) => {
    const said = textOf(turn);
    if (!said) return;
    // Time words often sit in the caller's turn just before ("call me in the evening") or after ("ok, tomorrow").
    const window = `${textOf(turns[i - 1])} ${said} ${textOf(turns[i + 1])}`;
    if (isAgent(turn)) {
      const isQuestion = /\?\s*$/.test(said) || RX.sendOffer.test(said) || RX.callbackOffer.test(said);
      const accepted = isQuestion ? acceptedNext(turns, i) : true;
      if (accepted === false) return;
      const conf: "high" | "medium" = accepted === true ? "high" : "medium";
      const base = { from: "agent" as const, turn: i, quote: clip(said), timeText: window };

      if (RX.counselling.test(said)) hits.push({ ...base, kind: "counselling", owed: "business", item: null, channel: "call", confidence: conf });
      if (RX.demo.test(said)) hits.push({ ...base, kind: "demo_class", owed: "business", item: null, channel: null, confidence: conf });
      if (RX.siteVisit.test(said) && (RX.bookSlot.test(said) || RX.confirmLater.test(said) || /\b(?:come|visit)\b/i.test(said)))
        hits.push({ ...base, kind: "site_visit", owed: "business", item: null, channel: "in_person", confidence: conf });
      if (RX.confirmLater.test(said) || (RX.bookSlot.test(said) && !RX.siteVisit.test(said)))
        hits.push({ ...base, kind: "confirm_slot", owed: "business", item: null, channel: null, confidence: conf });
      if (RX.connectHuman.test(said) || (RX.humanRole.test(said) && RX.theyWillCall.test(said))) hits.push({ ...base, kind: "connect_human", owed: "business", item: null, channel: "call", confidence: conf });
      else if (RX.callbackPromise.test(said) || RX.callbackOffer.test(said))
        hits.push({ ...base, kind: "callback", owed: "business", item: null, channel: "call", confidence: conf });
      if ((RX.sendPromise.test(said) || RX.sendOffer.test(said)) && !RX.negated.test(said)) {
        const owed: Owed = RX.customerFirst.test(said) ? "customer_first" : "business";
        hits.push({ ...base, kind: "send_info", owed, item: itemOf(said), channel: channelOf(said) ?? "whatsapp", confidence: conf });
      }
    } else if (isCaller(turn)) {
      const base = { from: "caller" as const, turn: i, quote: clip(said), timeText: window, confidence: "medium" as const };
      if (RX.askCallback.test(said) && agentWentAlong(turns, i)) hits.push({ ...base, kind: "callback", owed: "business", item: null, channel: "call" });
      const ask = said.match(RX.askSend);
      if (ask && agentWentAlong(turns, i)) {
        // If the agent answered "send 'Hi' first", the agent-side hit already captured it as customer_first.
        hits.push({ ...base, kind: "send_info", owed: "business", item: itemOf(ask[1]) ?? "details", channel: channelOf(said) ?? "whatsapp" });
      }
    }
  });
  return hits;
}

/** Fallback when the call has no transcript: read the AI summary's past-tense description. */
export function hitsFromSummary(summary: string): Hit[] {
  const s = String(summary || "");
  if (!s.trim()) return [];
  const hits: Hit[] = [];
  const base = { from: "summary" as const, turn: null, quote: clip(s), timeText: s, confidence: "medium" as const };
  if (/\b(?:agreed|wants?|scheduled|booked)\b[^.]{0,60}\bdemo\b/i.test(s)) hits.push({ ...base, kind: "demo_class", owed: "business", item: null, channel: null });
  if (/\b(?:agreed|wants?|scheduled|booked)\b[^.]{0,60}\bsite visit\b/i.test(s)) hits.push({ ...base, kind: "site_visit", owed: "business", item: null, channel: "in_person" });
  if (/\bcounsell?ing\b[^.]{0,40}\b(?:arranged|scheduled|booked|requested)\b|\b(?:arrange|schedule|book)\w*\b[^.]{0,30}\bcounsell?ing\b/i.test(s))
    hits.push({ ...base, kind: "counselling", owed: "business", item: null, channel: "call" });
  if (/\b(?:requested|asked for|wants?) (?:a )?call ?back\b|\bpromised to call\b/i.test(s)) hits.push({ ...base, kind: "callback", owed: "business", item: null, channel: "call" });
  if (/\b(?:offered|promised|agreed) to send\b/i.test(s)) hits.push({ ...base, kind: "send_info", owed: "business", item: itemOf(s), channel: channelOf(s) ?? "whatsapp" });
  return hits;
}

const RANK: Record<string, number> = { agent: 3, handoff: 3, caller: 2, summary: 1 };

/**
 * All commitments on one finished call, at most one per kind (the strongest, earliest evidence wins).
 * `ref` is when the call ended — due times are relative to it.
 */
export function detectPromises(call: CallForPromises, opts: { industry?: Industry; tzOffsetMin?: number; now?: Date } = {}): DetectedPromise[] {
  if (!call?.id || !call.client_id) return [];
  const turns = Array.isArray(call.transcript) ? call.transcript : [];
  const hasCaller = turns.some(isCaller);
  // An agent monologue with no caller at all (voicemail, no answer) promises nothing to anyone.
  let hits: Hit[] = turns.length ? (hasCaller ? hitsFromTranscript(turns, opts.industry) : []) : hitsFromSummary(call.summary || "");

  if (call.handoff?.rule) {
    hits.push({ kind: "connect_human", owed: "business", item: null, channel: "call", confidence: "high", from: "handoff", turn: null, quote: `Handoff rule "${call.handoff.rule}" fired on this call.`, timeText: "" });
  }

  // A caller-side send request answered with "send 'Hi' first" is customer_first, not a separate business send.
  if (hits.some((h) => h.kind === "send_info" && h.owed === "customer_first")) {
    hits = hits.filter((h) => !(h.kind === "send_info" && h.from === "caller"));
  }
  // "Connect you with my team… they will call you" is one promise, not two.
  if (hits.some((h) => h.kind === "connect_human")) hits = hits.filter((h) => h.kind !== "callback");
  // "Our counsellor will call you" is the counselling promise itself, not an extra hand-off.
  const counsellingTurns = new Set(hits.filter((h) => h.kind === "counselling").map((h) => h.turn));
  if (counsellingTurns.size) hits = hits.filter((h) => !(h.kind === "connect_human" && h.from === "agent" && counsellingTurns.has(h.turn)));

  const best = new Map<PromiseKind, Hit>();
  for (const h of hits) {
    const cur = best.get(h.kind);
    if (!cur) { best.set(h.kind, h); continue; }
    const better =
      (h.owed === "business" && cur.owed === "customer_first") ||
      (h.owed === cur.owed && (RANK[h.from] > RANK[cur.from] || (RANK[h.from] === RANK[cur.from] && h.confidence === "high" && cur.confidence !== "high")));
    if (better) best.set(h.kind, { ...h, item: h.item ?? cur.item });
    else if (!cur.item && h.item) best.set(h.kind, { ...cur, item: h.item });
  }

  const ref = new Date(call.ended_at || call.started_at || opts.now || Date.now());
  const off = opts.tzOffsetMin ?? IST_OFFSET_MIN;
  return Array.from(best.values()).map((h) => {
    const due = dueFor(h.kind, h.owed, h.timeText, ref, off);
    return {
      kind: h.kind,
      title: TITLES[h.kind](h.item, h.channel),
      owed: h.owed,
      channel: h.channel,
      item: h.item,
      dueAt: due.dueAt,
      dueText: due.dueText,
      confidence: h.confidence,
      source: { from: h.from, turn: h.turn, quote: h.quote },
      dedupeKey: dedupeKey(call.client_id, call.id, h.kind),
    };
  });
}

/** Map RANA's stored client.industry (edtech | realestate | …) to the engine's industry. */
export function industryOf(raw: string | null | undefined): Industry {
  const s = String(raw || "").toLowerCase();
  if (/edtech|education|coaching|school|college|academy/.test(s)) return "education";
  if (/real ?estate|realty|property|plots?|builder/.test(s)) return "real_estate";
  if (/retail|store|shop|fashion|ecom/.test(s)) return "retail";
  return "other";
}
