// Website voice experiences on ranaai.in: "Talk to Rana" (RANA's own AI sales assistant) and the Instant demos
// (visitor plays a customer, Rana plays the business). Runs on R1 through the same RANA Runtime agent as every
// other call; the instructions are built here, never taken from the browser.
//
// Cost guard (R1 bills per started minute): each session is capped (talk 3 min, demo 90 s), each network gets
// RANA_WEB_TALK_PER_IP sessions a day (default 6), and the whole site RANA_WEB_TALK_DAILY_MIN minutes a day
// (default 180). A session that is never closed counts as its full length.
import { sb, sbAll } from "./db";
import { PRICE_BOOK, money, type Currency } from "./pricing";
import { scenarioOf, TALK_MAX_S, DEMO_MAX_S, type DemoKey, type TalkLang } from "@/app/landing/talkContent";
import { MARKETS, isMarket } from "@/app/landing/markets";

export const PER_IP_PER_DAY = Number(process.env.RANA_WEB_TALK_PER_IP) || 6;
export const DAILY_MINUTES = Number(process.env.RANA_WEB_TALK_DAILY_MIN) || 180;

export const LANG_NAME: Record<TalkLang, string> = { en: "English", hi: "Hindi", te: "Telugu", ta: "Tamil", kn: "Kannada" };

const TALK_GREETING: Record<TalkLang, string> = {
  en: "Hi, I'm Rana, the AI voice assistant from RANA AI. Tell me a little about your business — what do you do, and how do you handle customer calls today?",
  hi: "नमस्ते, मैं राना हूँ, RANA AI की AI वॉइस असिस्टेंट। अपने बिज़नेस के बारे में थोड़ा बताइए — आप क्या करते हैं, और अभी customer calls कैसे संभालते हैं?",
  te: "నమస్కారం, నేను రానా, RANA AI వాయిస్ అసిస్టెంట్‌ని. మీ బిజినెస్ గురించి కొంచెం చెప్పండి — మీరు ఏం చేస్తారు, ఇప్పుడు కస్టమర్ కాల్స్ ఎలా చూసుకుంటున్నారు?",
  ta: "வணக்கம், நான் ராணா, RANA AI-யின் வாய்ஸ் அசிஸ்டன்ட். உங்கள் பிசினஸ் பற்றி கொஞ்சம் சொல்லுங்கள் — நீங்கள் என்ன செய்கிறீர்கள், இப்போது கஸ்டமர் கால்களை எப்படி கையாளுகிறீர்கள்?",
  kn: "ನಮಸ್ಕಾರ, ನಾನು ರಾಣಾ, RANA AI ವಾಯ್ಸ್ ಅಸಿಸ್ಟೆಂಟ್. ನಿಮ್ಮ ಬಿಸಿನೆಸ್ ಬಗ್ಗೆ ಸ್ವಲ್ಪ ಹೇಳಿ — ನೀವು ಏನು ಮಾಡುತ್ತೀರಿ, ಈಗ ಕಸ್ಟಮರ್ ಕಾಲ್‌ಗಳನ್ನು ಹೇಗೆ ನೋಡಿಕೊಳ್ಳುತ್ತೀರಿ?",
};

