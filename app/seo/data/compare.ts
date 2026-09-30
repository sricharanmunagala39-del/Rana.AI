// /compare/* — honest comparisons. Competitor facts come from their public pricing pages (see `sources`),
// dated with `checked`. Say where they are the better choice, too: that is what earns trust (and links).
import type { SeoPageData } from "../types";
import { TRUST_FAQS, inr } from "./shared";
import { PLANS } from "@/lib/pricing";

const CHECKED = "30 September 2026";
const RANA_ROW = ["RANA AI", `${inr(PLANS.launch.pricePerMonth!)}–${inr(PLANS.scale.pricePerMonth!)}/month, minutes included, in ₹ with GST invoice`];

function platform(name: string, slug: string, url: string, pricing: string, strengths: string[], extra: { q: string; a: string }[] = []): SeoPageData {
  return {
    path: `/compare/rana-ai-vs-${slug}`, kind: "compare", label: `RANA AI vs ${name}`,
    title: `RANA AI vs ${name} — Which AI Voice Agent for India?`,
    description: `RANA AI vs ${name} compared for Indian businesses: pricing, Indian languages, setup, numbers and support. An honest look at when each one is the better choice.`,
    h1: `RANA AI vs ${name}`,
    eyebrow: "Comparison · AI voice agents",
    intro: `${name} and RANA AI both run AI voice agents, but they are built for different people. ${name} is a platform for developers to build voice agents. RANA AI is a ready-made AI calling employee for Indian businesses — set up for you, in Indian languages, billed in rupees. Here is how they compare, using ${name}'s own public pricing as of ${CHECKED}.`,
    keywords: [`${name.toLowerCase()} alternative`, `${name.toLowerCase()} vs rana ai`, `${name.toLowerCase()} india`, `${name.toLowerCase()} pricing inr`, `${name.toLowerCase()} competitor`],
    checked: CHECKED,
    sources: [{ label: `${name} pricing`, url }],
    sections: [
      { h2: "At a glance", table: { head: ["", name, "RANA AI"], rows: [
        ["Built for", "Developers and product teams", "Business owners, sales and front-desk teams"],
        ["Pricing (public)", pricing, RANA_ROW[1]],
        ["Setup", "You build prompts, tools, telephony and integrations", "Done for you; edit in plain language afterwards"],
        ["Indian languages", "Depends on the speech and voice providers you configure", "Telugu, Hindi, Tamil, Kannada, Malayalam, Marathi, Bengali, Gujarati, Punjabi, Odia + English built in"],
        ["Indian phone numbers", "Bring or configure your own", "Included on Growth and above; add-on on Starter"],
        ["Lead scores, CRM-style lead cards, WhatsApp alerts", "Call logs in their dashboard; the rest you build on their API", "Included, no code"],
        ["Support", "Documentation and developer support tiers", "Setup and support from our team in Hyderabad"],
      ], note: `${name} details from ${url} on ${CHECKED}. Prices and features change — check their site.` } },
      { h2: `Where ${name} is the better choice`, bullets: strengths },
      { h2: "Where RANA AI is the better choice", bullets: ["You want an AI calling agent working on your number this week, not a build project", "Your customers speak Telugu, Hindi, Tamil or another Indian language", "You want one monthly plan in rupees, with a GST invoice", "You want lead scoring, recordings, transcripts and WhatsApp lead alerts without writing code", "You want people to help you set up and improve your script"] },
      { h2: "Total cost, not headline rate", body: "Developer platforms often quote a low per-minute platform fee, then add speech-to-text, the language model, the voice and telephony on top — and you still need engineering time to build and maintain the agent. When you compare, add up everything for one month at your real call volume, including the people needed to run it." },
    ],
    faqs: [
      { q: `Is RANA AI built on ${name}?`, a: `No. RANA AI runs its own platform with two voice engines (R1 and R2), tuned for Indian languages and Indian phone numbers.` },
      { q: `Can I switch from ${name} to RANA AI?`, a: "Yes — share your current prompt and call flow and we'll recreate it as a RANA AI employee so you can compare on real calls." },
      ...extra,
      ...TRUST_FAQS.slice(1, 2),
    ],
    related: ["/vapi-alternative-india", "/compare/rana-ai-vs-vapi", "/compare/rana-ai-vs-retell-ai", "/compare/rana-ai-vs-bland-ai", "/compare/rana-ai-vs-bolna", "/pricing"].filter((p) => p !== `/compare/rana-ai-vs-${slug}`),
  };
}

