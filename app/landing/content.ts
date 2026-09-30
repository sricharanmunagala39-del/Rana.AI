// Pricing and FAQ copy shared by the website and its structured data (app/landing/page.tsx).
import { PLANS as PRICE_LIST, PAID_PLAN_KEYS, planHighlights, inr0, TRIAL_DAYS, TRIAL_MINUTES, enginesPricingLine, engineMinuteRate, PRICE_BOOK, CURRENCY_SYMBOL, money, amount, type PaidKey } from "@/lib/pricing";
import { MARKETS, type Market } from "./markets";

// What RANA can really hold a phone call in. R1: 11 Indian languages (incl. English), switching mid-call.
// R2: English, Hindi, Spanish, French and Japanese — the languages its speech recognition documents.
// Census 2011: these 10 Indian languages are the mother tongue of ~88% of Indians.
export const INDIAN_LANGS_LINE = "11 Indian languages — Telugu, Hindi, Tamil, Kannada, Malayalam, Marathi, Bengali, Gujarati, Punjabi, Odia and English, the mother tongues of nearly 9 in 10 Indians — and it follows the caller if they switch.";
export const GLOBAL_LANGS_LINE = "For callers abroad it also talks in Spanish, French and Japanese, with voices in 40+ languages; more call languages are added as they pass our quality checks.";
export const CALL_LANGUAGE_COUNT = 14; // en, hi, te, ta, kn, ml, mr, bn, gu, pa, or + es, fr, ja

// Website plan cards come from the shared price list (lib/pricing), so they always match Billing and HQ.
export const PLANS = PAID_PLAN_KEYS.map((k) => {
  const p = PRICE_LIST[k];
  return { name: p.name, price: inr0(p.pricePerMonth || 0), min: inr0(p.minutes), extra: `₹${p.overagePerMin}`, pts: planHighlights(p), fee: `₹${inr0(p.onboardingFee || 0)} setup`, hi: k === "growth" };
});
export const ENGINES_LINE = enginesPricingLine();
const START = PRICE_LIST[PAID_PLAN_KEYS[0]];

export const FAQ: [string, string][] = [
  ["Which businesses is RANA AI for?", "Any business that answers or makes a lot of phone calls: clinics and hospitals, real estate, schools and coaching, e-commerce and D2C brands, insurance and loan companies, hotels and restaurants, automobile dealers and local service businesses. If your team misses calls, calls back late or repeats the same answers all day, RANA can take those calls."],
  ["What happens when I book a demo?", "You fill a short form and we call you within one working day. On a 20-minute call we learn how your calls work today, then show you an AI employee answering and calling for a business like yours, in your customers' language. No slides and no obligation — or start the free trial and build one yourself."],
  ["Will callers know they're talking to an AI?", "It sounds natural and follows the conversation, but we recommend it introduces itself as your assistant. Honesty keeps trust high — and callers mostly care that someone picked up instantly."],
  ["Which languages does it speak?", `${INDIAN_LANGS_LINE} ${GLOBAL_LANGS_LINE}`],
  ["Can it use my existing business number?", "Trials run on a shared Indian number. Growth and above get their own Indian number; for promotional outbound lists we help you with DLT registration so you stay compliant."],
  ["How fast can we go live?", "You can build and test your first AI employee the same day on the free trial. Done-for-you setups with your scripts and data usually take one to two weeks."],
  ["What happens when my minutes run out?", "Plan minutes are used first. After that, calls continue from a prepaid balance you top up by UPI, card or netbanking — or turn on auto-recharge so campaigns never stop."],
  ["What is an AI voice agent?", "An AI voice agent is software that talks on the phone like a trained staff member. RANA AI answers incoming calls and calls your leads, understands what people say in their own language, answers from your business information, and records, transcribes and scores every call for your team."],
  ["How much does an AI calling agent cost in India?", `RANA AI plans start at ₹${inr0(START.pricePerMonth || 0)} a month for ${inr0(START.minutes)} connected minutes (about ₹${Math.round((START.pricePerMonth || 0) / START.minutes)} a minute), with lower per-minute rates on bigger plans. Calls are billed in 30-second pulses, and every workspace starts with a ${TRIAL_DAYS}-day free trial with ${TRIAL_MINUTES} minutes. ${enginesPricingLine()}`],
  ["Is AI calling allowed in India? What about TRAI and DND rules?", "Yes, when it follows TRAI's commercial-communication rules. RANA AI only dials inside the calling hours you set (9 AM to 9 PM, Monday to Saturday, by default), keeps a do-not-call list that grows automatically when someone asks not to be called, and stops a campaign outside those hours. For promotional lists you need DLT registration and the right number series, and you should only call people who enquired or agreed to be contacted — we help you set this up."],
  ["What are the R1 and R2 voice engines?", `They are the two voice engines behind every RANA AI employee, and both are included in every plan. R1 is built for Indian languages and follows the caller when they switch language mid-call. R2 offers 900+ voices, very fast replies, your own cloned voice and global languages (English, Spanish, French, Japanese and Hindi), and keeps each call in the language it opens with. You choose the engine for each AI employee and can switch any time.${engineMinuteRate("cartesia") !== engineMinuteRate("sarvam") ? ` R1 calls use 1 plan minute per call minute; R2 calls use ${engineMinuteRate("cartesia")} plan minutes per call minute.` : ""}`],
  ["Do I get an invoice?", "Yes. Every payment comes with a proper invoice you can download any time from the Billing page."],
];