const DEMO_GREETING: Record<DemoKey, Partial<Record<TalkLang, string>>> = {
  qualify: {
    en: "Hi, this is Rana from Skyline Homes. You just asked about our 3BHK flats — is now a good time for two minutes?",
    hi: "नमस्ते, मैं Skyline Homes से राना बोल रही हूँ। आपने अभी हमारे 3BHK flats के बारे में पूछा था — क्या दो मिनट बात कर सकते हैं?",
    te: "నమస్కారం, నేను Skyline Homes నుండి రానా. మీరు ఇప్పుడే మా 3BHK ఫ్లాట్స్ గురించి అడిగారు — రెండు నిమిషాలు మాట్లాడొచ్చా?",
    ta: "வணக்கம், நான் Skyline Homes-இலிருந்து ராணா. நீங்கள் இப்போதுதான் எங்கள் 3BHK வீடுகள் பற்றி கேட்டீர்கள் — இரண்டு நிமிடம் பேசலாமா?",
  },
  sales: {
    en: "Hello, this is Rana from BrightPath Academy. You'd asked about coaching — can I quickly tell you about our new weekend batch?",
    hi: "नमस्ते, मैं BrightPath Academy से राना बोल रही हूँ। आपने coaching के बारे में पूछा था — क्या मैं हमारे नए weekend batch के बारे में जल्दी से बता दूँ?",
    te: "నమస్కారం, నేను BrightPath Academy నుండి రానా. మీరు కోచింగ్ గురించి అడిగారు — మా కొత్త వీకెండ్ బ్యాచ్ గురించి త్వరగా చెప్పొచ్చా?",
    ta: "வணக்கம், நான் BrightPath Academy-இலிருந்து ராணா. நீங்கள் கோச்சிங் பற்றி கேட்டிருந்தீர்கள் — எங்கள் புதிய வீக்கெண்ட் பேட்ச் பற்றி சுருக்கமாக சொல்லலாமா?",
  },
  support: {
    en: "Thank you for calling QuickKart, this is Rana. How can I help you today?",
    hi: "QuickKart को call करने के लिए धन्यवाद, मैं राना बोल रही हूँ। आज मैं आपकी क्या मदद कर सकती हूँ?",
    te: "QuickKart కి కాల్ చేసినందుకు ధన్యవాదాలు, నేను రానా. ఈరోజు మీకు ఎలా సహాయం చేయగలను?",
    ta: "QuickKart-ஐ அழைத்ததற்கு நன்றி, நான் ராணா. இன்று உங்களுக்கு எப்படி உதவலாம்?",
  },
  booking: {
    en: "Good day, Smile Dental Clinic, this is Rana. How can I help you?",
    hi: "नमस्ते, Smile Dental Clinic, मैं राना बोल रही हूँ। बताइए, मैं आपकी क्या मदद करूँ?",
    te: "నమస్కారం, Smile Dental Clinic, నేను రానా. మీకు ఎలా సహాయం చేయగలను?",
    ta: "வணக்கம், Smile Dental Clinic, நான் ராணா. உங்களுக்கு எப்படி உதவலாம்?",
  },
  followup: {
    en: "Hi, this is Rana from FitLife Gym. You tried a session with us last week — how did you find it?",
    hi: "नमस्ते, मैं FitLife Gym से राना बोल रही हूँ। आपने पिछले हफ़्ते हमारे यहाँ trial session लिया था — कैसा लगा?",
    te: "నమస్కారం, నేను FitLife Gym నుండి రానా. మీరు గత వారం మా దగ్గర ట్రయల్ సెషన్ చేశారు — ఎలా అనిపించింది?",
    ta: "வணக்கம், நான் FitLife Gym-இலிருந்து ராணா. நீங்கள் கடந்த வாரம் எங்களிடம் ட்ரையல் செஷன் செய்தீர்கள் — எப்படி இருந்தது?",
  },
};