export const COMPARE: SeoPageData[] = [
  platform("Vapi", "vapi", "https://vapi.ai/pricing", "$0.05/min platform fee plus pass-through costs for speech, model, voice and telephony; plans from $0 (pay-as-you-go) to $999+/month", ["You are a developer building a voice product for many clients", "You want to choose and swap every model and provider yourself", "You need very fine control over latency and call logic"]),
  platform("Retell AI", "retell-ai", "https://www.retellai.com/pricing", "Pay-as-you-go; voice agents about $0.07–0.31/min depending on model and voice, plus phone numbers and add-ons", ["You have engineers and want a well-documented voice-agent API", "You mostly serve English-speaking callers in the US or Europe", "You want to pick your own LLM per agent"]),
  platform("Bland AI", "bland-ai", "https://www.bland.ai/pricing", "From $0.14/min (Start) or $0.12/min with a $299/month platform fee (Build); one rate covers model, speech and voice", ["You run very large outbound volumes in the US", "You want an all-in per-minute rate in dollars and have a developer to integrate it", "You need enterprise contracts with dedicated infrastructure"]),
  platform("Bolna", "bolna", "https://www.bolna.ai/pricing", "Pay-as-you-go credits; listed at about 6¢ (≈₹5.5) per minute standard, with lower committed-volume pilots", ["You are a developer or agency who wants to build and host agents yourself", "You want to bring your own keys for speech, voice and model providers", "You're comfortable managing prompts, telephony and integrations"], [{ q: "Both are Indian — what's the difference?", a: "Bolna is primarily a platform to build voice agents on. RANA AI is a finished AI employee for businesses: we set it up with your script and languages, and you get a dashboard, lead scoring, reports and WhatsApp alerts out of the box." }]),
  {
    path: "/compare/ai-vs-human-telecaller", kind: "compare", label: "AI vs human telecaller",
    title: "AI Calling vs Human Telecaller — Cost Compared",
    description: "AI calling agent vs human telecaller: cost, speed, languages, hours and results compared for Indian businesses — and when you still need people on the phone.",
    h1: "AI calling agent vs human telecaller",
    eyebrow: "Comparison · Telecalling",
    intro: "This isn't 'AI or people'. It's which calls should a person spend their day on. AI is unbeatable at speed and volume — answering every call and dialling every new lead within a minute. People are better at negotiation, closing and relationships. Most teams that switch end up with fewer, better-used telecallers.",
    keywords: ["ai vs telecaller", "ai calling vs human calling", "telecaller replacement", "ai telecaller cost india", "is ai better than telecaller"],
    sections: [
      { h2: "Side by side", table: { head: ["", "Human telecaller", "AI calling agent (RANA)"], rows: [["Monthly cost", "₹15,000–25,000 salary + incentives, PF, seat, SIM", `From ${inr(PLANS.launch.pricePerMonth!)} (400 min) · Starter ${inr(PLANS.starter.pricePerMonth!)} (1,000 min)`], ["Hours", "~8 a day, 6 days a week", "24×7, including Sundays and festivals"], ["Calls at once", "1", "1–50 depending on plan"], ["First call to a new lead", "Often hours later", "About a minute"], ["Languages", "1–2", "11 Indian + 3 global"], ["Consistency", "Varies by person, day and mood", "Same script, same quality, every call"], ["Notes", "Manual, often missing", "Recording, transcript and lead score for every call"], ["Hiring & attrition", "Constant", "None"], ["Negotiation & closing", "Strong", "Hands over to your team"]], note: "Salary ranges are typical in Indian metros; use your own numbers." } },
      { h2: "What to automate first", steps: ["First call to every new lead (speed-to-lead)", "After-hours and overflow inbound calls", "Reminders: appointments, EMIs, renewals, fees", "Re-engaging old and cold leads", "Confirmations: COD orders, bookings, visits"] },
      { h2: "What to keep human", bullets: ["Negotiating price and closing big-ticket deals", "Complaints that need judgment or a refund decision", "Key accounts and long relationships", "Anything sensitive — health, legal, financial hardship"] },
      { h2: "A simple way to decide", body: "Take last month's calls. Count how many were first contact, reminders or FAQs versus real selling conversations. The first group is usually the majority — and that is exactly what an AI calling agent should take off your team's plate." },
    ],
    faqs: [{ q: "Will AI replace my telecalling team?", a: "It replaces the repetitive part — dialling, first contact, reminders and FAQs. Most teams keep their best people and move them to hot leads, closing and relationships." }, ...TRUST_FAQS.slice(1, 2)],
    related: ["/ai-telecaller", "/blog/telecaller-vs-ai-calling-cost-india", "/pricing", "/glossary/speed-to-lead", "/compare/ai-voice-agent-vs-ivr"],
  },
  {
    path: "/compare/ai-voice-agent-vs-ivr", kind: "compare", label: "AI voice agent vs IVR",
    title: "AI Voice Agent vs IVR — Which Is Better?",
    description: "AI voice agent vs IVR for Indian businesses: callers just say what they need in their own language instead of pressing buttons. Costs, experience and when IVR still makes sense.",
    h1: "AI voice agent vs IVR",
    eyebrow: "Comparison · Call handling",
    intro: "An IVR makes callers do the work: listen to a menu, press 1, press 3, wait. An AI voice agent just asks 'How can I help?' — in the caller's language — understands the answer, and solves it or routes it. For most businesses that means shorter calls, fewer hang-ups and far fewer calls that reach a person.",
    keywords: ["ai voice agent vs ivr", "ivr alternative", "conversational ivr", "ivr replacement india", "voice bot vs ivr"],
    sections: [
      { h2: "Side by side", table: { head: ["", "Traditional IVR", "AI voice agent"], rows: [["How callers use it", "Listen to a menu and press keys", "Speak naturally, in their own language"], ["What it can do", "Route calls, play recorded info", "Answer questions, book, qualify, take details, route"], ["Languages", "One or two recorded menus", "11 Indian languages, switches with the caller"], ["Changing it", "Re-record prompts, reconfigure the tree", "Edit the script in plain language"], ["After hours", "'Please call during office hours'", "Handles the call fully"], ["Data", "Key presses", "Transcript, intent, lead score"]] } },
      { h2: "When IVR still makes sense", bullets: ["Very simple routing (sales vs support) with no questions to answer", "Regulated flows where a fixed menu is required", "As a fallback: 'press 0 for a person' alongside the AI agent"] },
      { h2: "Moving from IVR to an AI voice agent", steps: ["List the top 10 reasons people call you", "Write the answer or action for each (we help)", "Point your number (or the IVR's first option) to the AI agent", "Watch transcripts for a week and fill the gaps"] },
    ],
    faqs: [{ q: "Can I keep my existing number?", a: "Yes — forward calls from your existing number or IVR option to your AI voice agent." }, ...TRUST_FAQS.slice(1, 2)],
    related: ["/ai-receptionist", "/glossary/ivr", "/glossary/conversational-ai", "/compare/ai-vs-missed-call-service"],
  },
  {
    path: "/compare/ai-vs-missed-call-service", kind: "compare", label: "AI voice agent vs missed-call service",
    title: "AI Voice Agent vs Missed-Call Service",
    description: "Missed-call services capture a number; an AI voice agent calls back in a minute and qualifies the lead. How they compare for lead generation in India.",
    h1: "AI voice agent vs missed-call service",
    eyebrow: "Comparison · Lead capture",
    intro: "Missed-call numbers are brilliant at one thing: capturing interest for free. But a missed call is only a phone number. Someone still has to call back — and the longer that takes, the colder the lead. An AI voice agent turns every missed call into a conversation within about a minute.",
    keywords: ["missed call service alternative", "missed call to lead", "missed call marketing india", "missed call callback ai"],
    sections: [
      { h2: "Side by side", table: { head: ["", "Missed-call service", "Missed call + AI voice agent"], rows: [["What you get", "A phone number and time", "A qualified lead: need, budget, timeline, next step"], ["Callback speed", "Whenever your team gets to it", "About a minute, 24×7"], ["Language", "—", "The caller's own language"], ["Cost per lead", "Very low to capture, high to follow up", "Capture + first conversation included"]] } },
      { h2: "The best of both", body: "Keep your missed-call number — it's a great, frictionless call to action. Connect it to an AI voice agent that calls back immediately, qualifies the person and books the next step. Read our missed-call to lead conversion playbook for the full setup." },
    ],
    faqs: TRUST_FAQS.slice(0, 2),
    related: ["/blog/missed-call-to-lead-conversion", "/glossary/missed-call-service", "/glossary/speed-to-lead", "/ai-calling-agent"],
  },
];
