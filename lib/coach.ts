// AI Script Coach for the Review step: checks the script like a sales trainer, rewrites any answer on request,
// and lets the client practise a whole conversation (typed, or with an AI playing the customer) before going live.
import type { ChatMessage } from "./llm";
import { LANG_NAMES, baseLang, EVERYDAY_WORDS, type Playbook, type LanguagePolicy } from "./playbook";

export const OBJECTION_TYPES: Record<string, string> = {
  price: "Price / fee", no_money: "No money right now", think_later: "Will think about it", busy: "Busy / call later", trust: "Trust / proof",
  competitor: "Comparing others", family: "Needs family's OK", timing: "Wrong time / batch", distance: "Location / distance", not_interested: "Not interested",
  info: "Wants details on WhatsApp", other: "Other",
};
export const INTENTS: Record<string, string> = {
  buying: "Ready to buy", interested: "Interested", question: "Question", objection: "Objection", callback: "Call me later",
  wants_person: "Wants a person", support: "Existing customer issue", not_interested: "Not interested", complaint: "Complaint", smalltalk: "Small talk",
};
export const ACTIONS: Record<string, string> = {
  continue: "Keep talking", answer: "Answer the question", handle_objection: "Handle the objection", close: "Close — ask for the payment/visit",
  transfer: "Transfer to a person", callback: "Book a call back", end_call: "End the call politely",
};
export const REWRITE_KINDS: Record<string, string> = {
  improve: "Improve", natural: "More natural", shorter: "Shorter", professional: "More professional", human: "Sound human",
  objection: "Handle the objection better", alternatives: "3 alternatives",
};
export const PERSONAS: Record<string, string> = {
  price: "Price-sensitive — keeps saying the fee is too high, asks for discounts and EMI",
  busy: "Busy — short answers, tries to end the call quickly",
  think: "Undecided — “I'll think about it”, needs to ask family",
  skeptic: "Sceptical — doubts results, asks for proof, compares with other institutes",
  ready: "Ready to join — wants to pay today and asks how",
  existing: "Existing student with a problem — already paid but admission not confirmed, a bit annoyed",
  person: "Wants a specific person — asks to talk to someone from the team by name",
};

function langLine(openingLanguage: string, policy?: LanguagePolicy | null) {
  const open = baseLang(openingLanguage);
  const name = LANG_NAMES[open] || "English";
  const everyday = (policy?.style || "everyday") !== "pure";
  const style = everyday && EVERYDAY_WORDS[open] ? ` Use the everyday spoken style (${EVERYDAY_WORDS[open]}), not bookish words.` : "";
  return `Write customer-facing lines in ${name}${open !== "en" ? ` script` : ""}, the way the agent will speak on the call.${style}`;
}

function playbookText(p: Playbook, greeting: string) {
  const parts = [
    greeting && `GREETING: ${greeting}`, p.opening && `OPENING: ${p.opening}`,
    p.discovery?.length && `QUESTIONS:\n${p.discovery.map((q, i) => `  [discovery ${i}] ${q}`).join("\n")}`,
    p.pitch?.length && `PITCH:\n${p.pitch.map((q, i) => `  [pitch ${i}] ${q}`).join("\n")}`,
    p.objections?.length && `OBJECTIONS:\n${p.objections.map((o, i) => `  [objection ${i}] Customer: "${o.objection}" → Agent: "${o.response}"`).join("\n")}`,
    p.faqs?.length && `FAQS:\n${p.faqs.map((f, i) => `  [faq ${i}] Q: ${f.question} A: ${f.answer}`).join("\n")}`,
    p.closing && `CLOSING: ${p.closing}`, p.followUp && `IF NOT READY: ${p.followUp}`,
    p.facts?.length && `FACTS: ${p.facts.join(" | ")}`,
  ].filter(Boolean);
  return parts.join("\n");
}

export function auditMessages(o: { playbook: Playbook; greeting: string; openingLanguage: string; policy?: LanguagePolicy | null; name: string }): ChatMessage[] {
  return [
    { role: "system", content: `You are a senior sales trainer for Indian businesses (coaching institutes, clinics, real estate, services) who reviews scripts for AI phone agents.
Judge the script as it will SOUND on a phone call: short, warm, natural, one idea at a time, handles objections by acknowledging the concern first, then giving a reason, then a next step.
${langLine(o.openingLanguage, o.policy)}
Reply ONLY with JSON:
{"score": 0-100,
 "summary": "one sentence on the biggest improvement",
 "findings": [ {"ref": "objection 0" | "pitch 1" | "discovery 2" | "faq 0" | "opening" | "closing" | "greeting",
   "type": "one of ${Object.keys(OBJECTION_TYPES).join("|")} for objections, else \"flow\"",
   "problem": "what is weak, in plain English, max 20 words",
   "suggestion": "the improved line exactly as the agent should say it"} ],
 "missing": [ {"objection": "a common thing customers of this business say that the script does not handle (customer's words)", "type": "...", "response": "how the agent should answer"} ]}
Rules: at most 8 findings, most important first; only include a finding if the suggestion is clearly better. At most 5 missing objections (price, no money now, think about it, busy, trust, family approval are the usual ones). Never invent fees, dates, discounts or facts that are not in the script — use the script's facts or keep it general.` },
    { role: "user", content: `Agent name: ${o.name || "the agent"}\n\n${playbookText(o.playbook, o.greeting)}` },
  ];
}