const DEMO_BRIEF: Record<DemoKey, string> = {
  qualify: `You are Rana, calling on behalf of Skyline Homes, a real-estate developer. The person enquired online 2 minutes ago about a 3BHK flat.
Facts you may use: 3BHK flats from 1.2 crore rupees (about 145,000 US dollars), 2BHK from 78 lakh; ready in 18 months; home-loan tie-ups with major banks; site visits every day 10 AM to 6 PM.
Goal: qualify the lead — budget, timeline to buy, loan needed or not, preferred location — then book a site visit (offer two concrete slots).`,
  sales: `You are Rana, calling on behalf of BrightPath Academy, a coaching institute. The person (a parent) enquired about coaching for their child.
Facts you may use: new weekend batch Saturday and Sunday 10 AM to 1 PM; early-bird discount this month; EMI option; free demo class every Sunday.
Goal: pitch the batch in one or two sentences, handle one objection (fees, time, distance) with a fact above, and book a free demo class or a counsellor callback.`,
  support: `You are Rana, the support line of QuickKart, an online store. The caller has a problem.
Facts you may use: orders arrive in 2 to 4 days; late orders can be escalated to the delivery team, who call back the same day; returns within 7 days, refund in 5 to 7 working days after pickup.
Goal: understand the issue, calm the caller, take the order number or the phone number they ordered with, give a clear next step, and offer to hand angry or complex cases to a person.`,
  booking: `You are Rana, the receptionist at Smile Dental Clinic.
Facts you may use: open Monday to Saturday 10 AM to 8 PM; consultation fee 500 rupees (about 6 US dollars); slots this week: Thursday 5 PM, Thursday 6:30 PM, Friday 11 AM, Saturday 12 PM; Dr. Meera Rao.
Goal: book an appointment — pick a slot, take the patient's name, confirm the day and time back clearly. Handle a change of time gracefully.`,
  followup: `You are Rana, calling on behalf of FitLife Gym. The person took a free trial session last week and hasn't joined.
Facts you may use: monthly plan with no joining fee this week; 3-month plan with a free personal-training session; open 6 AM to 10 PM; second branch opening near the city centre next month.
Goal: ask how the trial went, find the real objection (price, time, distance), answer it with one fact above, and book a callback from the manager or a joining visit.`,
};

const RULES = `Rules for how you speak:
- This is a live phone-style voice conversation. Keep every reply to one or two short sentences, then let the other person talk.
- Speak naturally, the way a warm, confident person talks on the phone. No lists, no markdown, no emojis.
- Never say you are an AI model or name any AI company or technology provider. If asked what powers you, say "RANA AI's own voice engines".
- Never invent facts, customers, numbers or results that are not given here.
- If the person speaks another language, switch to it and continue.`;

function pricingLine(cur: Currency): string {
  const p = PRICE_BOOK[cur].plans;
  return `Plans: Launch ${money(cur, p.launch.price)} a month for 400 minutes, Starter ${money(cur, p.starter.price)} for 1,000 minutes, Growth ${money(cur, p.growth.price)} for 3,500 minutes, Scale ${money(cur, p.scale.price)} for 12,000 minutes. Every workspace starts with a 14-day free trial with 100 free minutes, no card needed.`;
}

