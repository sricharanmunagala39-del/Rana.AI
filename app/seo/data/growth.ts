// Second wave of top-level pages, aimed at what actually ranks in Google India for our keywords (checked 30 Sept 2026):
// buyer's guides ("best … in India"), "<competitor> alternative" pages, and city + industry pages.
// Rule for competitor facts: only what their own public pricing pages say (see `sources`), dated with `checked`.
import type { SeoPageData } from "../types";
import { CORE_FEATURES, TRUST_FAQS, TRIAL_LINE, ENTRY_LINE, LANGS_SENTENCE, inr } from "./shared";
import { PLANS } from "@/lib/pricing";

const CHECKED = "30 September 2026";
const SRC = {
  vapi: { label: "Vapi pricing", url: "https://vapi.ai/pricing" },
  retell: { label: "Retell AI pricing", url: "https://www.retellai.com/pricing" },
  bland: { label: "Bland AI pricing", url: "https://www.bland.ai/pricing" },
  bolna: { label: "Bolna pricing", url: "https://www.bolna.ai/pricing" },
  trai: { label: "TRAI — Telecom Commercial Communications Customer Preference Regulations", url: "https://www.trai.gov.in/" },
};
const PRICE = {
  vapi: "$0.05/min platform fee plus pass-through costs for speech, model, voice and telephony",
  retell: "Pay-as-you-go; about $0.07–0.31/min depending on model and voice, plus numbers and add-ons",
  bland: "From $0.14/min (Start), or $0.12/min with a $299/month platform fee (Build)",
  bolna: "Pay-as-you-go credits, listed at about 6¢ (≈₹5.5) per minute standard",
  rana: `${inr(PLANS.launch.pricePerMonth!)}–${inr(PLANS.scale.pricePerMonth!)}/month with minutes included, in ₹ with GST invoice`,
};
const ALT_RELATED = ["/best-ai-voice-agents-india", "/vapi-alternative-india", "/retell-ai-alternative", "/bland-ai-alternative", "/compare/rana-ai-vs-bolna", "/pricing"];

/** "<Competitor> alternative" pages — same honest structure as /vapi-alternative-india. */
function alternative(name: string, slug: string, src: { label: string; url: string }, price: string, whoFor: string, betterFor: string[], extraFaq: { q: string; a: string }[] = []): SeoPageData {
  const path = `/${slug}-alternative`;
  return {
    path, kind: "compare", label: `${name} alternative`,
    title: `${name} Alternative for India — AI Calling in INR`,
    description: `Looking for a ${name} alternative in India? RANA AI is a ready-made AI calling agent in Telugu, Hindi, Tamil and 8 more Indian languages, billed in rupees, set up for you.`,
    h1: `A ${name} alternative built for Indian businesses`,
    eyebrow: `${name} alternative · India`,
    intro: `${name} is ${whoFor}. It's a good product — if it fits how you work. Most Indian businesses searching for a ${name} alternative want something different: an AI calling agent that speaks their customers' languages, runs on an Indian number, is billed in rupees, and is set up for them rather than built by a developer. That is what RANA AI is. Here's an honest side-by-side, using ${name}'s own public pricing as of ${CHECKED}.`,
    keywords: [`${name.toLowerCase()} alternative`, `${name.toLowerCase()} alternative india`, `${name.toLowerCase()} alternatives`, `${name.toLowerCase()} india`, `${name.toLowerCase()} competitor`, `${name.toLowerCase()} pricing`, `cheaper than ${name.toLowerCase()}`],
    facts: ["Indian languages built in", "₹ billing + GST invoice", "Done-for-you setup", TRIAL_LINE],
    checked: CHECKED,
    sources: [src],
    demo: "qualify",
    sections: [
      { h2: `${name} vs RANA AI at a glance`, table: { head: ["", name, "RANA AI"], rows: [
        ["Built for", "Developers and product teams", "Business owners, sales and front-desk teams"],
        ["Pricing (public)", price, PRICE.rana],
        ["What the price covers", "Varies — check which of speech, model, voice and telephony are extra", "Voice engines, dashboard, lead scoring and support in one plan"],
        ["Setup", "You build prompts, tools, telephony and integrations", "Done for you; edit in plain language after"],
        ["Indian languages", "Depends on the providers you configure", "Telugu, Hindi, Tamil, Kannada, Malayalam, Marathi, Bengali, Gujarati, Punjabi, Odia + English"],
        ["Indian phone number", "Bring or configure your own", "Included on Growth and above; add-on on Starter"],
        ["Lead cards and WhatsApp alerts", "Build on their API", "Included, no code"],
        ["Support", "Docs and support tiers", "Our team in Hyderabad sets it up with you"],
      ], note: `${name} details from ${src.url} on ${CHECKED}. Prices change — always check their site.` } },
      { h2: `When ${name} is the better choice`, bullets: betterFor },
      { h2: "When RANA AI is the better choice", bullets: ["You want an AI calling agent working on your number this week, not a build project", "Your callers speak Telugu, Hindi, Tamil or another Indian language — often mixed with English", "You want one monthly plan in rupees with a GST invoice, not a dollar bill that changes with every provider", "You want lead scoring, recordings, transcripts and WhatsApp lead alerts on day one", "You want people who help you write and improve the script"] },
      { h2: "Compare the total monthly cost", body: `Per-minute headline rates are hard to compare. Some platforms charge a platform fee and pass through speech-to-text, the language model, the voice and telephony separately; some bundle them. Then add the developer time to build and maintain the agent, and currency conversion.\n\nA fair test: take one real month — say 1,000 minutes of calls — and add up every line for each option, including people. RANA AI's Starter plan is ${inr(PLANS.starter.pricePerMonth!)}/month for ${PLANS.starter.minutes.toLocaleString("en-IN")} minutes, voice engines included; ${ENTRY_LINE.toLowerCase()}.` },
      { h2: "Switching is simple", steps: [`Send us your current ${name} prompt and call flow (or just describe your calls).`, "We rebuild it as a RANA AI employee in your languages.", "You call it from your browser and compare side by side.", "Point your number to RANA when you're happy."] },
    ],
    faqs: [
      { q: `Is RANA AI built on ${name}?`, a: "No. RANA AI runs its own platform with two voice engines, R1 and R2, tuned for Indian languages and Indian phone numbers." },
      { q: `Is RANA AI cheaper than ${name}?`, a: `It depends on your volume and on what you count. ${name}'s headline rate may not include everything; RANA's plans include the voice engines, dashboard and setup help. Add up one real month of calls for both and compare.` },
      ...extraFaq,
      ...TRUST_FAQS.slice(0, 1),
    ],
    related: ALT_RELATED.filter((p) => p !== path),
  };
}

