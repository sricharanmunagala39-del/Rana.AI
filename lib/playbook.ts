// The "playbook" is how RANA understands a sales script: which part is the opening, what to ask,
// what to pitch, how to handle each objection, how to close — plus links, knowledge and
// pronunciation. The AI builds it from whatever the client pastes; the client can edit any card
// or ask the AI to change it; and at publish time it is compiled into the agent's instructions.

export type Objection = { objection: string; response: string };
export type Faq = { question: string; answer: string };
export type Playbook = {
  goal: string;
  persona: string;
  opening: string;
  discovery: string[];
  pitch: string[];
  objections: Objection[];
  faqs: Faq[];
  closing: string;
  followUp: string;
  doNot: string[];
  facts: string[];
  missing?: string[];
};
export type AgentLink = { label: string; url: string; purpose: "payment" | "website" | "booking" | "brochure" | "other"; say?: string };
export type Pronunciation = { word: string; sayAs: string; note?: string };
export type LanguagePolicy = { mode: "match_caller" | "fixed"; allowed: string[] };
export type KnowledgeItem = { title: string; kind: string; summary: string | null; content: string };

export const LANG_NAMES: Record<string, string> = {
  en: "English", hi: "Hindi", te: "Telugu", ta: "Tamil", kn: "Kannada", ml: "Malayalam", mr: "Marathi",
  bn: "Bengali", gu: "Gujarati", pa: "Punjabi", ur: "Urdu", ar: "Arabic", es: "Spanish", fr: "French", de: "German", pt: "Portuguese",
};
const SCRIPT_NOTE: Record<string, string> = {
  te: "Telugu script (తెలుగు)", hi: "Devanagari (हिन्दी)", ta: "Tamil script", kn: "Kannada script", ml: "Malayalam script",
  mr: "Devanagari", bn: "Bengali script", gu: "Gujarati script", pa: "Gurmukhi", ur: "Urdu script", ar: "Arabic script",
};
export const baseLang = (l?: string | null) => String(l || "en").toLowerCase().split(/[-_]/)[0] || "en";

export const EMPTY_PLAYBOOK: Playbook = {
  goal: "", persona: "", opening: "", discovery: [], pitch: [], objections: [], faqs: [], closing: "", followUp: "", doNot: [], facts: [], missing: [],
};

const str = (v: any, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v: any, max = 30, each = 600) => (Array.isArray(v) ? v.map((x) => str(x, each)).filter(Boolean).slice(0, max) : []);

/** Makes whatever the AI (or a person) sent into a safe, complete playbook. */
export function normalizePlaybook(p: any): Playbook {
  p = p || {};
  return {
    goal: str(p.goal, 400), persona: str(p.persona, 600), opening: str(p.opening, 1500),
    discovery: list(p.discovery), pitch: list(p.pitch),
    objections: (Array.isArray(p.objections) ? p.objections : [])
      .map((o: any) => ({ objection: str(o?.objection, 300), response: str(o?.response, 1200) }))
      .filter((o: Objection) => o.objection && o.response).slice(0, 40),
    faqs: (Array.isArray(p.faqs) ? p.faqs : [])
      .map((f: any) => ({ question: str(f?.question, 300), answer: str(f?.answer, 1200) }))
      .filter((f: Faq) => f.question && f.answer).slice(0, 60),
    closing: str(p.closing, 1500), followUp: str(p.followUp, 800),
    doNot: list(p.doNot, 20, 300), facts: list(p.facts, 60, 400), missing: list(p.missing, 10, 300),
  };
}

export function normalizeLinks(v: any): AgentLink[] {
  const purposes = ["payment", "website", "booking", "brochure", "other"];
  return (Array.isArray(v) ? v : []).map((l: any) => {
    const url = str(l?.url, 500);
    return { label: str(l?.label, 80) || "Link", url, purpose: purposes.includes(l?.purpose) ? l.purpose : "other", say: str(l?.say, 200) || spokenUrl(url) };
  }).filter((l: AgentLink) => /^https?:\/\/|^[\w-]+\.[a-z]{2,}/i.test(l.url)).slice(0, 12);
}

