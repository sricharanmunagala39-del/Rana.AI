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

  // ---- City + industry: Google ranks these for local searches (e.g. "ai receptionist hospitals hyderabad").
  {
    path: "/ai-receptionist-for-hospitals-hyderabad", kind: "city", label: "AI receptionist for hospitals in Hyderabad",
    title: "AI Receptionist for Hospitals & Clinics in Hyderabad",
    description: "AI receptionist for Hyderabad hospitals and clinics: answers every patient call in Telugu, Hindi and English, books OPD appointments, sends reminders. Built in Hyderabad.",
    h1: "AI receptionist for hospitals and clinics in Hyderabad",
    eyebrow: "Hyderabad · Hospitals & clinics",
    intro: "Hyderabad's hospitals and clinics take calls in Telugu, Hindi, Dakhni and English — often all in one call. RANA AI is built in Hyderabad and its AI receptionist is tuned for exactly that: it answers every patient call, books OPD slots, shares doctor timings and fees, and reminds patients the day before, from Banjara Hills to Kukatpally to LB Nagar.",
    keywords: ["ai receptionist hyderabad", "ai receptionist for hospitals hyderabad", "ai receptionist for clinics hyderabad", "hospital call answering hyderabad", "ai voice agent for hospitals hyderabad", "clinic appointment booking hyderabad"],
    facts: ["Telugu · Hindi · English", "OPD booking + reminders", "Local team in Hyderabad", TRIAL_LINE],
    demo: "booking",
    sections: [
      { h2: "What it does for a Hyderabad hospital", bullets: [
        "Answers every call to your front desk or helpline — several at once, 24×7",
        "Tells patients which doctor sits when, in which department, and the consultation fee",
        "Books, reschedules and cancels OPD appointments and health-check packages",
        "Reminder calls the evening before to cut no-shows",
        "Handles report-status and insurance/cashless enquiries by taking details for your team",
        "Set up to pass emergencies straight to your emergency number and alert staff",
      ] },
      { h2: "Built for how Hyderabad talks", body: "A caller from Old City might start in Dakhni Hindi, a caller from Kukatpally in Telugu, an IT professional from Gachibowli in English — and many switch mid-sentence. RANA's AI receptionist follows the caller into their language instead of forcing a menu choice, which is why patients stay on the line." },
      { h2: "Typical results to measure", bullets: ["Share of calls answered (aim for all of them)", "Appointments booked by phone per day", "No-show rate before and after reminder calls", "Front-desk time freed for walk-in patients"] },
      { h2: "Getting started", steps: ["Share your departments, doctors, OPD timings and fees.", "We set up your AI receptionist in Telugu, Hindi and English.", "Your team tests it by calling it — we adjust until it sounds right.", "Forward your front-desk number and go live. We're in Hyderabad if you want to meet."] },
    ],
    faqs: [
      { q: "Can we meet your team?", a: "Yes — RANA AI is based in Hyderabad. Book a demo and we can meet at your hospital or on a video call." },
      { q: "Does it work with our existing hospital number?", a: "Yes. Forward calls from your existing number (all calls, or only when busy / after hours) to your AI receptionist." },
      ...TRUST_FAQS.slice(1),
    ],
    related: ["/ai-receptionist-for-clinics", "/ai-receptionist-for-doctors", "/ai-voice-agent-hyderabad", "/telugu-ai-voice-agent", "/industries/clinics-hospitals"],
  },
  {
    path: "/ai-calling-for-real-estate-hyderabad", kind: "city", label: "AI calling for real estate in Hyderabad",
    title: "AI Calling Agent for Real Estate in Hyderabad",
    description: "AI calling agent for Hyderabad builders and channel partners: calls every 99acres, MagicBricks and Meta lead within a minute in Telugu, Hindi or English, qualifies and books site visits.",
    h1: "AI calling agent for real estate in Hyderabad",
    eyebrow: "Hyderabad · Real estate",
    intro: "In Hyderabad real estate, the builder who calls first usually gets the site visit. RANA AI calls every new enquiry from 99acres, MagicBricks, Housing.com, Meta ads or your website within about a minute — in Telugu, Hindi or English — asks budget, configuration, location and timeline, and books the Saturday site visit for your sales team.",
    keywords: ["ai calling real estate hyderabad", "real estate lead calling hyderabad", "ai telecaller real estate hyderabad", "ai voice agent real estate hyderabad", "real estate crm calling hyderabad"],
    facts: ["Calls leads in ~1 minute", "Books site visits", "Telugu · Hindi · English", TRIAL_LINE],
    demo: "qualify",
    sections: [
      { h2: "What it does for builders and channel partners", bullets: [
        "Calls every portal and ad lead within about a minute, 7 days a week",
        "Qualifies: budget, 2/3 BHK or plot, preferred areas (Kokapet, Tellapur, Kollur, Kompally, Shamshabad…), loan need, timeline",
        "Books site visits and sends the details to the right sales manager on WhatsApp",
        "Re-engages old enquiries when a new tower or offer launches",
        "Reminder calls before the visit, feedback calls after",
        "Every call recorded and scored, so managers see which sources bring buyers",
      ] },
      { h2: "A typical first call", call: [
        { who: "ai", text: "Hello, this is Priya from Green Heights. You enquired about our Tellapur project — is this a good time?" },
        { who: "caller", text: "Haan, 3 BHK ka price kya hai?" },
        { who: "ai", text: "3 BHK starts at ₹1.2 crore, about 1,850 square feet. Are you looking to move in soon, or investing?" },
        { who: "caller", text: "Within a year. Can I see the flat this weekend?" },
        { who: "ai", text: "Of course — Saturday 11 AM or Sunday 4 PM?" },
      ] },
      { h2: "Why speed matters", body: "Portal leads are usually sent to several builders at once. The first one to call — in the buyer's language, with the right answers — sets the site visit. An AI calling agent makes that first call every time, including late at night and on holidays, and never lets a lead sit in a spreadsheet." },
    ],
    faqs: [
      { q: "Can it connect to our portal leads?", a: "Yes — leads can arrive by webhook, email parsing or a CSV upload, and the AI calls them automatically. We'll help you connect your sources." },
      { q: "Can it transfer a hot buyer to our sales manager live?", a: "It hands over hot leads instantly with the full summary on WhatsApp, and can pass the caller to your team when they ask for a person." },
      ...TRUST_FAQS.slice(1),
    ],
    related: ["/industries/real-estate", "/blog/ai-telecaller-for-real-estate-india", "/ai-voice-agent-hyderabad", "/ai-telecaller", "/telugu-ai-voice-agent"],
  },
  {
    path: "/ai-calling-for-coaching-institutes-hyderabad", kind: "city", label: "AI calling for coaching institutes in Hyderabad",
    title: "AI Calling for Coaching Institutes in Hyderabad",
    description: "AI calling for Hyderabad coaching institutes: calls every admission enquiry in Telugu, Hindi or English, books counselling and demo classes, follows up fees and batches — Ameerpet to Dilsukhnagar.",
    h1: "AI calling for coaching institutes in Hyderabad",
    eyebrow: "Hyderabad · Education & coaching",
    intro: "Admission season in Hyderabad means hundreds of enquiries a week — from Meta ads, JustDial, walk-in forms and missed calls — and a counselling team that can't call them all back the same day. RANA AI calls every enquiry within minutes, in Telugu, Hindi or English, answers questions about courses, batches and fees, and books the counselling session or demo class.",
    keywords: ["ai calling coaching institute hyderabad", "admission enquiry calling hyderabad", "ai telecaller for coaching", "coaching institute lead management hyderabad", "ai voice agent education hyderabad"],
    facts: ["Calls every enquiry", "Books counselling + demos", "Parent- and student-friendly", TRIAL_LINE],
    demo: "booking",
    sections: [
      { h2: "What it does for your institute", bullets: [
        "Calls every new admission enquiry within minutes — students and parents",
        "Answers course, batch timing, faculty, fee and scholarship questions from your information",
        "Books counselling sessions and demo classes, with reminder calls",
        "Follows up fee instalments and re-enrolment politely",
        "Re-engages last season's unconverted enquiries when new batches open",
        "Branch-wise reports: which centre and which source brings admissions",
      ] },
      { h2: "Made for multi-branch institutes", body: "Most Hyderabad institutes run several centres — Ameerpet, Dilsukhnagar, Kukatpally, Madhapur. The AI routes each enquiry to the nearest branch, books with that branch's counsellor, and gives the management one view of every enquiry and its outcome across all centres." },
      { h2: "Getting started before the next batch", steps: ["Share your courses, batches, fees and branch details.", "We set up the AI in Telugu, Hindi and English.", "Your counsellors test it and we tune the answers.", "Connect your enquiry sources and let it call every lead."] },
    ],
    faqs: [
      { q: "Can it talk to parents as well as students?", a: "Yes — it adjusts its tone, answers parents' questions about fees, safety and results, and books a visit for both." },
      ...TRUST_FAQS.slice(1),
    ],
    related: ["/industries/education-coaching", "/blog/ai-calling-for-coaching-institutes", "/ai-voice-agent-hyderabad", "/ai-telecaller", "/telugu-ai-voice-agent"],
  },
];

