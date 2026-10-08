// Agent Builder: the employee's script is written in clear sections and sent to the voice agent exactly as written.
// No cards, no extra RANA sections — what the client sees is what the agent follows. The AI only edits the text the
// client asks it to change (like a co-writer), and every Publish is saved as a version that can be restored.
import type { ChatMessage } from "./llm";

export const SECTIONS = [
  { key: "persona", title: "Persona", hint: "Who the agent is: name, role, company, tone. E.g. Priya, a friendly store assistant at …" },
  { key: "environment", title: "Environment & situation", hint: "Where it is used and who calls: phone line, incoming customers, what they usually ask." },
  { key: "objective", title: "Objective", hint: "What a good call achieves. E.g. answer quickly, invite them to visit, note wholesale needs." },
  { key: "style", title: "Speaking style", hint: "How it talks: short replies, natural words, prices in English, how to say brand words like WhatsApp…" },
  { key: "facts", title: "Facts", hint: "Everything it may say: address, timings, prices, sizes, offers. It never invents anything outside this." },
  { key: "flow", title: "Conversation flow", hint: "Step by step: opening, understanding the need, pitch, questions and objections, closing, ending." },
  { key: "guardrails", title: "Guardrails", hint: "What it must never do or say." },
] as const;
export type SectionKey = (typeof SECTIONS)[number]["key"];
export type Sections = Record<SectionKey, string>;
export const SECTION_KEYS = SECTIONS.map((s) => s.key) as SectionKey[];

const clip = (v: any, n: number) => String(v ?? "").replace(/\r\n/g, "\n").slice(0, n);
export function normalizeSections(v: any): Sections {
  const o: any = {};
  for (const k of SECTION_KEYS) o[k] = clip(v?.[k], 12000).trim();
  return o as Sections;
}
export const emptySections = (): Sections => normalizeSections({});
export const isExact = (script: any) => script?.prompt_mode === "exact";

/** The exact text the agent receives. Only one fixed line is added: honesty about being an AI assistant. */
export function compileSections(s: Sections): string {
  const body = SECTIONS.filter((x) => s[x.key]?.trim()).map((x) => `# ${x.title}\n${s[x.key].trim()}`).join("\n\n");
  return `${body}\n\n# Always\n- If someone asks whether you are a human or an AI, say honestly that you are a virtual assistant, then carry on helping.`.slice(0, 29000);
}

const RULES = `Rules for the text you write:
- It is spoken on a live phone call: short sentences, one question at a time, no markdown tables, no emoji, no symbols to read aloud. Simple "- " bullets and numbered steps are fine.
- Never invent facts, prices, timings, offers or policies. Keep every fact, number and name the user gave exactly.
- Keep the user's wording wherever it already works. Write in English (the agent itself replies in the caller's language).
- Never mention the software, AI provider or model behind the agent.`;

/** Turn a pasted script or document into the sections (nothing lost). */
export function importMessages(text: string, business: string): ChatMessage[] {
  return [
    { role: "system", content: `You turn a business's call script or notes into a voice agent script for ${business || "a business"}, arranged in these sections: ${SECTIONS.map((s) => `"${s.key}" (${s.title}: ${s.hint})`).join("; ")}.
Put EVERY detail from the source somewhere — prices, sizes, timings, address, steps, rules. Nothing may be dropped. Where the source is thin, add only sensible voice-call behaviour (short replies, one question at a time, polite closing) — never new facts.
${RULES}
Reply with JSON only: {"greeting": "the first line the agent says, or empty if none is given", "sections": {${SECTION_KEYS.map((k) => `"${k}": "..."`).join(", ")}}}` },
    { role: "user", content: `Source script:\n"""\n${clip(text, 40000)}\n"""` },
  ];
}