// ---------- Other markets (global, US, Gulf, Europe, Japan) ----------
const PAID: PaidKey[] = ["launch", "starter", "growth", "scale"];

export type PlanCard = { key: PaidKey; name: string; symbol: string; price: string; min: string; extra: string; pts: string[]; fee: string; hi: boolean };

/** Plan cards for a market: India uses the rupee price list; other markets use local price points, same minutes. */
export function plansFor(m: Market): PlanCard[] {
  if (m.currency === "INR") return PAID.map((k, i) => ({ key: k, symbol: "₹", ...PLANS[i] }));
  const book = PRICE_BOOK[m.currency].plans;
  return PAID.map((k) => {
    const p = PRICE_LIST[k], l = book[k];
    const pts = [
      `${p.employees} AI employee${p.employees === 1 ? "" : "s"}`,
      `${p.concurrency} call${p.concurrency === 1 ? "" : "s"} at the same time`,
      `Campaigns up to ${p.campaignSize.toLocaleString("en-US")} numbers`,
      p.ownNumber ? "Your own local number, set up for you" : "Local number add-on, set up for you",
      "Both voice engines: R1 and R2",
    ];
    return { key: k, name: p.name, symbol: CURRENCY_SYMBOL[m.currency], price: amount(m.currency, l.price), min: p.minutes.toLocaleString("en-US"), extra: money(m.currency, l.overage), pts, fee: `${money(m.currency, l.setup)} setup`, hi: k === "growth" };
  });
}

/** FAQ for a market. India keeps its own list; global markets get the same answers rewritten for them. */
export function faqFor(m: Market): [string, string][] {
  if (m.key === "in") return FAQ;
  const start = PRICE_BOOK[m.currency].plans.launch;
  const place = m.key === "global" ? "your country" : m.name;
  return [
    FAQ[0],
    ["Which languages does it speak?", `English, Spanish, French, Japanese and Hindi for callers around the world, plus ${INDIAN_LANGS_LINE.replace(" — and it follows the caller if they switch.", "")} Voices are available in 40+ languages, and more call languages are added as they pass our quality checks.`],
    ["Can I get a local phone number?", `Yes. We set up the number for you — US numbers are available now, and numbers in the UK, UAE, Europe, Japan and other countries are arranged on request. You can also forward your existing business number to your AI employee.`],
    ["Is AI calling allowed?", `Answering incoming calls is fine almost everywhere. For outbound calls the rules depend on the country: in the US, AI-voice calls need the person's prior consent (TCPA); in the UK and EU, data-protection rules (GDPR) apply. RANA keeps a do-not-call list, only dials inside the calling hours you set for each time zone, and we recommend your AI employee says it is an assistant. Call only people who enquired or agreed to be contacted.`],
    [`How much does an AI calling agent cost in ${place}?`, `Plans start at ${money(m.currency, start.price)} a month for ${PRICE_LIST.launch.minutes} connected minutes, with lower per-minute rates on bigger plans. Calls are billed in 30-second pulses, and every workspace starts with a ${TRIAL_DAYS}-day free trial with ${TRIAL_MINUTES} minutes. ${m.taxNote}`],
    FAQ[1], FAQ[2], FAQ[5],
    ["How do I pay?", `By international card. Plans are billed in ${m.currency === "USD" ? "US dollars" : m.currency === "EUR" ? "euros" : m.currency === "JPY" ? "Japanese yen" : "rupees"} and every payment comes with a proper invoice.`],
    FAQ.find(([q]) => q.startsWith("What are the R1 and R2"))!,
    FAQ.find(([q]) => q.startsWith("What is an AI voice agent"))!,
  ];
}