// ---- Free tool: a genuinely useful page other sites link to (links are the biggest ranking factor we don't control).
export const COST_TOOL: SeoPageData = {
  path: "/tools/ai-calling-cost-calculator", kind: "tool", label: "AI calling cost calculator",
  title: "Telecaller vs AI Calling Cost Calculator (India)",
  description: "Free calculator: compare the monthly cost of your telecalling team with an AI calling agent. Enter telecallers, salary, dials and call length — see the plan you'd need and the saving.",
  h1: "Telecaller vs AI calling cost calculator",
  eyebrow: "Free tool · India",
  intro: "How much would an AI calling agent cost for your call volume — and how does that compare with your telecalling team? Move the sliders to match your business. The calculator uses RANA AI's real plan prices and assumes the AI makes the first call while your best people handle closing.",
  keywords: ["ai calling cost calculator", "telecaller cost calculator", "ai telecaller cost india", "telecalling cost per month india", "ai vs telecaller cost", "call center cost calculator india"],
  sections: [
    { h2: "How the calculation works", bullets: [
      "Telecalling cost = telecallers × salary, plus 20% for incentives, PF, seat, SIM and attrition",
      "Connected calls = telecallers × dials per day × connect rate × 26 working days",
      "AI minutes = connected calls × average length, plus 10% for short unanswered attempts",
      "We pick the cheapest RANA AI plan for those minutes, including per-minute overage",
      "Telecallers you keep for closing are added back to the AI side",
    ] },
    { h2: "What the numbers don't show", body: "An AI calling agent also calls every lead within about a minute, works 24×7, speaks 11 Indian languages and records, transcribes and scores every call. Those usually matter more than the cost saving: leads called in the first minutes convert far better than leads called hours later.\n\nIt's also not free of work: someone needs to own the script and read the lead cards. Start with one use case — first calls to new leads — and measure booked appointments before and after." },
  ],
  faqs: [
    { q: "What does a telecaller cost in India?", a: "Typical salaries in Indian metros range from about ₹15,000 to ₹25,000 a month, plus incentives, PF, a seat, a SIM and hiring costs as people leave. Use your own numbers in the calculator." },
    { q: "What does an AI calling agent cost?", a: `RANA AI plans start at ₹${PLANS.launch.pricePerMonth!.toLocaleString("en-IN")}/month for ${PLANS.launch.minutes} minutes; Starter is ₹${PLANS.starter.pricePerMonth!.toLocaleString("en-IN")}/month for ${PLANS.starter.minutes.toLocaleString("en-IN")} minutes. Prices exclude GST.` },
    { q: "Can I embed or share this calculator?", a: "Yes — link to this page from your blog or article. If you'd like numbers for a report, email hello@ranaai.in." },
  ],
  related: ["/compare/ai-vs-human-telecaller", "/telecaller-software", "/ai-telecaller", "/blog/telecaller-vs-ai-calling-cost-india", "/pricing"],
};