export function normalizePronunciations(v: any): Pronunciation[] {
  return (Array.isArray(v) ? v : []).map((p: any) => ({ word: str(p?.word, 60), sayAs: str(p?.sayAs, 120), note: str(p?.note, 120) || undefined }))
    .filter((p: Pronunciation) => p.word && p.sayAs && p.word !== p.sayAs).slice(0, 80);
}

export function normalizePolicy(v: any, opening: string): LanguagePolicy {
  const allowed = Array.from(new Set([baseLang(opening), ...(Array.isArray(v?.allowed) ? v.allowed.map(baseLang) : [])])).filter((l) => LANG_NAMES[l]).slice(0, 8);
  return { mode: v?.mode === "fixed" ? "fixed" : "match_caller", allowed };
}

/** "https://www.rana.ai/pay?x=1" → "rana dot ai slash pay" — how a person would say it on the phone. */
export function spokenUrl(url: string): string {
  const u = String(url || "").replace(/^https?:\/\//i, "").replace(/^www\./i, "").split(/[?#]/)[0].replace(/\/+$/, "");
  return u.replace(/\./g, " dot ").replace(/\//g, " slash ").replace(/-/g, " dash ").replace(/_/g, " underscore ").replace(/\s+/g, " ").trim();
}

/** Rough language of a piece of text from its script — enough to warn "your greeting is in English but the agent opens in Telugu". */
export function detectScriptLanguage(text: string): string | null {
  const t = String(text || "");
  const counts: [string, RegExp][] = [["te", /[ఀ-౿]/g], ["hi", /[ऀ-ॿ]/g], ["ta", /[஀-௿]/g], ["kn", /[ಀ-೿]/g],
    ["ml", /[ഀ-ൿ]/g], ["bn", /[ঀ-৿]/g], ["gu", /[઀-૿]/g], ["pa", /[਀-੿]/g], ["ar", /[؀-ۿ]/g], ["en", /[A-Za-z]/g]];
  let best: string | null = null, n = 0;
  for (const [l, rx] of counts) { const c = (t.match(rx) || []).length * (l === "en" ? 0.5 : 1); if (c > n) { n = c; best = l; } }
  return n >= 4 ? best : null;
}

/* ── Prompts for the AI that reads and edits scripts ── */

const PLAYBOOK_SHAPE = `{
  "goal": "what a successful call achieves, one sentence",
  "persona": "who the agent is: name, company, role, tone",
  "opening": "what to say right after the greeting to introduce the reason for the call",
  "discovery": ["questions to understand the caller, in order"],
  "pitch": ["key benefits / offer points, most important first"],
  "objections": [{"objection": "what the caller says", "response": "how to answer it"}],
  "faqs": [{"question": "likely question", "answer": "the answer from the script"}],
  "closing": "how to close: the exact ask / next step",
  "followUp": "what to do if they are not ready (callback, WhatsApp details, etc.)",
  "doNot": ["things the agent must never say or promise"],
  "facts": ["hard facts: prices, dates, batch timings, addresses, eligibility"],
  "missing": ["important gaps in the script the business should fill, e.g. 'No answer for: is there EMI?'"]
}`;

export function analyzeMessages(input: { script: string; agentName: string; openingLanguage: string; businessNotes?: string; part?: number; parts?: number }) {
  const lang = LANG_NAMES[baseLang(input.openingLanguage)] || "English";
  const partNote = input.parts && input.parts > 1
    ? `\nThis is PART ${input.part} of ${input.parts} of a long script. Extract only what is in this part; leave fields empty ("" or []) when this part has nothing for them.${(input.part || 1) > 1 ? " Leave \"greeting\", \"goal\", \"persona\" and \"opening\" empty unless this part clearly contains them." : ""}`
    : "";
  return [
    { role: "system" as const, content: `You are an expert sales-call designer for Indian businesses. You turn any raw call script (English, Telugu, Hindi or mixed; bullet points, paragraphs or a transcript) into a structured playbook for an AI phone agent.
Rules:
- Use ONLY information in the script and notes. Never invent prices, dates, offers or policies. If something important is missing, list it in "missing".
- Put every objection and its answer you can find (or clearly implied) into "objections". Common Indian sales objections (price, time, "I'll think about it", "send details on WhatsApp", "already joined elsewhere") should be included when the script answers them.
- Keep each item short and spoken-style (one or two sentences). Keep the language of each item as in the script. Merge near-duplicates.
- Find every URL or website mentioned and return it in "links" with a purpose (payment, website, booking, brochure, other).
- Suggest a greeting in ${lang}: the first sentence the agent says when the call connects (say who is calling and from where, in ${lang}${baseLang(input.openingLanguage) !== "en" ? `, written in ${SCRIPT_NOTE[baseLang(input.openingLanguage)] || "its native script"}` : ""}).
- List brand names, course names, place names and acronyms the speech system might mishear in "keyterms", and ones a voice might mispronounce in "pronunciations" with a simple sounds-like spelling (e.g. {"word":"DBMCI","sayAs":"D B M C I"}).
Return ONLY JSON of this shape:
{"playbook": ${PLAYBOOK_SHAPE},
 "greeting": "string",
 "links": [{"label": "string", "url": "string", "purpose": "payment|website|booking|brochure|other"}],
 "keyterms": ["string"],
 "pronunciations": [{"word": "string", "sayAs": "string"}]}` },
    { role: "user" as const, content: `Agent name: ${input.agentName || "(not set)"}
Opens calls in: ${lang}${partNote}
${input.businessNotes ? `Extra notes / documents:\n${input.businessNotes.slice(0, 6000)}\n` : ""}
SCRIPT:
${input.script.slice(0, 24000)}` },
  ];
}

export function editMessages(input: { playbook: Playbook; greeting: string; links: AgentLink[]; instruction: string; openingLanguage: string }) {
  return [
    { role: "system" as const, content: `You edit an AI phone agent's call playbook exactly as the business owner asks. Change only what the request needs and keep everything else word-for-word. Never invent prices, dates or policies that aren't already present or given in the request. Keep items short and spoken-style. The agent opens in ${LANG_NAMES[baseLang(input.openingLanguage)] || "English"}.
Return ONLY JSON: {"playbook": ${PLAYBOOK_SHAPE}, "greeting": "string", "links": [{"label": "string", "url": "string", "purpose": "string"}], "summary": "one short sentence describing what you changed"}` },
    { role: "user" as const, content: `CURRENT:\n${JSON.stringify({ playbook: input.playbook, greeting: input.greeting, links: input.links })}\n\nREQUEST: ${input.instruction.slice(0, 2000)}` },
  ];
}

export function translateMessages(text: string, to: string) {
  const name = LANG_NAMES[baseLang(to)] || "English";
  return [
    { role: "system" as const, content: `Translate for a phone call in India into natural, spoken ${name}${SCRIPT_NOTE[baseLang(to)] ? ` written in ${SCRIPT_NOTE[baseLang(to)]}` : ""}. Keep brand names, course names and English words people normally say in English (fees, batch, online, EMI) as they are. Reply with only the translation.` },
    { role: "user" as const, content: text.slice(0, 4000) },
  ];
}

export function summarizeMessages(title: string, content: string) {
  return [
    { role: "system" as const, content: "You prepare reference notes for an AI phone sales agent. From the document, extract only facts a caller might ask about: products/courses, prices and fees, discounts, batch dates and timings, duration, eligibility, locations, contact details, policies (refund, EMI), and common questions with answers. Short bullet points, no marketing fluff, max 350 words. Keep numbers exact." },
    { role: "user" as const, content: `Document: ${title}\n\n${content.slice(0, 30000)}` },
  ];
}

/** Splits a long script into at most `maxParts` parts of roughly `size` characters, on paragraph (then line) boundaries. */
export function splitScript(script: string, size = 9000, maxParts = 6): string[] {
  const text = script.trim();
  if (text.length <= size) return [text];
  size = Math.max(size, Math.ceil(text.length / maxParts));
  const blocks = text.split(/\n\s*\n/).flatMap((b) => (b.length > size ? b.split(/\n/) : [b]))
    .flatMap((b) => { const out: string[] = []; for (let i = 0; i < b.length; i += size) out.push(b.slice(i, i + size)); return out; });
  const parts: string[] = [];
  let cur = "";
  for (const b of blocks) {
    if (cur && cur.length + b.length + 2 > size && parts.length < maxParts - 1) { parts.push(cur); cur = ""; }
    cur = cur ? `${cur}\n\n${b}` : b;
  }
  if (cur) parts.push(cur);
  return parts;
}

/** Combines the AI's reading of each part into one playbook: first opening, last closing, all lists de-duplicated. */
export function mergeAnalyses(outs: any[]): { playbook: Playbook; greeting: string; links: any[]; keyterms: string[]; pronunciations: Pronunciation[] } {
  const pbs = outs.map((o) => normalizePlaybook(o?.playbook));
  const key = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const uniq = (arr: string[]) => { const seen = new Set<string>(); return arr.filter((x) => { const k = key(x); if (!k || seen.has(k)) return false; seen.add(k); return true; }); };
  const uniqBy = <T,>(arr: T[], f: (x: T) => string) => { const seen = new Set<string>(); return arr.filter((x) => { const k = key(f(x)); if (!k || seen.has(k)) return false; seen.add(k); return true; }); };
  const first = (f: (p: Playbook) => string) => pbs.map(f).find(Boolean) || "";
  const last = (f: (p: Playbook) => string) => [...pbs].reverse().map(f).find(Boolean) || "";
  const playbook = normalizePlaybook({
    goal: first((p) => p.goal), persona: first((p) => p.persona), opening: first((p) => p.opening),
    discovery: uniq(pbs.flatMap((p) => p.discovery)), pitch: uniq(pbs.flatMap((p) => p.pitch)),
    objections: uniqBy(pbs.flatMap((p) => p.objections), (o) => o.objection),
    faqs: uniqBy(pbs.flatMap((p) => p.faqs), (f) => f.question),
    closing: last((p) => p.closing), followUp: last((p) => p.followUp),
    doNot: uniq(pbs.flatMap((p) => p.doNot)), facts: uniq(pbs.flatMap((p) => p.facts)), missing: uniq(pbs.flatMap((p) => p.missing || [])).slice(0, 10),
  });
  const greeting = String(outs.map((o) => o?.greeting).find((g) => typeof g === "string" && g.trim()) || "");
  const links = outs.flatMap((o) => (Array.isArray(o?.links) ? o.links : []));
  const keyterms = uniq(outs.flatMap((o) => (Array.isArray(o?.keyterms) ? o.keyterms.map(String) : [])));
  const pronunciations = uniqBy(normalizePronunciations(outs.flatMap((o) => (Array.isArray(o?.pronunciations) ? o.pronunciations : []))), (p) => p.word);
  return { playbook, greeting, links, keyterms, pronunciations };
}

/** When no AI is reachable: a simple structural split so the Studio still works. */
export function heuristicPlaybook(script: string): { playbook: Playbook; links: AgentLink[] } {
  const lines = script.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const p: Playbook = { ...EMPTY_PLAYBOOK, discovery: [], pitch: [], objections: [], faqs: [], doNot: [], facts: [], missing: [] };
  let section: keyof Playbook | "objection" = "opening";
  let pendingObjection = "";
  for (const raw of lines) {
    const l = raw.replace(/^[-*•\d.)\s]+/, "");
    const h = l.toLowerCase();
    if (/^(intro|introduction|opening|greeting)\b/.test(h)) { section = "opening"; continue; }
    if (/^(question|discovery|qualif)/.test(h)) { section = "discovery"; continue; }
    if (/^(pitch|benefit|offer|product|course detail)/.test(h)) { section = "pitch"; continue; }
    if (/^objection/.test(h) && !/[:?]\s*\S/.test(l.slice(9))) { section = "objection"; continue; }
    if (/^(clos|call to action|cta)/.test(h)) { section = "closing"; continue; }
    if (/^(faq|questions? and answers?)/.test(h)) { section = "faqs"; continue; }
    const qa = l.match(/^(?:objection|if (?:they|caller|customer) says?|q)[:\s-]+(.+?)(?:\s*[-–→:]\s*(?:a|answer|response|reply)?[:\s]+(.+))?$/i);
    if (qa) { if (qa[2]) p.objections.push({ objection: qa[1], response: qa[2] }); else pendingObjection = qa[1]; continue; }
    const ans = l.match(/^(?:a|answer|response|reply)[:\s-]+(.+)$/i);
    if (ans && pendingObjection) { p.objections.push({ objection: pendingObjection, response: ans[1] }); pendingObjection = ""; continue; }
    if (section === "opening") p.opening = `${p.opening} ${l}`.trim();
    else if (section === "closing") p.closing = `${p.closing} ${l}`.trim();
    else if (section === "discovery") p.discovery.push(l);
    else if (section === "pitch") p.pitch.push(l);
    else p.pitch.push(l);
  }
  const urls = Array.from(new Set(script.match(/https?:\/\/[^\s)]+|www\.[^\s)]+/gi) || []));
  const links = normalizeLinks(urls.map((u) => ({ url: u, label: /pay|razorpay|checkout/i.test(u) ? "Payment link" : "Website", purpose: /pay|razorpay|checkout/i.test(u) ? "payment" : "website" })));
  p.missing = ["AI analysis wasn't available, so sections were split by headings. Review each card."];
  return { playbook: normalizePlaybook(p), links };
}