/** Customer-value calculator settings per currency: range, ticks and one-click presets (label, value, % who'd buy). */
export const CALC: Record<string, { min: number; max: number; def: number; ticks: [string, number][]; presets: [string, number, number][] }> = {
  INR: { min: 500, max: 10_00_00_000, def: 75000, ticks: [["₹500", 500], ["₹10K", 1e4], ["₹1 L", 1e5], ["₹10 L", 1e6], ["₹1 Cr", 1e7], ["₹10 Cr", 1e8]],
    presets: [["Clinic patient", 3000, 20], ["Coaching admission", 75000, 10], ["Insurance policy", 30000, 8], ["Car sale", 800000, 3], ["Flat / villa sale", 1_00_00_000, 1]] },
  USD: { min: 10, max: 10_000_000, def: 2500, ticks: [["$10", 10], ["$1K", 1e3], ["$100K", 1e5], ["$10M", 1e7]],
    presets: [["Dental patient", 400, 20], ["Course enrolment", 2500, 10], ["Insurance policy", 900, 8], ["Car sale", 30000, 3], ["Home sale", 450000, 1]] },
  EUR: { min: 10, max: 10_000_000, def: 2000, ticks: [["€10", 10], ["€1K", 1e3], ["€100K", 1e5], ["€10M", 1e7]],
    presets: [["Clinic patient", 350, 20], ["Course enrolment", 2000, 10], ["Insurance policy", 800, 8], ["Car sale", 25000, 3], ["Home sale", 400000, 1]] },
  JPY: { min: 1000, max: 1_000_000_000, def: 300000, ticks: [["¥1K", 1e3], ["¥100K", 1e5], ["¥10M", 1e7], ["¥1B", 1e9]],
    presets: [["Clinic patient", 15000, 20], ["School enrolment", 300000, 10], ["Insurance policy", 120000, 8], ["Car sale", 3500000, 3], ["Home sale", 60000000, 1]] },
};

/** Live-call demos for global markets — one business, one language, one outcome each. */
export const GLOBAL_CALLS: IndustryCall[] = [
  { key: "dental", label: "Dental clinic", lang: "ENGLISH", dir: "INBOUND", number: "+1 ••• ••• 4417", lines: [
    { who: "caller", text: "Hi, I chipped a tooth this morning. Can Dr. Lee see me today?" },
    { who: "ai", text: "Sorry to hear that! Dr. Lee has an opening at 3:40 PM today. Can I have your name and date of birth?" },
    { who: "caller", text: "Emily Carter, March 3rd, 1991." },
    { who: "ai", text: "You're booked for 3:40, Emily. We'll text you the address and the new-patient forms.", tag: "URGENT APPOINTMENT → sent to front desk" },
  ] },
  { key: "realestate", label: "Real estate", lang: "SPANISH", dir: "OUTBOUND", number: "+34 ••• ••• 218", lines: [
    { who: "ai", text: "Hola Carlos, soy la asistente de Costa Homes. Pediste información sobre el ático en Marbella. ¿Tienes dos minutos?" },
    { who: "caller", text: "Sí, claro. ¿Cuál es el precio? ¿Hay opción de hipoteca?" },
    { who: "ai", text: "Desde 480.000 €, y trabajamos con varios bancos para la hipoteca. ¿Te viene bien una visita el sábado?" },
    { who: "caller", text: "El sábado a las 11 me va perfecto.", tag: "HOT LEAD · viewing Saturday 11 AM → sent to sales" },
  ] },
  { key: "hotel", label: "Hotel", lang: "FRENCH", dir: "INBOUND", number: "+33 • •• •• 51 06", lines: [
    { who: "caller", text: "Bonjour, vous avez une chambre double pour vendredi soir ?" },
    { who: "ai", text: "Bonjour ! Oui, il nous reste une chambre double côté jardin à 145 € la nuit. Je la réserve à quel nom ?" },
    { who: "caller", text: "Au nom de Martin, pour deux nuits." },
    { who: "ai", text: "C'est noté, Monsieur Martin — vendredi et samedi. Vous recevrez la confirmation par e-mail.", tag: "BOOKING REQUEST → sent to front desk" },
  ] },
  { key: "ecommerce", label: "E-commerce", lang: "JAPANESE", dir: "OUTBOUND", number: "+81 •• •••• 2210", lines: [
    { who: "ai", text: "こんにちは、ABCストアです。ご注文いただいたスニーカー（12,800円）の配送について確認のお電話です。" },
    { who: "caller", text: "はい。お届け先を渋谷区に変更したいんですが。" },
    { who: "ai", text: "かしこまりました。渋谷区に変更しました。配達の前にドライバーからご連絡します。" },
    { who: "caller", text: "ありがとうございます。", tag: "ORDER CONFIRMED · address change → sent to ops" },
  ] },
  { key: "education", label: "Study abroad", lang: "HINDI", dir: "INBOUND", number: "+971 •• ••• 6634", lines: [
    { who: "caller", text: "Hello, UK mein masters ke liye apply karna hai. September intake abhi open hai?" },
    { who: "ai", text: "Ji haan, September intake open hai. Aapka graduation kis subject mein hai, aur IELTS diya hai?" },
    { who: "caller", text: "B.Com, IELTS mein 7 band." },
    { who: "ai", text: "Bahut badhiya! Kal shaam 6 baje counsellor ke saath free session book kar deti hoon.", tag: "HOT LEAD · counselling tomorrow 6 PM → sent to counsellor" },
  ] },
];

