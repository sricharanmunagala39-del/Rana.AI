// "Talk to Rana" and "Instant demo" on the website — the parts the browser needs (labels, briefs, sample calls).
// The prompts the voice agent follows live server-side in lib/webTalk.ts.

export type DemoKey = "qualify" | "sales" | "support" | "booking" | "followup";
export type TalkLang = "en" | "hi" | "te" | "ta" | "kn";

export const TALK_LANGS: { code: TalkLang; label: string }[] = [
  { code: "en", label: "English" }, { code: "hi", label: "हिन्दी" }, { code: "te", label: "తెలుగు" }, { code: "ta", label: "தமிழ்" }, { code: "kn", label: "ಕನ್ನಡ" },
];
/** Demo scenarios are written for these languages (the talk concierge also speaks Kannada). */
export const DEMO_LANGS: TalkLang[] = ["en", "hi", "te", "ta"];

export const TALK_MAX_S = 300;
export const DEMO_MAX_S = 90;

export type Scenario = {
  key: DemoKey; icon: string; title: string; line: string;
  /** Who starts the call: "out" = Rana calls them, "in" = they call the business. */
  dir: "in" | "out";
  business: string; ranaPlays: string; youPlay: string; tryThis: string[];
  sample: { who: "ai" | "caller"; text: string }[]; outcome: string;
  /** What the live CRM card learns during the sample call: shown once line `at` has been spoken. */
  card: { at: number; label: string; value: string }[];
};