/** Old employees have only numbered steps; show them as a playbook so nothing is lost. */
export function playbookFromSteps(steps: { title: string; body: string }[], facts: string[] = []): Playbook {
  const p: Playbook = { ...EMPTY_PLAYBOOK, discovery: [], pitch: [], objections: [], faqs: [], doNot: [], facts: [...facts], missing: [] };
  for (const s of steps || []) {
    const t = `${s.title} ${s.body}`.toLowerCase();
    const line = s.title && s.body ? `${s.title}: ${s.body}` : s.title || s.body;
    if (!p.opening && /open|intro|greet/.test(t)) p.opening = s.body || s.title;
    else if (/qualif|ask|discover|need/.test(t)) p.discovery.push(line);
    else if (/objection|concern|price|too expensive/.test(t)) p.objections.push({ objection: s.title || "Concern", response: s.body });
    else if (/close|book|pay|enrol|next step/.test(t)) p.closing = `${p.closing} ${line}`.trim();
    else p.pitch.push(line);
  }
  return normalizePlaybook(p);
}

/** Steps kept for older screens (My Employees, Talk page) that still read `steps`. */
export function playbookToSteps(p: Playbook) {
  const mk = (title: string, body: string) => ({ id: `s${Math.random().toString(36).slice(2, 10)}`, title, body });
  const out = [];
  if (p.opening) out.push(mk("Opening", p.opening));
  if (p.discovery.length) out.push(mk("Understand the caller", p.discovery.join("\n")));
  if (p.pitch.length) out.push(mk("Pitch", p.pitch.join("\n")));
  if (p.objections.length) out.push(mk("Handle objections", p.objections.map((o) => `If: ${o.objection} → ${o.response}`).join("\n")));
  if (p.closing) out.push(mk("Close", p.closing));
  if (p.followUp) out.push(mk("If not ready", p.followUp));
  return out;
}