export const marketOf = (k: string) => MARKETS[k as keyof typeof MARKETS] || MARKETS.in;

// ---------- Multi-industry content for the website ----------
export type Line = { who: "caller" | "ai"; text: string; tag?: string };
export type IndustryCall = { key: string; label: string; lang: string; dir: "INBOUND" | "OUTBOUND"; number: string; lines: Line[] };

/** The live call on the homepage cycles through these — one business, one language, one outcome each. */
export const INDUSTRY_CALLS: IndustryCall[] = [
  { key: "clinic", label: "Clinic", lang: "HINDI", dir: "INBOUND", number: "+91 ••••• 30417", lines: [
    { who: "caller", text: "Hello, kal Dr. Sharma available hain? Skin ke liye dikhana hai." },
    { who: "ai", text: "Namaste! Kal Dr. Sharma 10 se 2 baje tak hain. 11:30 ka slot khaali hai — aapka naam bataiye?" },
    { who: "caller", text: "Ritu Verma. 11:30 theek hai." },
    { who: "ai", text: "Ho gaya Ritu ji — kal 11:30, Dr. Sharma. Front desk aapko confirm kar dega.", tag: "APPOINTMENT REQUEST → sent to front desk" },
  ] },
  { key: "realestate", label: "Real estate", lang: "TELUGU", dir: "OUTBOUND", number: "+91 ••••• 88210", lines: [
    { who: "ai", text: "Namaskaram Kiran garu, meeru Kokapet 3BHK project gurinchi enquiry chesaru. Rendu nimishalu matladocha?" },
    { who: "caller", text: "Haa cheppandi. Price range enti? Loan facility unda?" },
    { who: "ai", text: "₹1.2 crore nundi start avtundi, bank loan kuda dorukutundi. Ee Sunday site visit ki vastara?" },
    { who: "caller", text: "Sunday 4 PM ki vastanu.", tag: "HOT LEAD · site visit Sunday 4 PM → sent to sales" },
  ] },
  { key: "ecommerce", label: "E-commerce", lang: "TAMIL", dir: "OUTBOUND", number: "+91 ••••• 51906", lines: [
    { who: "ai", text: "Vanakkam! Neenga order panna ₹2,499 shoes — cash on delivery confirm pannalama?" },
    { who: "caller", text: "Aamaa, aana address maathanum. Anna Nagar." },
    { who: "ai", text: "Sari, Anna Nagar-nu note pannitten. Delivery team ungalai call pannuvaanga." },
    { who: "caller", text: "Okay, thanks.", tag: "ORDER CONFIRMED · address change → sent to ops" },
  ] },
  { key: "education", label: "Education", lang: "TELUGU", dir: "INBOUND", number: "+91 ••••• 42118", lines: [
    { who: "caller", text: "Hello, long-term batch fees enti? Weekend classes unnaya?" },
    { who: "ai", text: "Namaskaram! Undi — weekend batch Saturday, Sunday. Fees EMI lo kuda kattochu. Mee peru cheppandi?" },
    { who: "caller", text: "Sneha. Naku repu demo class kavali." },
    { who: "ai", text: "Done Sneha garu — repu 11 AM demo class ki mee peru rasanu.", tag: "HOT LEAD · demo class → sent to counsellor" },
  ] },
  { key: "insurance", label: "Insurance", lang: "HINGLISH", dir: "OUTBOUND", number: "+91 ••••• 67342", lines: [
    { who: "ai", text: "Hi Mr. Mehta, aapki car insurance 5 din mein expire ho rahi hai. Renewal mein help karun?" },
    { who: "caller", text: "Haan, but premium kitna hoga? Last year se kam ho sakta hai?" },
    { who: "ai", text: "No-claim bonus ke saath premium kam hoga. Hamare advisor aaj hi exact quote ke saath call karenge — 6 baje theek hai?" },
    { who: "caller", text: "Haan, 6 baje call karo.", tag: "RENEWAL LEAD · callback 6 PM → sent to advisor" },
  ] },
  { key: "service", label: "Home services", lang: "ENGLISH", dir: "INBOUND", number: "+91 ••••• 19025", lines: [
    { who: "caller", text: "Hi, my AC stopped cooling since morning. Can someone come today?" },
    { who: "ai", text: "Sorry about that! Which area are you in, and is it a split or window AC?" },
    { who: "caller", text: "Split AC, Madhapur." },
    { who: "ai", text: "Got it — I've raised a service request for Madhapur. A technician will call you within the hour.", tag: "SERVICE REQUEST → sent to dispatch" },
  ] },
];