export const SCENARIOS: Scenario[] = [
  {
    key: "qualify", dir: "out", icon: "🎯", title: "Lead qualification", line: "Calls a new enquiry in minutes and finds out if they're ready to buy.",
    business: "Skyline Homes — a real-estate developer", ranaPlays: "Calls you back 2 minutes after you enquired about a 3BHK flat.",
    youPlay: "A home buyer. Share (or dodge) your budget, timeline and whether you need a loan.",
    tryThis: ["Say your budget is flexible", "Ask if there's a loan option", "Ask for a site visit this weekend"],
    sample: [
      { who: "ai", text: "Hi, this is Rana from Skyline Homes — you just asked about our 3BHK flats. Is now a good time for two minutes?" },
      { who: "caller", text: "Yes, go ahead. What's the price range?" },
      { who: "ai", text: "The 3BHKs start at 1.2 crore. Roughly what budget do you have in mind, and are you planning a home loan?" },
      { who: "caller", text: "Around 1.3, and yes, a loan." },
      { who: "ai", text: "That fits well. When are you hoping to move — this year or next?" },
      { who: "caller", text: "In about six months." },
      { who: "ai", text: "Perfect. Shall I book a site visit — Saturday 11 AM or Sunday 4 PM?" },
      { who: "caller", text: "Saturday 11 works." },
    ],
    outcome: "HOT LEAD · budget ₹1.3 Cr · loan · 6 months · site visit Sat 11 AM → sent to sales",
    card: [{ at: 1, label: "Interest", value: "3BHK flat" }, { at: 3, label: "Budget", value: "₹1.3 Cr" }, { at: 3, label: "Home loan", value: "Yes" }, { at: 5, label: "Timeline", value: "~6 months" }, { at: 7, label: "Site visit", value: "Sat 11 AM" }],
  },
  {
    key: "sales", dir: "out", icon: "📞", title: "Outbound sales", line: "Dials your lead list, pitches, handles objections and books the next step.",
    business: "BrightPath Academy — a coaching institute", ranaPlays: "Calls a parent about a new weekend batch and its early-bird offer.",
    youPlay: "A busy, price-conscious parent. Push back on fees or say you'll think about it.",
    tryThis: ["Say the fees are too high", "Ask about weekend timings", "Say “call me later”"],
    sample: [
      { who: "ai", text: "Hello, this is Rana from BrightPath Academy. You'd asked about coaching for your son — can I share our new weekend batch?" },
      { who: "caller", text: "Okay, but your fees were quite high." },
      { who: "ai", text: "I understand. This batch has an early-bird discount and an EMI option, so it works out to a small monthly amount." },
      { who: "caller", text: "Hmm. What are the timings?" },
      { who: "ai", text: "Saturday and Sunday, 10 to 1. Would you like a free demo class this Sunday first?" },
      { who: "caller", text: "Yes, let's try the demo." },
    ],
    outcome: "WARM → HOT · objection: fees (EMI offered) · demo class Sunday 10 AM → sent to counsellor",
    card: [{ at: 1, label: "Objection", value: "Fees too high" }, { at: 2, label: "Offer", value: "Early-bird + EMI" }, { at: 3, label: "Asked", value: "Weekend timings" }, { at: 5, label: "Next step", value: "Free demo, Sun 10 AM" }],
  },
  {
    key: "support", dir: "in", icon: "☎️", title: "Inbound support", line: "Answers every customer call, solves the common ones and hands the rest to your team.",
    business: "QuickKart — an online store", ranaPlays: "Answers the support line, 24×7.",
    youPlay: "A customer whose order hasn't arrived — a little annoyed. Maybe ask for a return too.",
    tryThis: ["Say your order is late", "Ask to return an item", "Ask to speak to a person"],
    sample: [
      { who: "caller", text: "My order was supposed to come yesterday and it's still not here!" },
      { who: "ai", text: "I'm sorry about that. Can you tell me the order number or the phone number you ordered with?" },
      { who: "caller", text: "It's on this number." },
      { who: "ai", text: "Thanks — I've flagged it as delayed and asked the delivery team to call you today with a time." },
      { who: "caller", text: "And if it's still late, I want a refund." },
      { who: "ai", text: "Understood — I've noted that. If it isn't delivered by tomorrow, our team will process the refund." },
    ],
    outcome: "COMPLAINT · late delivery · refund if not delivered tomorrow → sent to support team",
    card: [{ at: 0, label: "Issue", value: "Order late" }, { at: 2, label: "Order", value: "Found by phone" }, { at: 3, label: "Action", value: "Delivery call today" }, { at: 4, label: "Ask", value: "Refund if late" }, { at: 5, label: "Promise", value: "Refund after tomorrow" }],
  },
  {
    key: "booking", dir: "in", icon: "📅", title: "Appointment booking", line: "Books, reschedules and confirms appointments — even at 11 PM.",
    business: "Smile Dental Clinic", ranaPlays: "The clinic's receptionist.",
    youPlay: "A patient who wants a check-up this week. Ask for a slot, change your mind, ask the fee.",
    tryThis: ["Ask for tomorrow evening", "Ask the consultation fee", "Change the time once"],
    sample: [
      { who: "caller", text: "Hi, I'd like a dental check-up this week." },
      { who: "ai", text: "Of course! We have Thursday at 5 PM or Friday at 11 AM. Which suits you?" },
      { who: "caller", text: "Thursday 5. What's the fee?" },
      { who: "ai", text: "The consultation is 500 rupees. Can I have your name for the booking?" },
      { who: "caller", text: "Ananya Rao." },
      { who: "ai", text: "Done, Ananya — Thursday at 5 PM. You'll get a reminder the day before." },
    ],
    outcome: "APPOINTMENT · Thu 5 PM · Ananya Rao → added for the front desk",
    card: [{ at: 0, label: "Needs", value: "Dental check-up" }, { at: 2, label: "Slot", value: "Thu 5 PM" }, { at: 3, label: "Fee told", value: "₹500" }, { at: 4, label: "Patient", value: "Ananya Rao" }, { at: 5, label: "Reminder", value: "Day before" }],
  },
  {
    key: "followup", dir: "out", icon: "💬", title: "Customer follow-up", line: "Follows up every lead and customer so nobody goes cold.",
    business: "FitLife Gym", ranaPlays: "Follows up with you after your free trial session last week.",
    youPlay: "Someone who liked the trial but hasn't joined. Be undecided — or say it's too far.",
    tryThis: ["Say you're still deciding", "Ask about a monthly plan", "Say it's too far from home"],
    sample: [
      { who: "ai", text: "Hi, this is Rana from FitLife. You tried a session with us last week — how did you find it?" },
      { who: "caller", text: "It was good, but I haven't decided." },
      { who: "ai", text: "That's fair. What's holding you back — the timing, the price, or something else?" },
      { who: "caller", text: "Mostly the price." },
      { who: "ai", text: "We have a monthly plan with no joining fee this week. Shall I ask the manager to call you with the details?" },
      { who: "caller", text: "Sure, tomorrow evening." },
    ],
    outcome: "RE-ENGAGED · objection: price · manager callback tomorrow evening → sent to sales",
    card: [{ at: 1, label: "Trial", value: "Liked it" }, { at: 3, label: "Objection", value: "Price" }, { at: 4, label: "Offer", value: "Monthly, no joining fee" }, { at: 5, label: "Next step", value: "Callback tomorrow eve" }],
  },
];

export const scenarioOf = (k: string) => SCENARIOS.find((s) => s.key === k) || SCENARIOS[0];

/** Voices for the sample calls (Rana → the business's voice; the customer → a second voice). Same on the site, the reel studio and the audio cache. */
export const SAMPLE_VOICES: Record<DemoKey, { ai: string; caller: string }> = {
  qualify: { ai: "priya", caller: "rahul" }, sales: { ai: "shreya", caller: "kavya" }, support: { ai: "priya", caller: "aditya" },
  booking: { ai: "priya", caller: "kavya" }, followup: { ai: "shreya", caller: "rahul" },
};
export const sampleText = (t: string) => t.replace(/\s+/g, " ").trim().slice(0, 240);
