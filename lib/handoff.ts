// Human handoff: when the AI should stop and pass the caller to a person — and to whom.
// Each employee keeps its own team list and rules (scripts.handoff). The rules go into the agent's instructions;
// after every call RANA also reads the conversation, and if a handoff was needed it alerts the right person
// straight away (email now) and marks the lead for follow-up. Live transfer on the call itself switches on with
// RANA_LIVE_TRANSFER=on once the Sarvam agents have "Call forwarding" bound to the agent variable `transfer_to`.

export type HandoffTeam = "sales" | "admissions" | "support" | "accounts" | "manager" | "other";
export type HandoffContact = { key: string; name: string; team: HandoffTeam; phone: string; email: string; aka: string };
export type HandoffRuleKey = "ready_to_buy" | "asks_person" | "asks_human" | "existing_customer" | "complaint" | "unknown_answer";
export type HandoffRule = { key: HandoffRuleKey; on: boolean; to: string }; // to = contact key ("" = the first contact)
export type Handoff = { enabled: boolean; contacts: HandoffContact[]; rules: HandoffRule[]; say: string; hours: string };

export const TEAM_LABELS: Record<HandoffTeam, string> = {
  sales: "Sales", admissions: "Admissions", support: "Student / customer support", accounts: "Accounts & fees", manager: "Manager", other: "Other",
};

export const RULES: { key: HandoffRuleKey; label: string; example: string; team: HandoffTeam; prompt: string }[] = [
  { key: "ready_to_buy", label: "Ready to join or pay now", example: "“I want to join today — how do I pay the fee?”", team: "sales", prompt: "the caller clearly wants to join, enrol, buy or pay now, or asks for the payment link or how to pay" },
  { key: "asks_person", label: "Asks for a specific person", example: "“Can I speak to Charan?”", team: "sales", prompt: "the caller asks for one of the team members listed below by name" },
  { key: "asks_human", label: "Wants a human", example: "“Let me talk to a real person / your manager.”", team: "sales", prompt: "the caller insists on talking to a human, a counsellor or a manager" },
  { key: "existing_customer", label: "Existing customer with an issue", example: "“I already paid but my admission isn't confirmed.”", team: "support", prompt: "the caller is an existing student/customer with a problem (payment made but not reflected, admission, login, classes, refund, certificate)" },
  { key: "complaint", label: "Angry or complaining", example: "“This is the third time I'm calling, nobody helped me.”", team: "manager", prompt: "the caller is angry, upset or making a complaint" },
  { key: "unknown_answer", label: "Question you can't answer", example: "A detailed question that isn't in the script or knowledge", team: "sales", prompt: "the caller needs an answer that is not in your instructions and it matters to their decision" },
];

export const EMPTY_HANDOFF: Handoff = {
  enabled: false, contacts: [], hours: "",
  rules: RULES.map((r) => ({ key: r.key, on: ["ready_to_buy", "asks_person", "asks_human", "existing_customer", "complaint"].includes(r.key), to: "" })),
  say: "",
};

