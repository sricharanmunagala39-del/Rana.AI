// Voice layer. The engine talks to a VoiceAdapter and never to a provider directly, so the calling engine can be
// swapped without touching discovery, scoring or booking.
//  • SimulatedVoice — free, runs everywhere, follows the real call plan; every result is labelled simulated.
//  • SarvamLiveVoice — RANA's existing Sarvam outbound calling. Real calls cost Sarvam credits, so it only
//    exists when SALES_ENGINE_LIVE_CALLS=1 and every compliance check in rules.ts passes for that prospect.
import type { CallResult, OutreachPlan, Prospect, SimScenario, TranscriptLine } from "./types";
import type { Slot } from "./booking";
import { optOutPhrase } from "../compliance";

export type CallInput = { prospect: Prospect; plan: OutreachPlan; phone: string; slots: Slot[]; askFor: string | null; now?: Date };

export interface VoiceAdapter {
  id: string;
  live: boolean;
  /** null when ready, else why not. */
  notReady(): string | null;
  call(input: CallInput): Promise<CallResult>;
}

export function hashOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Deterministic mix of outcomes for a prospect + attempt, so a re-run gives the same simulated results. */
export function pickScenario(p: Prospect): SimScenario {
  if (p.simScenario) return p.simScenario;
  const r = hashOf(`${p.key}#${p.attempts}`) % 100;
  const direct = p.contacts.some((c) => c.decisionMaker && c.phone && (c.phoneType === "direct" || c.phoneType === "mobile")) || p.company.phoneType === "mobile";
  if (r < 22) return "no_answer";
  if (!direct && r < 50) return r < 40 ? "receptionist" : "receptionist_transfer";
  if (r < 64) return "decline";
  if (r < 76) return "callback";
  if (r < 81) return "opt_out";
  return "interested_book";
}

const PERSON: Record<string, string[]> = {
  receptionist: ["Hello, {company}, how can I help?", "Sir is not available right now. You can email the details to our info address.", "Okay, thank you."],
  decline: ["Yes, speaking.", "Okay.", "No, we're happy with how we handle calls now. Not interested, thanks."],
  callback: ["Yes, tell me.", "I'm in a meeting now. Call me tomorrow afternoon around 3.", "Okay bye."],
  opt_out: ["Who is this?", "Please don't call this number again."],
  interested: ["Yes, speaking.", "Sure, go ahead.", "We get around 80 to 100 enquiry calls a day; a lot of evening calls get missed.", "Mostly they go to voicemail or we call back next day.", "Okay, that sounds useful. Let's see a demo.", "The first one works."],
};