/** Apply one plain-words change request. Returns only the sections that change, rewritten in full. */
export function changeMessages(o: { sections: Sections; greeting: string; request: string; business: string }): ChatMessage[] {
  const current = SECTIONS.map((s) => `## ${s.key} (${s.title})\n${o.sections[s.key] || "(empty)"}`).join("\n\n");
  return [
    { role: "system", content: `You edit the voice agent script of ${o.business || "a business"} exactly as the owner asks, like a careful co-writer.
- Change only what the request needs. Every other sentence stays word for word.
- Make the whole script consistent: if the request contradicts something anywhere (facts, flow, guardrails, style), update those places too so no old rule is left that says the opposite.
- If the request is about how a word is pronounced, add a clear rule in "style" (for example: in Telugu replies write WhatsApp as వాట్సాప్).
${RULES}
Reply with JSON only: {"changes": {"<section key>": "the FULL new text of that section", ...only sections that change}, "greeting": "new greeting, or null if unchanged", "summary": "one or two short sentences: what you changed and where"}
Section keys: ${SECTION_KEYS.join(", ")}.` },
    { role: "user", content: `Current greeting: ${o.greeting || "(none)"}\n\nCurrent script:\n${current}\n\nChange requested by the owner:\n${clip(o.request, 3000)}` },
  ];
}

export type ChatTurn = { role: "owner" | "ai"; text: string };

/**
 * The co-writer conversation (like a script assistant): the owner pastes a website link, a script, notes, answers,
 * or asks for a change. The AI writes or edits the script and asks short questions that would make the pitch better.
 */
export function chatMessages(o: { sections: Sections; greeting: string; history: ChatTurn[]; message: string; sources: { url: string; title: string; text: string }[]; sourceErrors: string[]; business: string }): ChatMessage[] {
  const empty = !Object.values(o.sections).some((v) => v.trim());
  const current = SECTIONS.map((s) => `## ${s.key} (${s.title})\n${o.sections[s.key] || "(empty)"}`).join("\n\n");
  const history = o.history.slice(-10).map((t) => `${t.role === "owner" ? "Owner" : "You"}: ${clip(t.text, 1500)}`).join("\n");
  const sources = o.sources.map((s) => `Website ${s.url} (${s.title}):\n"""\n${clip(s.text, 14000)}\n"""`).join("\n\n");
  return [
    { role: "system", content: `You are the co-writer of the phone agent script for ${o.business || "a business"}. The owner talks to you in plain words: they may paste a website link (its text is given to you), a full script, notes, answers to your questions, or ask for a change.
How you work:
- If the script is empty, or the owner gives a website or a new script, write the COMPLETE script into every section and write the greeting. The "flow" section must be a numbered call flow with these parts in order: 1. Opening (greet, introduce, ask how to help or say why you are calling), 2. Understanding the need (2–4 short questions, one at a time), 3. Pitch (match what they need to the facts — benefits, prices, offers that are given), 4. Questions and objections (short answers from the facts), 5. Closing (one clear next step: visit, booking, site visit, callback, WhatsApp details), 6. Ending the call politely.
- Put every useful fact from the website or script into "facts": what they sell, prices, locations, timings, contact, offers, USPs. Only facts that are actually given — never invent prices, offers, timings or claims.
- For a change request, change only what is needed; every other sentence stays word for word, and fix anything elsewhere that would contradict the change.
- Then ask up to 4 short questions about missing details that would make the pitch and closing stronger (for example: the main goal of the call, best offer, price range, who usually calls, timings, location, what to do with interested callers). Never ask something already answered in the script, the website or the conversation. If nothing important is missing, ask nothing.
${RULES}
Reply with JSON only: {"reply": "one or two short sentences to the owner about what you did", "questions": ["short question", ...], "greeting": "new greeting, or null if unchanged", "changes": {"<section key>": "the FULL new text of that section", ...only sections that change}}
Section keys: ${SECTION_KEYS.join(", ")}.` },
    { role: "user", content: [
      `Current greeting: ${o.greeting || "(none)"}`,
      `Current script${empty ? " (EMPTY — write all of it)" : ""}:\n${current}`,
      history ? `Conversation so far:\n${history}` : "",
      sources ? `Websites the owner gave (read):\n${sources}` : "",
      o.sourceErrors.length ? `Could not read: ${o.sourceErrors.join("; ")}` : "",
      `Owner's new message:\n${clip(o.message, 30000)}`,
    ].filter(Boolean).join("\n\n") },
  ];
}
