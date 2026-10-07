// After-call AI read: what kind of call this was (real lead, customer, junk, spam, sales pitch…), why they called,
// whether it is a wholesale/bulk enquiry, and the details a shop needs (product, size, budget, visit time…).
// Runs once per finished call, before lead alerts, so WhatsApp / Sheets / Slack get the full picture. Never throws.
import { sb } from "./db";
import { chatJson, llmProvider } from "./llm";
import type { LeadStatus } from "./calls";
import { CATEGORY_LABEL, NOISE, type CallCategory } from "./callCategory";
export { CATEGORY_LABEL, NOISE, type CallCategory };

export type Insight = {
  category: CallCategory; lead_status: LeadStatus; purpose: string; reason: string; wholesale: boolean;
  details: { name?: string; product?: string; size?: string; quantity?: string; budget?: string; visit?: string; location?: string; language?: string };
};

const CATS = Object.keys(CATEGORY_LABEL);
const LEADS: LeadStatus[] = ["ready_to_close", "hot", "warm", "cold", "not_interested"];
const clip = (v: any, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const WHOLESALE_RX = /wholesale|whole sale|bulk|dealer|distributor|reseller|retailer|resale|in bulk|dozens|hol ?sale|thok|थोक|హోల్ ?సేల్|மொத்த/i;

function transcriptText(call: any): string {
  return (Array.isArray(call.transcript) ? call.transcript : [])
    .filter((t: any) => String(t?.text || "").trim())
    .map((t: any) => `${t.role === "user" ? "Caller" : "Agent"}: ${clip(t.indic_text && t.indic_text !== t.text ? `${t.text} (${t.indic_text})` : t.text, 400)}`)
    .join("\n").slice(-9000);
}

export async function analyzeCall(client: any, call: any): Promise<Insight | null> {
  const text = transcriptText(call);
  const callerSaid = (call.transcript || []).some((t: any) => t.role === "user" && String(t.text || "").trim());
  if (!callerSaid) return null;
  if (!llmProvider()) return null;
  const business = [client?.name, client?.industry].filter(Boolean).join(" — ") || "a business";
  const j = await chatJson<any>([
    { role: "system", content: `You read phone call transcripts for ${business} and file each call. Reply with JSON only:
{"category": one of ${JSON.stringify(CATS)},
 "lead_status": one of ${JSON.stringify(LEADS)},
 "purpose": "why they called, one short sentence in English",
 "reason": "one short sentence: why this lead_status",
 "wholesale": true only if the CALLER wants to buy wholesale / in bulk / for resale (dealer prices, large quantities); false if they said retail or only the agent mentioned wholesale,
 "details": {"name","product","size","quantity","budget","visit","location","language"} — only what the caller actually said, in English, omit unknown keys}
Rules: category "lead" = a possible new customer asking about products/services/prices/stock/visiting; "customer" = existing customer (order, exchange, return, follow-up); "support" = complaint or problem; "marketing" = someone selling something TO the business (ads, loans, software, SEO, vendors); "spam" = scam, robocall, abusive or prank; "junk" = no real conversation (silence, hung up, only hello); "wrong_number" = meant someone else.
lead_status: "ready_to_close" = will buy/pay/visit now or booked a visit; "hot" = clear buying intent (price, size, stock, location, timings) and engaged; "warm" = some interest or asked to call later; "cold" = little interest, or any non-lead category; "not_interested" = declined.
details.location = where the CALLER is or lives, only if they said it — never the business's own address or anything the agent said.
Never invent details.` },
    { role: "user", content: `Call (${call.direction === "outbound" ? "we called them" : "they called us"}, ${Math.round(Number(call.duration_seconds) || 0)}s):\n${text}` },
  ], { maxTokens: 500, temperature: 0, timeoutMs: 12000 });
  const category: CallCategory = CATS.includes(j?.category) ? j.category : "lead";
  let lead: LeadStatus = LEADS.includes(j?.lead_status) ? j.lead_status : "cold";
  if (NOISE.includes(category)) lead = "cold";
  const d = j?.details && typeof j.details === "object" ? j.details : {};
  const details: Insight["details"] = {};
  for (const k of ["name", "product", "size", "quantity", "budget", "visit", "location", "language"] as const) { const v = clip(d[k], 120); if (v && !/^(unknown|n\/a|none|null|-)$/i.test(v)) details[k] = v; }
  // Only the caller's own words count: the agent asking "retail or wholesale?" is not a wholesale enquiry.
  const said = (call.transcript || []).filter((t: any) => t.role === "user").map((t: any) => `${t.text || ""} ${t.indic_text || ""}`).join(" ");
  const wholesale = j?.wholesale === true || WHOLESALE_RX.test(said.replace(/\bretail\b/gi, ""));
  return { category, lead_status: lead, purpose: clip(j?.purpose, 240), reason: clip(j?.reason, 240), wholesale, details };
}

/** Analyse a saved call and store the result on it. Returns the updated row (or the same row if nothing changed). */
export async function applyInsight(client: any, call: any, opts: { keepLead?: boolean } = {}): Promise<any> {
  try {
    if (!call?.id || call.source === "manual" || !(Number(call.duration_seconds) > 0)) return call;
    if (call.insight) return call; // already read (webhook retries / re-syncs)
    const ins = await analyzeCall(client, call);
    if (!ins) {
      const patch = { category: "junk", insight: { category: "junk", purpose: "No conversation", at: new Date().toISOString() } };
      await sb(`/calls?id=eq.${call.id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify(patch) }).catch(() => {});
      return { ...call, ...patch };
    }
    const tags = Array.from(new Set([...(call.tags || []), ...(ins.wholesale ? ["wholesale"] : [])]));
    const patch: any = { category: ins.category, tags, insight: { ...ins, at: new Date().toISOString() } };
    if (!opts.keepLead && call.lead_reason !== "Set manually by your team.") {
      patch.lead_status = ins.lead_status;
      if (ins.reason) patch.lead_reason = ins.reason;
      if (ins.lead_status === "ready_to_close") patch.follow_up = true;
    }
    if (!call.caller_name && ins.details.name) patch.caller_name = ins.details.name;
    if (ins.purpose && (!call.summary || String(call.summary).length < 40)) patch.summary = ins.purpose;
    await sb(`/calls?id=eq.${call.id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify(patch) });
    return { ...call, ...patch };
  } catch (e: any) {
    console.error("[callInsight]", e?.message || e);
    return call;
  }
}