export class SimulatedVoice implements VoiceAdapter {
  id = "simulator";
  live = false;
  notReady() { return null; }
  async call({ prospect: p, plan, slots, now }: CallInput): Promise<CallResult> {
    const scenario = pickScenario(p);
    const say = (text: string): TranscriptLine => ({ who: "agent", text });
    const hear = (text: string): TranscriptLine => ({ who: "person", text: text.replace("{company}", p.company.name) });
    const base = { simulated: true, providerCallId: `sim-${hashOf(p.id + p.attempts).toString(36)}` };
    switch (scenario) {
      case "no_answer":
        return { ...base, connected: false, reached: "none", outcome: "no_answer", transcript: [] };
      case "receptionist": {
        const [a, b, c] = PERSON.receptionist;
        return { ...base, connected: true, reached: "receptionist", outcome: "referred", referredTo: "email",
          transcript: [hear(a), say(plan.receptionist), hear(b), say("Thank you, I'll do that. Have a good day."), hear(c)] };
      }
      case "receptionist_transfer":
      case "interested_book": {
        const t: TranscriptLine[] = [];
        if (scenario === "receptionist_transfer") t.push(hear(PERSON.receptionist[0]), say(plan.receptionist), hear("One moment, I'll connect you to our manager."));
        const lines = PERSON.interested;
        t.push(hear(lines[0]), say(`${plan.opening} ${plan.permission}`), hear(lines[1]), say(`${plan.problem} ${plan.howWeHelp} ${plan.questions[0] || ""}`), hear(lines[2]));
        if (plan.questions[1]) t.push(say(plan.questions[1]), hear(lines[3]));
        if (!slots.length) {
          t.push(say(plan.demoInvite), hear(lines[4]), say("Thank you! Our team will message you with a demo time shortly."));
          return { ...base, connected: true, reached: "decision_maker", outcome: "interested", acceptedSlot: null, transcript: t,
            qualification: { [plan.questions[0] || "q1"]: lines[2], [plan.questions[1] || "q2"]: lines[3] } };
        }
        t.push(say(plan.demoInvite), hear(lines[4]), say(`I can offer ${slots.slice(0, 2).map((s) => s.label).join(" or ")}. Which works?`), hear(lines[5]), say(`Done — ${slots[0].label}. You'll get a confirmation. Thank you!`));
        return { ...base, connected: true, reached: "decision_maker", outcome: "interested", acceptedSlot: 0, transcript: t,
          qualification: { [plan.questions[0] || "q1"]: lines[2], [plan.questions[1] || "q2"]: lines[3] } };
      }
      case "callback": {
        const [a, b, c] = PERSON.callback;
        const at = new Date((now || new Date()).getTime() + 86400_000); at.setUTCHours(9, 30, 0, 0); // ~3pm IST next day
        return { ...base, connected: true, reached: "decision_maker", outcome: "callback", callbackAt: at.toISOString(),
          transcript: [hear(a), say(`${plan.opening} ${plan.permission}`), hear(b), say("Of course, I'll call tomorrow around 3pm."), hear(c)] };
      }
      case "decline": {
        const [a, b, c] = PERSON.decline;
        return { ...base, connected: true, reached: "decision_maker", outcome: "not_interested", objections: ["Already handles calls"],
          transcript: [hear(a), say(`${plan.opening} ${plan.permission}`), hear(b), say(`${plan.problem} ${plan.howWeHelp}`), hear(c), say(plan.objections.find((o) => /not interested|interest/i.test(o.objection))?.reply || "Understood, thank you.")] };
      }
      case "opt_out": {
        const [a, b] = PERSON.opt_out;
        const t = [hear(a), say(`${plan.opening}`), hear(b), say("Understood. I've removed your number and we won't call again. Sorry for the trouble.")];
        // The outcome comes from the words, exactly as a live call would be judged.
        const said = t.filter((x) => x.who === "person").map((x) => x.text).join(" ");
        return { ...base, connected: true, reached: "decision_maker", outcome: optOutPhrase(said) ? "opted_out" : "not_interested", transcript: t };
      }
    }
  }
}

export type PlaceCall = (input: { phone: string; variables: Record<string, string>; metadata: Record<string, string> }) => Promise<{ attemptId: string }>;

/** RANA's existing Sarvam outbound calls. The result arrives later by webhook, so the call is "pending" here. */
export class SarvamLiveVoice implements VoiceAdapter {
  id = "sarvam";
  live = true;
  constructor(private place: PlaceCall | null, private reason: string | null) {}
  notReady() { return this.place ? null : this.reason || "Sarvam calling isn't configured."; }
  async call({ prospect: p, plan, phone, slots }: CallInput): Promise<CallResult> {
    if (!this.place) throw new Error(this.notReady()!);
    const r = await this.place({
      phone,
      variables: {
        company: p.company.name, opening: plan.opening, problem: plan.problem, how_we_help: plan.howWeHelp,
        questions: plan.questions.join(" | "), demo_slots: slots.map((s) => s.label).join(" | "), language: plan.language,
      },
      metadata: { rana_source: "sales_engine", se_prospect_id: p.id, se_campaign_id: p.campaignId },
    });
    return { simulated: false, connected: false, reached: "none", outcome: "pending", transcript: [], providerCallId: r.attemptId };
  }
}