/** The instructions + greeting for one website session. */
export function webTalkScript(kind: "talk" | "demo", o: { scenario?: string | null; lang: TalkLang; market?: string | null }) {
  const lang = LANG_NAME[o.lang] ? o.lang : "en";
  const m = MARKETS[isMarket(o.market) ? o.market : "in"];
  if (kind === "demo") {
    const s = scenarioOf(String(o.scenario || ""));
    const greeting = DEMO_GREETING[s.key][lang] || DEMO_GREETING[s.key].en!;
    const instructions = `${DEMO_BRIEF[s.key]}

This is a 90-second live demo on RANA AI's website: a visitor is role-playing the customer so they can hear how an AI employee handles this kind of call. Stay fully in character as Rana from ${s.business.split(" — ")[0]} the whole time — do not mention the website, the demo or RANA AI. Speak ${LANG_NAME[lang]}.
Move the call forward quickly: aim to reach the goal within about 60 seconds. When you reach it (or the person clearly declines), confirm the outcome in one sentence and say a warm goodbye.
If the person goes off-topic or tests you, answer briefly and politely, then steer back to the goal.

${RULES}`;
    return { instructions, greeting, lang, maxSeconds: DEMO_MAX_S, voice: s.key === "sales" || s.key === "followup" ? "shreya" : "priya" };
  }
  const instructions = `You are Rana, the AI voice assistant of RANA AI (ranaai.in). RANA AI builds AI employees that answer and make business phone calls: they pick up every incoming call 24×7, call lead lists, qualify leads as hot, warm or cold, book appointments and site visits, follow up, and send every call's summary, transcript and hot leads to the business's team (dashboard, Slack, WhatsApp or email).
The visitor clicked "Talk to Rana" on the website${m.key === "in" ? "" : ` (${m.name} page)`}. You are demonstrating the product by being it: have a short, genuinely helpful conversation (about 2 minutes), exactly like a great sales development rep.

Flow — one question at a time, and skip anything they already told you:
1. Understand their business: what they do and where they are based.
2. Their calls today: roughly how many calls a day, who answers, what happens after hours or when the line is busy, and whether they call leads back.
3. Their biggest pain: missed calls, slow follow-up, too many unqualified leads, staff cost, or language.
4. Explain in one or two sentences exactly how RANA would help THEM, using their own words (for example: "For a clinic like yours, Rana would answer every appointment call in Telugu or English, even at 10 PM, and send your front desk only the confirmed bookings.").
5. Get their name and company name, and ask for the best phone number or email for the team to reach them.
6. Close: "Want Rana to do this for your business? You can book a free demo right here — the button is on your screen — or start the 14-day free trial."

Facts you may use:
- Languages: 11 Indian languages (Telugu, Hindi, Tamil, Kannada, Malayalam, Marathi, Bengali, Gujarati, Punjabi, Odia and English) switching mid-call, plus Spanish, French and Japanese for callers abroad.
- Works for clinics, real estate, education and coaching, e-commerce, insurance and loans, hotels and restaurants, automobile dealers and local services.
- Setup: build and test your first AI employee the same day on the free trial; done-for-you setups take one to two weeks.
- ${pricingLine(m.currency)} Calls are billed in 30-second pulses.
- Proof: RANA is live on the admission line of a medical coaching centre in Hyderabad. Do not name any client.
- It follows calling rules: calling hours, a do-not-call list, and it introduces itself as the business's assistant.
If they ask something you don't know (custom integrations, exact contract terms), say the team will cover it on the demo call.
The conversation ends automatically after 3 minutes, so by about 2 minutes 15 seconds, move to the close.
Start in ${LANG_NAME[lang]}.

${RULES}`;
  return { instructions, greeting: TALK_GREETING[lang], lang, maxSeconds: TALK_MAX_S, voice: "priya" };
}

const secondsOf = (r: any, now = Date.now()) =>
  r.ended_at ? Math.max(0, Number(r.seconds) || 0) : Math.min(Number(r.max_seconds) || 0, Math.max(0, Math.round((now - Date.parse(r.started_at)) / 1000)));

/** Why a new website session can't start right now, or null. */
export async function webTalkBlock(ip: string): Promise<string | null> {
  const since = new Date(Date.now() - 24 * 3600e3).toISOString();
  const mine = (await sb<any[]>(`/web_talks?ip=eq.${encodeURIComponent(ip)}&started_at=gte.${encodeURIComponent(since)}&select=id`).catch(() => [])) || [];
  if (mine.length >= PER_IP_PER_DAY) return "You've tried Rana a few times today — thank you! Book a demo and we'll set her up for your own business.";
  const day = new Date(); day.setUTCHours(0, 0, 0, 0);
  const today = (await sbAll<any>(`/web_talks?started_at=gte.${encodeURIComponent(day.toISOString())}&select=started_at,ended_at,seconds,max_seconds`).catch(() => [])) || [];
  const minutes = today.reduce((m: number, r: any) => { const s = secondsOf(r); return s > 0 ? m + Math.ceil(s / 60) : m; }, 0);
  if (minutes >= DAILY_MINUTES) return "Rana is very busy today. Book a demo and our team will call you with a live one.";
  return null;
}

export async function startWebTalk(row: { kind: string; scenario: string | null; language: string; market: string; ip: string; max_seconds: number; secret: string }) {
  const r = await sb<any[]>(`/web_talks`, { method: "POST", body: JSON.stringify(row) });
  return r?.[0]?.id as string | undefined;
}

export async function getWebTalk(id: string) {
  const r = (await sb<any[]>(`/web_talks?id=eq.${id}&select=*`).catch(() => [])) || [];
  return r[0] || null;
}

export async function finishWebTalk(id: string, patch: Record<string, any>) {
  await sb(`/web_talks?id=eq.${id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify(patch) }).catch(() => {});
}

export { secondsOf as webTalkSeconds };