/* ── Compiling everything into the agent's instructions ── */

export function buildAgentPrompt(s: {
  name: string; greeting: string; startingLanguage: string; strictnessText: string;
  playbook: Playbook | null; steps?: { title: string; body: string }[]; facts?: string[];
  policy: LanguagePolicy; links: AgentLink[]; pronunciations: Pronunciation[]; knowledge: KnowledgeItem[];
}): string {
  const open = baseLang(s.startingLanguage);
  const openName = LANG_NAMES[open] || "English";
  const p = s.playbook;
  const parts: string[] = [];

  parts.push(`# Who you are
You are ${s.name}, speaking on a live phone call${p?.persona ? `. ${p.persona}` : ""}.
${p?.goal ? `Goal of every call: ${p.goal}` : ""}
This is a voice call: speak in short, natural sentences (1–2 per turn), ask one question at a time, and let the caller finish. Never read out lists, symbols or markdown.
${s.strictnessText}`.trim());

  const allowed = s.policy.allowed.map((l) => LANG_NAMES[l]).filter(Boolean);
  parts.push(s.policy.mode === "fixed"
    ? `# Language
Speak only ${openName}${SCRIPT_NOTE[open] ? `, written in ${SCRIPT_NOTE[open]}` : ""}. If the caller uses another language, reply politely in ${openName}.`
    : `# Language
- The call opens in ${openName}.
- After that, ALWAYS reply in the language the caller is speaking in their latest turn. If they switch from ${openName} to ${allowed.filter((a) => a !== openName).join(" or ") || "another language"}, switch with them immediately and stay in it until they switch again.
- Languages you may use: ${allowed.join(", ")}. If the caller uses any other language, continue in ${openName} and politely say you can speak ${allowed.join(", ")}.
- Write each language in its own script so it is pronounced correctly: ${allowed.map((a) => { const code = Object.keys(LANG_NAMES).find((k) => LANG_NAMES[k] === a)!; return SCRIPT_NOTE[code] ? `${a} in ${SCRIPT_NOTE[code]}` : `${a} in Latin letters`; }).join("; ")}.
- Mixing common English words (fees, batch, online, EMI, course names) into Telugu or Hindi is natural — do it the way the caller does.`);

  if (p) {
    const flow: string[] = [];
    if (s.greeting) flow.push(`1. Greeting (already spoken when the call connects): "${s.greeting}"`);
    if (p.opening) flow.push(`2. Opening — say why you are calling: ${p.opening}`);
    if (p.discovery.length) flow.push(`3. Understand the caller — ask these one at a time and listen:\n${p.discovery.map((q) => `   - ${q}`).join("\n")}`);
    if (p.pitch.length) flow.push(`4. Pitch — share the points that match what they told you:\n${p.pitch.map((q) => `   - ${q}`).join("\n")}`);
    if (p.closing) flow.push(`5. Close: ${p.closing}`);
    if (p.followUp) flow.push(`6. If they are not ready: ${p.followUp}`);
    parts.push(`# Call flow\n${flow.join("\n")}`);
    if (p.objections.length) parts.push(`# Objection handling\nWhen the caller says something like the left side, answer in the spirit of the right side (in the caller's language, in your own words):\n${p.objections.map((o) => `- "${o.objection}" → ${o.response}`).join("\n")}`);
    if (p.faqs.length) parts.push(`# Questions callers ask\n${p.faqs.map((f) => `- Q: ${f.question}\n  A: ${f.answer}`).join("\n")}`);
    if (p.doNot.length) parts.push(`# Never\n${p.doNot.map((d) => `- ${d}`).join("\n")}`);
  } else if (s.steps?.length) {
    parts.push(`# Call flow\n${s.steps.map((st, i) => `${i + 1}. ${st.title}\n${st.body}`).join("\n\n")}`);
  }

  const facts = [...(p?.facts || []), ...(s.facts || [])].filter(Boolean);
  if (facts.length) parts.push(`# Facts (exact — never change numbers)\n${Array.from(new Set(facts)).map((f) => `- ${f}`).join("\n")}`);

  if (s.links.length) {
    parts.push(`# Links
Never read a full web address letter by letter. Say it the short way shown, slowly, and offer to repeat it. Tell the caller our team will also send it on WhatsApp right after this call.
${s.links.map((l) => `- ${l.label} (${l.purpose}): say "${l.say || spokenUrl(l.url)}"${l.purpose === "payment" ? " — share this only when the caller is ready to pay or asks how to pay" : ""}`).join("\n")}`);
  }

  if (s.knowledge.length) {
    let budget = 12000;
    const blocks: string[] = [];
    for (const k of s.knowledge) {
      const body = (k.summary || k.content || "").trim();
      if (!body || budget <= 0) continue;
      const cut = body.slice(0, Math.min(budget, 4000));
      budget -= cut.length;
      blocks.push(`## ${k.title}\n${cut}`);
    }
    if (blocks.length) parts.push(`# Reference information\nUse this to answer questions. If the answer is not here or in the facts above, do not guess — say you will check and our team will call back.\n${blocks.join("\n\n")}`);
  }

  if (s.pronunciations.length) {
    parts.push(`# Pronunciation
When you need to say these words, write them exactly as shown on the right so they are pronounced correctly:
${s.pronunciations.map((x) => `- ${x.word} → ${x.sayAs}`).join("\n")}`);
  }

  parts.push(`# Always
- Be honest. If asked whether you are an AI or a real person, say you are an AI assistant calling on behalf of the team.
- If the caller asks not to be called again, apologise, confirm they will not be called again, and end the call politely.
- If they are busy, ask for a good time to call back, confirm it, and end the call.
- Never promise anything that is not written above.`);

  return parts.join("\n\n");
}