/** "Who it's for" — the calling jobs RANA takes off each kind of business. */
export const USE_CASES: { key: string; label: string; pain: string; inbound: string[]; outbound: string[]; result: string }[] = [
  { key: "clinic", label: "Clinics & hospitals", pain: "Reception is busy with patients at the counter, so phone enquiries ring out.",
    inbound: ["Answers appointment and timing questions", "Takes appointment requests with name and problem", "Tells callers fees, address and doctor days"],
    outbound: ["Reminds patients the day before", "Calls back missed enquiries", "Follow-up and test-result call reminders"], result: "Fewer no-shows, every enquiry captured" },
  { key: "realestate", label: "Real estate", pain: "Hundreds of portal and ad leads, and only a few are ready for a site visit.",
    inbound: ["Answers project, price and location questions 24×7", "Captures budget, BHK and timeline", "Flags buyers who want to visit"],
    outbound: ["Calls every new portal lead within minutes", "Books site visits", "Re-activates old leads"], result: "Sales team only calls ready buyers" },
  { key: "education", label: "Education & coaching", pain: "Admission season brings more enquiries than counsellors can call back.",
    inbound: ["Fees, batches, timings and eligibility", "Captures student details", "Books demo classes and campus visits"],
    outbound: ["Calls every enquiry the same day", "Fee and admission reminders", "Re-engages students who went quiet"], result: "More admissions from the same leads" },
  { key: "ecommerce", label: "E-commerce & D2C", pain: "Cash-on-delivery orders get refused at the door and return shipping eats the margin.",
    inbound: ["Order status and return questions", "Captures complaints in the customer's language", "Hands angry customers to a person"],
    outbound: ["Confirms COD orders before shipping", "Checks address and landmark", "Abandoned-cart and re-order calls"], result: "Fewer returns, happier customers" },
  { key: "finance", label: "Insurance, loans & finance", pain: "Renewals and applications stall because nobody followed up in time.",
    inbound: ["Explains products and documents needed", "Captures loan or policy requirements", "Routes serious applicants to an advisor"],
    outbound: ["Renewal reminders before expiry", "Application follow-ups", "EMI and payment-due reminders"], result: "More renewals, faster applications" },
  { key: "hospitality", label: "Hotels, restaurants & travel", pain: "The phone rings during service or late at night, and bookings go to competitors.",
    inbound: ["Answers availability, prices and directions", "Takes table, room and tour booking requests", "Works in the guest's language"],
    outbound: ["Confirms bookings a day before", "Feedback calls after the stay", "Offers to past guests"], result: "No missed bookings, even at 11 PM" },
  { key: "auto", label: "Automobile dealers & service", pain: "Test-drive enquiries and service reminders slip through busy showrooms.",
    inbound: ["Model, variant, price and offer questions", "Books test drives", "Service booking and pickup requests"],
    outbound: ["Service-due reminders", "Follows up test-drive leads", "Insurance and warranty renewal calls"], result: "More test drives and service visits" },
  { key: "services", label: "Home & local services", pain: "Every missed call is a job that goes to the next number on Google.",
    inbound: ["Takes service requests with area and problem", "Answers prices and availability", "Urgent jobs flagged for your team"],
    outbound: ["Confirms technician visits", "Annual maintenance reminders", "Review and feedback calls"], result: "Every job captured, any hour" },
];