export const GROWTH: SeoPageData[] = [
  // ---- Buyer's guide: the "best … in India" list pages are what Google ranks for "ai calling agent india".
  {
    path: "/best-ai-voice-agents-india", kind: "compare", label: "Best AI voice agents in India",
    title: "Best AI Voice Agents in India (2026) — Honest Guide",
    description: "The best AI voice agents and AI calling agents in India for 2026 compared: RANA AI, Bolna, Vapi, Retell AI and Bland AI — pricing in ₹ and $, Indian languages, setup, and who each is for.",
    h1: "Best AI voice agents in India (2026): an honest buyer's guide",
    eyebrow: "Buyer's guide · Updated 30 Sept 2026",
    intro: "We make RANA AI, so read this knowing that — but we've tried to write the guide we'd want if we were buying. The right AI voice agent depends mostly on one question: are you a developer building a voice product, or a business that wants its calls answered and its leads called? Below are five platforms Indian businesses most often compare, with prices taken from each company's own pricing page, and a plain-language checklist to choose.",
    keywords: ["best ai voice agent india", "best ai calling agent india", "ai voice agents in india", "top ai voice agents india 2026", "ai calling agent india", "voice ai companies india", "best ai voice agent", "ai voice agent india"],
    facts: ["5 platforms compared", "Prices from their own sites", `Checked ${CHECKED}`],
    checked: CHECKED,
    sources: [SRC.vapi, SRC.retell, SRC.bland, SRC.bolna],
    demo: "qualify",
    sections: [
      { h2: "Quick comparison", table: { head: ["Platform", "Best for", "Public pricing", "Indian languages", "Setup"], rows: [
        ["RANA AI (ours)", "Indian businesses that want a ready AI calling employee", PRICE.rana, "11 Indian languages + English built in, switches mid-call", "Done for you"],
        ["Bolna", "Developers and agencies building agents in India", PRICE.bolna, "Via the speech and voice providers you choose", "You build"],
        ["Vapi", "Developers building voice products worldwide", PRICE.vapi, "Via the providers you plug in", "You build"],
        ["Retell AI", "Engineering teams wanting a well-documented API", PRICE.retell, "Via the providers you configure", "You build"],
        ["Bland AI", "Very high-volume outbound, mostly US", PRICE.bland, "Check with Bland for your languages", "You build / enterprise"],
      ], note: `Prices from each company's public pricing page on ${CHECKED}. They change often — check before you buy.` } },
      { h2: "1. RANA AI — best for Indian businesses that want it done for them", body: `RANA AI is a finished AI calling employee rather than a toolkit. We set it up with your script, prices and FAQs; it answers your inbound calls and dials your leads in ${LANGS_SENTENCE}. Every call comes with a recording, transcript, hot/warm/cold score and a lead card on WhatsApp. Plans are monthly in rupees with a GST invoice.\n\nChoose it if you run a clinic, real-estate firm, coaching institute, D2C brand or any business where the phone is how you sell. Skip it if you're a developer who wants to build your own voice product — a developer platform will give you more control.` },
      { h2: "2. Bolna — best Indian developer platform", body: "Bolna is an Indian platform for building voice agents, popular with developers and agencies. You assemble the agent — prompts, providers, telephony — and can bring your own keys. It's a good fit if you have technical people and want to build and host agents for yourself or clients." },
      { h2: "3. Vapi — best for developers who want full control", body: "Vapi is a widely used developer platform for voice agents. You choose and swap every model and provider, and pay a platform fee plus the costs of those providers. It's the right tool if you're building a voice product and have engineers; for a business that just needs calls handled it's usually more than you need." },
      { h2: "4. Retell AI — best documented voice-agent API", body: "Retell AI offers a clean API and dashboard for building voice agents, priced per minute depending on the model and voice. Strong for engineering teams serving mostly English-speaking callers." },
      { h2: "5. Bland AI — best for very large outbound volumes", body: "Bland AI focuses on high-volume phone automation with an all-in per-minute rate in dollars and enterprise options. Best for large US-centric outbound programmes with developers to integrate it." },
      { h2: "How to choose: 7 questions to ask any vendor", steps: [
        "Can I hear it on a real call in my customers' language — including mixed Telugu–English or Hindi–English?",
        "What exactly is included in the per-minute or monthly price: speech, voice, model, telephony, numbers, support?",
        "Will it run on an Indian number, and can inbound calls on my existing number be forwarded to it?",
        "Who builds and maintains the script — me, my developer, or the vendor?",
        "What do I get after each call: recording, transcript, lead score, CRM/WhatsApp push?",
        "How does it follow TRAI rules for promotional calls (consent, DND, registered headers, calling hours)?",
        "Is billing in rupees with a GST invoice, and can I cancel monthly?",
      ] },
      { h2: "Our honest recommendation", body: "If you're a developer, shortlist a developer platform (Bolna if you're India-focused, Vapi or Retell for global) and build. If you're a business, don't start a build project — get a ready AI calling agent, test it on your own calls for two weeks, and judge it on booked appointments and qualified leads, not on voice demos." },
    ],
    faqs: [
      { q: "Which is the best AI voice agent in India?", a: "For developers, a platform like Bolna, Vapi or Retell AI. For businesses that want calls answered and leads called without building anything, a ready AI calling agent like RANA AI — set up for you, in Indian languages, billed in rupees." },
      { q: "Which AI voice agent supports Telugu, Hindi and Tamil?", a: "RANA AI has 11 Indian languages built in and switches when the caller does. Developer platforms support Indian languages through the speech and voice providers you plug in — test them on real calls in your language." },
      { q: "How much does an AI calling agent cost in India?", a: `Developer platforms charge per minute (often in dollars) plus provider costs. RANA AI plans start at ${inr(PLANS.launch.pricePerMonth!)}/month with minutes included. See the pricing page for every plan.` },
      ...TRUST_FAQS.slice(0, 1),
    ],
    related: ["/vapi-alternative-india", "/retell-ai-alternative", "/bland-ai-alternative", "/compare/rana-ai-vs-bolna", "/ai-calling-agent", "/pricing"],
  },

  alternative("Retell AI", "retell-ai", SRC.retell, PRICE.retell, "a developer platform with a well-documented API for building voice agents", ["You have engineers and want to build on a voice-agent API", "Your callers are mostly English-speaking, in the US or Europe", "You want to choose your own language model per agent"]),
  alternative("Bland AI", "bland-ai", SRC.bland, PRICE.bland, "a phone-automation platform for large, mostly US-based outbound programmes", ["You run very large outbound volumes in the US", "You want an all-in per-minute dollar rate and have developers to integrate it", "You need enterprise contracts with dedicated infrastructure"]),

  // ---- Keyword pages we didn't have yet.
  {
    path: "/ai-voice-calling", kind: "solution", label: "AI voice calling",
    title: "AI Voice Calling for Business in India",
    description: "AI voice calling for Indian businesses: automated calls that talk like a person in Telugu, Hindi, Tamil and 8 more languages — lead follow-up, reminders, confirmations and inbound answering.",
    h1: "AI voice calling that sounds like your best team member",
    eyebrow: "AI voice calling · India",
    intro: "AI voice calling means real two-way phone conversations run by an AI — not a recorded message, not 'press 1'. The AI listens, understands, answers and asks the next question, in the caller's language. For Indian businesses it replaces robocalls, IVR menus and much of the repetitive dialling your team does every day.",
    keywords: ["ai voice calling", "ai voice call", "ai voice calling software", "ai voice calling india", "automated voice calls", "ai voice call for business", "voice ai calling"],
    facts: ["Two-way conversations", "11 Indian languages", "Inbound + outbound", TRIAL_LINE],
    demo: "sales",
    sections: [
      { h2: "AI voice calling vs robocalls and IVR", table: { head: ["", "Robocall / voice broadcast", "IVR", "AI voice calling"], rows: [
        ["Conversation", "One-way recording", "Menu + key presses", "Two-way, natural speech"],
        ["Answers questions", "No", "Only pre-recorded", "Yes, from your information"],
        ["Languages", "One recording per language", "One or two menus", "Follows the caller, 11 Indian languages"],
        ["Result", "Played / not played", "Key pressed", "Transcript, intent, lead score, next step"],
      ] } },
      { h2: "What businesses use AI voice calling for", bullets: [
        "Calling every new lead within a minute of the enquiry and qualifying them",
        "Appointment, EMI, fee, renewal and payment reminders that can answer questions",
        "COD order confirmation before dispatch",
        "Re-engaging old and cold leads with a real conversation",
        "Feedback and NPS calls after a visit or delivery",
        "Answering inbound calls 24×7 when your team is busy or offline",
      ] },
      { h2: "What you get from every call", bullets: CORE_FEATURES.slice(3) },
      { h2: "Getting started in a week", steps: ["Pick a use case — lead follow-up is the usual first win.", "We write the call script with you and set your languages.", "You test it by talking to it in your browser.", "Upload a list or connect your lead source, and go live."] },
    ],
    faqs: [
      { q: "Is AI voice calling allowed in India?", a: "Yes, within TRAI's rules. Promotional calls need consent or non-DND numbers, registered headers and permitted hours; service and transactional calls have separate rules. RANA respects your do-not-call list and calling hours — see our TRAI DLT guide, and confirm your case with your telecom provider." },
      { q: "Does AI voice calling sound robotic?", a: "Modern AI voices sound natural, with pauses and the ability to be interrupted. The best test is to talk to it yourself — tap 'Talk to Rana' on our homepage." },
      ...TRUST_FAQS,
    ],
    related: ["/ai-calling-agent", "/ai-telecaller", "/compare/ai-voice-agent-vs-ivr", "/glossary/voice-bot", "/pricing"],
  },
  {
    path: "/telecaller-software", kind: "solution", label: "Telecaller software",
    title: "Telecaller Software with an AI Calling Agent",
    description: "Telecaller software for Indian teams where an AI calling agent does the dialling, first contact and follow-ups — and your telecallers get only hot, qualified leads. Recordings, scores, WhatsApp alerts.",
    h1: "Telecaller software where the AI makes the first call",
    eyebrow: "Telecaller software · India",
    intro: "Most telecaller software makes human dialling faster: a list, a dial button, a disposition dropdown. That still leaves your team spending the day on unanswered calls, wrong numbers and 'call me later'. RANA flips it: an AI calling agent dials the list, has the first conversation, qualifies and schedules — and your telecallers only call back the people who are ready.",
    keywords: ["telecaller software", "telecalling software", "telecaller app", "telecalling crm", "ai telecaller software", "auto dialer software india", "telecalling software india"],
    facts: ["AI dials, humans close", "Lead scores + transcripts", "WhatsApp hand-off", TRIAL_LINE],
    demo: "qualify",
    sections: [
      { h2: "Traditional telecaller software vs AI-first", table: { head: ["", "Dialer / telecalling CRM", "RANA AI calling agent"], rows: [
        ["Who dials", "Your telecallers", "The AI — several calls at once"],
        ["Unanswered and wrong numbers", "Your team's time", "Handled and retried automatically"],
        ["First conversation", "Telecaller reads a script", "AI has it in the lead's language"],
        ["Notes and disposition", "Typed manually (often skipped)", "Transcript, summary and score for every call"],
        ["Hours", "Shift hours", "24×7 within calling-hour rules"],
        ["Telecaller's day", "Mostly dialling", "Only hot leads and closing"],
      ] } },
      { h2: "What's included", bullets: [
        "Bulk calling campaigns from a CSV or your lead source, with retries",
        "Hot / warm / cold scoring with a one-line reason for every lead",
        "Call recordings, transcripts and searchable history",
        "Instant hand-off: hot leads land on your team's WhatsApp, Slack or email with the full summary",
        "Mission control: a live view of calls in progress and results today",
        "Do-not-call list and calling-hour controls",
      ] },
      { h2: "Do you still need a dialer?", body: "If your team makes most of its money in long human conversations — negotiation, closing, relationships — keep them on the phone, but let the AI do the work before that: first contact, qualification, reminders, and re-engaging old leads. Many teams find that a smaller team with an AI calling agent in front closes more than a large team dialling cold." },
    ],
    faqs: [
      { q: "Can my telecallers see what the AI said?", a: "Yes — every call has a recording, transcript and summary, so a telecaller calling back knows exactly what the lead asked and where the conversation stopped." },
      { q: "Does it replace my CRM?", a: "No. It sends each lead card to your CRM through a webhook (or to WhatsApp, Slack and email). Many teams use it with their existing CRM." },
      ...TRUST_FAQS,
    ],
    related: ["/ai-telecaller", "/compare/ai-vs-human-telecaller", "/tools/ai-calling-cost-calculator", "/blog/telecaller-vs-ai-calling-cost-india", "/pricing"],
  },
  {
    path: "/ai-receptionist-for-doctors", kind: "solution", label: "AI receptionist for doctors",
    title: "AI Receptionist for Doctors — Never Miss a Patient",
    description: "An AI receptionist for doctors in private practice: answers patient calls during OPD, books and reminds appointments, shares fees and timings — in Telugu, Hindi, Tamil and English.",
    h1: "An AI receptionist for doctors — so the phone stops interrupting OPD",
    eyebrow: "AI receptionist · Doctors",
    intro: "In a private practice the phone rings most exactly when you're busiest — during OPD. Your assistant is registering walk-ins, and calls go unanswered. An AI receptionist picks up every call, tells patients your timings and fee, books them into a slot, and reminds them the day before — while you and your staff focus on the patients in the room.",
    keywords: ["ai receptionist for doctors", "ai receptionist for doctor", "doctor appointment booking ai", "virtual receptionist for doctors india", "ai assistant for doctors clinic", "ai receptionist for clinic"],
    facts: ["Answers during OPD", "Books + reminds", "Patient's language", TRIAL_LINE],
    demo: "booking",
    sections: [
      { h2: "What it handles for your practice", bullets: [
        "Answers every patient call, several at once — no engaged tone during OPD",
        "Shares consultation fees, OPD timings, location and parking from your own information",
        "Books, reschedules and cancels appointments; confirms with a reminder call the day before",
        "Takes follow-up and report enquiries and passes them to your staff with the patient's details",
        "Speaks Telugu, Hindi, Tamil, Kannada, English and more — and switches when the patient does",
        "Set up not to give medical advice: questions about symptoms or emergencies go to your staff, with your emergency number",
      ] },
      { h2: "A typical patient call", call: [
        { who: "caller", text: "Namaste, is doctor sitting today evening?" },
        { who: "ai", text: "Namaste! Dr. Sharma's evening OPD is 6 to 9 PM today. Would you like a token?" },
        { who: "caller", text: "Yes, around 7. What is the fee?" },
        { who: "ai", text: "The consultation fee is ₹600. I have 7:10 PM free — may I have the patient's name?" },
        { who: "caller", text: "Lakshmi." },
        { who: "ai", text: "Booked for Lakshmi at 7:10 PM today. Please come ten minutes early for registration." },
      ] },
      { h2: "Why it matters for a single-doctor practice", body: "A solo or small practice can't staff the phone all day. Missed calls become patients who book elsewhere, and no-shows leave empty slots. An AI receptionist answers every call, fills your schedule and cuts no-shows with reminder calls — for less than the cost of an extra staff member." },
    ],
    faqs: [
      { q: "Will it give medical advice?", a: "No — we set it up to handle appointments, fees, timings and logistics only. For symptoms, medicines or emergencies it tells the patient to speak to the doctor or call your emergency number, and alerts your staff." },
      { q: "Where are call recordings kept?", a: "Recordings and transcripts are stored in your RANA AI account for your team to review. See our privacy policy for how data is handled." },
      ...TRUST_FAQS,
    ],
    related: ["/ai-receptionist-for-clinics", "/ai-receptionist-for-hospitals-hyderabad", "/industries/clinics-hospitals", "/industries/dental-clinics", "/blog/ai-receptionist-for-clinics-india"],
  },

//@@SPLIT@@