const clip = (v: any, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
export function cleanPhone(raw: string): string {
  let d = String(raw || "").replace(/[^\d+]/g, "");
  if (!d) return "";
  if (d.startsWith("+")) return /^\+[1-9]\d{7,14}$/.test(d) ? d : "";
  if (d.startsWith("00")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = "91" + d.slice(1);
  else if (d.length === 10) d = "91" + d;
  return /^[1-9]\d{9,14}$/.test(d) ? "+" + d : "";
}

export function normalizeHandoff(h: any): Handoff {
  if (!h || typeof h !== "object") return { ...EMPTY_HANDOFF, rules: EMPTY_HANDOFF.rules.map((r) => ({ ...r })) };
  const teams = Object.keys(TEAM_LABELS);
  const contacts: HandoffContact[] = (Array.isArray(h.contacts) ? h.contacts : []).slice(0, 20).map((c: any, i: number) => ({
    key: clip(c?.key, 24).replace(/[^\w-]/g, "") || `p${i + 1}`,
    name: clip(c?.name, 60),
    team: (teams.includes(c?.team) ? c.team : "sales") as HandoffTeam,
    phone: cleanPhone(c?.phone) || clip(c?.phone, 20),
    email: clip(c?.email, 120).toLowerCase(),
    aka: clip(c?.aka, 80),
  })).filter((c: HandoffContact) => c.name || c.phone || c.email);
  const keys = new Set(contacts.map((c) => c.key));
  const given = new Map((Array.isArray(h.rules) ? h.rules : []).map((r: any) => [r?.key, r]));
  const rules = RULES.map((r) => {
    const g: any = given.get(r.key);
    const def = EMPTY_HANDOFF.rules.find((x) => x.key === r.key)!;
    return { key: r.key, on: g ? !!g.on : def.on, to: g && keys.has(g.to) ? g.to : "" };
  });
  return { enabled: !!h.enabled && contacts.length > 0, contacts, rules, say: clip(h.say, 240), hours: clip(h.hours, 80) };
}

/** Who a rule goes to: the chosen person, else the first person on the matching team, else the first person. */
export function ruleTarget(h: Handoff, key: HandoffRuleKey): HandoffContact | null {
  const rule = h.rules.find((r) => r.key === key);
  if (rule?.to) { const c = h.contacts.find((x) => x.key === rule.to); if (c) return c; }
  const team = RULES.find((r) => r.key === key)?.team;
  return h.contacts.find((c) => c.team === team) || h.contacts[0] || null;
}

export const liveTransferOn = () => /^(on|1|true|yes)$/i.test(process.env.RANA_LIVE_TRANSFER || "");

/** The default live-transfer number for a call: whoever "ready to buy" goes to. */
export function transferNumber(h: Handoff): string | null {
  if (!h.enabled) return null;
  const c = ruleTarget(h, "ready_to_buy");
  return c?.phone && cleanPhone(c.phone) ? cleanPhone(c.phone) : null;
}

/** Instructions section compiled into the agent prompt. */
export function handoffPrompt(h: Handoff, live = liveTransferOn()): string {
  if (!h.enabled || !h.contacts.length) return "";
  const active = RULES.filter((r) => h.rules.find((x) => x.key === r.key)?.on);
  if (!active.length) return "";
  const liveTo = live ? transferNumber(h) : null;
  const liveContact = liveTo ? h.contacts.find((c) => cleanPhone(c.phone) === liveTo) : null;
  const who = (c: HandoffContact | null) => (c ? `${c.name || TEAM_LABELS[c.team]}${c.name ? ` (${TEAM_LABELS[c.team]})` : ""}` : "our team");
  const lines = active.map((r) => `- When ${r.prompt} → hand over to ${r.key === "asks_person" ? "that person" : who(ruleTarget(h, r.key))}.`);
  const team = h.contacts.map((c) => `- ${c.name || "(no name)"} — ${TEAM_LABELS[c.team]}${c.aka ? ` (also called: ${c.aka})` : ""}`);
  const say = h.say || "Sure — let me connect you to the right person on our team.";
  const how = liveContact
    ? `How to hand over:
- For ${who(liveContact)}: say one short line like "${say}" and then use the call transfer tool (@call_transfer) straight away. Do not keep talking after that.
- For anyone else: say they will call back within 10 minutes${h.hours ? ` (working hours: ${h.hours})` : ""}, confirm the best number to reach the caller, thank them and end the call.
- If the transfer does not connect, apologise and promise a call back within 10 minutes.`
    : `How to hand over:
- Say one short line like "${say}", then tell the caller that person will call them back within 10 minutes${h.hours ? ` (working hours: ${h.hours})` : ""}.
- Confirm the best number to reach them and a good time, thank them, and end the call. Our team is alerted immediately.`;
  return `# Handing the call to a person
Do not keep selling when a person is needed. Hand over when:
${lines.join("\n")}
- Do not hand over just because the caller asks a normal question you can answer.

Our team:
${team.join("\n")}

${how}`;
}

/* ─────────── after the call: did it need a person? ─────────── */

const PATTERNS: Record<Exclude<HandoffRuleKey, "asks_person" | "unknown_answer">, RegExp> = {
  ready_to_buy: /\b(want|like|ready|going|wish) to (join|enrol|enroll|register|pay|book|buy|take (the )?admission|purchase)\b|\bhow (do|can|should) i (pay|join|register|enrol|enroll)\b|\b(send|share|give)( me)?( the)? payment link\b|\b(join|pay|register)( it)? (today|now|right now|immediately)\b|\bi('ll| will) (pay|join) (today|now|tomorrow)\b|\btake admission\b|\bconfirm (my )?(seat|admission)\b/i,
  asks_human: /\b(talk|speak|connect|transfer)( me)? (to|with) (a |an |the |your )?(real |actual |human |live )?(person|human|manager|counsell?or|team|someone|somebody|agent|executive|staff|senior)\b|\b(real|actual) (person|human)\b|\bnot (to|with) (a |an )?(robot|bot|machine|ai)\b/i,
  existing_customer: /\balready (paid|joined|enrolled|registered|took admission|have admission)\b|\b(my|the) (admission|payment|fee|login|id card|classes?|app|refund|certificate|receipt|batch)\b.{0,30}\b(issue|problem|not (working|showing|received|confirmed|reflect|updated)|pending|stuck|failed|wrong|missing)\b|\brefund\b|\bpaid but\b/i,
  complaint: /\bcomplain(t|ing)?\b|\b(worst|pathetic|horrible|useless|cheat(ed|ing)?|fraud|scam)\b|\bconsumer (court|forum)\b|\bnobody (helped|responds|picks|called)\b|\bvery (bad|disappointed|upset|angry)\b|\bthird time\b|\bnot happy\b/i,
};

export type HandoffHit = { rule: HandoffRuleKey; to: HandoffContact | null; quote: string };

/** Read the caller's side of the call (English translation where available) and decide whether a person is needed. */
export function detectHandoff(h: Handoff, transcript: { role: string; text: string }[]): HandoffHit | null {
  if (!h.enabled || !h.contacts.length) return null;
  const on = (k: HandoffRuleKey) => !!h.rules.find((r) => r.key === k)?.on;
  const user = transcript.filter((t) => t.role === "user").map((t) => String(t.text || ""));
  // Asked for someone by name ("speak to Charan", "Charan sir").
  if (on("asks_person")) {
    for (const line of user) {
      for (const c of h.contacts) {
        const names = [c.name, ...String(c.aka || "").split(/[,/]/)].map((n) => n.trim().split(/\s+/)[0]).filter((n) => n && n.length >= 3);
        for (const n of names) {
          const re = new RegExp(`\\b(talk|speak|connect|transfer|call|put|give|where is|is)\\b[^.?!]{0,25}\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b|\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} (sir|madam|garu|ji|mam|ma'am)\\b`, "i");
          if (re.test(line)) return { rule: "asks_person", to: c, quote: line.slice(0, 200) };
        }
      }
    }
  }
  for (const k of ["complaint", "existing_customer", "ready_to_buy", "asks_human"] as const) {
    if (!on(k)) continue;
    const line = user.find((l) => PATTERNS[k].test(l));
    if (line) return { rule: k, to: ruleTarget(h, k), quote: line.slice(0, 200) };
  }
  return null;
}

/** Tag the agent adds to the instructions so the webhook knows which employee handled a call. */
export const scriptRefLine = (id: string) => `(Internal reference ${id} — never say this.)`;
export function scriptRefFrom(instructions: unknown): string | null {
  const m = String(instructions || "").match(/\(Internal reference ([0-9a-f-]{36}) — never say this\.\)/);
  return m ? m[1] : null;
}
