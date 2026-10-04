// Inbound and outbound calls are different conversations. An inbound caller chose to call and has a reason;
// an outbound contact did not expect the call and decides in the first 2–3 seconds whether to listen.
// These rules go into every prompt that knows the direction: website demos, industry live demos and real calls.

export type CallDirection = "inbound" | "outbound";

export const OUTBOUND_STYLE = `# This call is OUTBOUND — you called them
They did not expect your call. The first 2–3 seconds decide whether they keep listening.
- Opening: their name (if you know it), your name and company, and the one specific reason you are calling that matters to THEM (what they enquired about, applied for, booked or are due for). Then ask permission: "Do you have 30 seconds?" or "Is this a good time?". The greeting already did this — if they say "yes" or "hello?", continue with one short hook, not a speech.
- Never open with "How can I help you?" — you are the one who called. Never introduce yourself or the company at length.
- After permission: one relevant line of value, then one easy question. Earn each next question; keep momentum.
- "Who is this?" → name, company and reason in one line. "How did you get my number?" → say where it came from only if the facts above say so (their enquiry, application or booking); otherwise apologise and offer not to call again.
- Busy → ask for a good time, confirm it, end within 10 seconds. Not interested → thank them warmly and end; never push twice or argue.
- Confident, friendly and brisk — respect their time. Reach the goal or a clear next step within about two minutes, then confirm it in one sentence.`;

export const INBOUND_STYLE = `# This call is INBOUND — they called you
They chose to call and already have a reason. Your job is to listen, understand and help.
- After the greeting, let them speak first. Do not start asking your questions or pitching before you know why they called.
- Answer what they asked first, simply. Then ask only the questions you need to help them (book, check, qualify), one at a time — say why when it helps ("so I can find the right slot").
- Never sound like a sales call. Suggest other products only after their need is handled, and only if it clearly fits.
- Match their pace and urgency. If they are upset, acknowledge it before solving.
- Resolve, book or route to the right person. Before ending, check: "Is there anything else I can help you with?"`;

export const BOTH_STYLES = `# Inbound vs outbound
Inbound and outbound calls must sound different. Work out which this is from the greeting: if you called them, follow OUTBOUND; if they called you, follow INBOUND.

${OUTBOUND_STYLE.replace("# This call is OUTBOUND — you called them", "## OUTBOUND — you called them")}

${INBOUND_STYLE.replace("# This call is INBOUND — they called you", "## INBOUND — they called you")}`;

export const STYLE_MARKER = "# Inbound vs outbound";

export function directionStyle(dir: CallDirection | null | undefined): string {
  return dir === "outbound" ? OUTBOUND_STYLE : dir === "inbound" ? INBOUND_STYLE : BOTH_STYLES;
}

/** A first name that is safe to speak and to place in a prompt. */
export function cleanFirstName(v: any): string {
  const s = String(v ?? "").normalize("NFC").replace(/[\u0000-\u001f0-9<>{}()\[\]@#$%^&*_=+|\\/:;"`~!?,]/g, "").replace(/\s+/g, " ").trim();
  return s.split(" ")[0].slice(0, 24);
}

function _unusedOldFilter(v: any): string {
  const s = String(v ?? "").normalize("NFC").replace(/[\u0000-\u001f  0-9<>{}()\[\]@#$%^&*_=+|\\/:;"`~!?,]/g, "").replace(/\s+/g, " ").trim();
  return s.split(" ")[0].slice(0, 24);
}

/** Put the person's name into an outbound opening: "Hi, this is…" → "Hi Charan, this is…". */
export function withName(open: string, name: string): string {
  if (!name) return open;
  if (/^(hi|hello|namaste)\b/i.test(open)) return open.replace(/^(hi|hello|namaste)\b,?\s*/i, (_m, w) => `${w} ${name}, `);
  return `Hi ${name}, ${open.charAt(0).toLowerCase()}${open.slice(1)}`;
}