export function rewriteMessages(o: { text: string; kind: string; language: string; context?: string; facts?: string[]; openingLanguage: string; policy?: LanguagePolicy | null }): ChatMessage[] {
  const want: Record<string, string> = {
    improve: "Make it more persuasive and clear while keeping the meaning.",
    natural: "Make it sound like a friendly person talking on the phone, not written text.",
    shorter: "Make it about half as long — 1 or 2 short sentences.",
    professional: "Make it polite and professional, still warm.",
    human: "Make it sound like a real, caring counsellor: acknowledge the feeling first, simple words, no sales jargon.",
    objection: "Handle the customer's concern properly: acknowledge it, give one strong reason or option, then a small next step (question or offer).",
    alternatives: "Write 3 different good versions (different angles).",
  };
  const lang = o.language === "en" ? "Write in English."
    : o.language === "mix" ? `Write the natural mixed style people use on calls (${baseLang(o.openingLanguage) === "hi" ? "Hinglish" : baseLang(o.openingLanguage) === "en" || baseLang(o.openingLanguage) === "te" ? "Tenglish" : "mixed"}): mostly ${LANG_NAMES[baseLang(o.openingLanguage) === "en" ? "te" : baseLang(o.openingLanguage)] || "Telugu"} written in its own script, with common English words like fees, batch, demo, online, EMI kept in English as spoken. Do NOT write the whole line in English.`
    : o.language && o.language !== "auto" ? `Write in ${LANG_NAMES[o.language] || o.language}, in its own script, everyday spoken style.`
    : langLine(o.openingLanguage, o.policy);
  return [
    { role: "system", content: `You rewrite lines for an AI phone agent. ${want[o.kind] || want.improve} ${lang}
Keep every number, fee, date and name exactly as given. Never add facts, discounts or promises that aren't in the original or the facts list. No lists, no emojis, no quotes around the line.
Reply ONLY with JSON: {"options": ["..."${o.kind === "alternatives" ? ', "...", "..."' : ""}]}` },
    { role: "user", content: `${o.context ? `Customer said: "${o.context}"\n` : ""}${o.facts?.length ? `Facts you may use: ${o.facts.join(" | ")}\n` : ""}Line to rewrite: ${o.text}` },
  ];
}

export type Turn = { role: "customer" | "agent"; text: string };

export function simulateMessages(o: { system: string; greeting: string; history: Turn[] }): ChatMessage[] {
  const msgs: ChatMessage[] = [{ role: "system", content: `${o.system}

# PRACTICE MODE (overrides nothing above — just the output format)
This chat stands in for the phone call. The user messages are what the caller says. Reply as you would speak on the call, following everything above.
Also analyse the caller's LATEST message. Reply ONLY with JSON:
{"reply": "what you say next (1–2 short spoken sentences)",
 "analysis": {"intent": "${Object.keys(INTENTS).join("|")}",
   "objection": "${Object.keys(OBJECTION_TYPES).join("|")}|null",
   "lead_intent": "high|medium|low",
   "action": "${Object.keys(ACTIONS).join("|")}",
   "transfer_to": "name or team from the handover section, else null",
   "why": "max 15 words: why you chose this"}}` }];
  if (o.greeting) msgs.push({ role: "assistant", content: o.greeting });
  for (const t of o.history.slice(-20)) msgs.push({ role: t.role === "customer" ? "user" : "assistant", content: t.text });
  // Some models need the conversation to end on a user message.
  if (msgs[msgs.length - 1].role !== "user") msgs.push({ role: "user", content: "(silence)" });
  return msgs;
}

export function customerMessages(o: { persona: string; business: string; openingLanguage: string; history: Turn[]; greeting: string }): ChatMessage[] {
  const open = baseLang(o.openingLanguage);
  const name = LANG_NAMES[open] || "English";
  const convo = [o.greeting && `AGENT: ${o.greeting}`, ...o.history.slice(-16).map((t) => `${t.role === "agent" ? "AGENT" : "YOU"}: ${t.text}`)].filter(Boolean).join("\n");
  return [
    { role: "system", content: `You are role-playing a CUSTOMER who received a phone call from a business, to help the business test its AI agent.
Your character: ${PERSONAS[o.persona] || PERSONAS.price}.
Speak like a real Indian caller in ${name}${open !== "en" ? " (in its own script, mixing common English words like fees, batch, online the way people really talk)" : ""}: short, informal, sometimes vague. One turn only, max 25 words. Stay in character, don't make it too easy for the agent, but respond honestly to good answers.
After 5–8 of your turns, or when the call naturally ends, set "done": true.
Reply ONLY with JSON: {"line": "what you say", "done": false}` },
    { role: "user", content: `What the business sells (from its script):\n${o.business.slice(0, 2500)}\n\nConversation so far:\n${convo || "(the call just connected)"}\n\nYour next line:` },
  ];
}

const pick = (v: any, allowed: Record<string, string>, dflt: string) => (typeof v === "string" && allowed[v] ? v : dflt);
export function cleanAnalysis(a: any) {
  const lead = ["high", "medium", "low"].includes(a?.lead_intent) ? a.lead_intent : "medium";
  const obj = a?.objection && OBJECTION_TYPES[a.objection] ? a.objection : null;
  return {
    intent: pick(a?.intent, INTENTS, "question"), objection: obj, lead_intent: lead,
    action: pick(a?.action, ACTIONS, "continue"),
    transfer_to: a?.transfer_to && a.transfer_to !== "null" ? String(a.transfer_to).slice(0, 60) : null,
    why: String(a?.why || "").slice(0, 160),
  };
}

export function businessSummary(p: Playbook, greeting: string) {
  return playbookText(p, greeting).replace(/\[(discovery|pitch|objection|faq) \d+\] /g, "");
}
