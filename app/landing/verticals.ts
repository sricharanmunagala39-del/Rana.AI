// Industry home pages (/for/<slug>): one dedicated page per vertical, built on the main homepage. Everything a
// vertical page says differently lives here. Facts only — no invented customers, results or numbers.
import { INDUSTRY_CALLS, USE_CASES, type IndustryCall } from "./content";
import type { DemoKey } from "./talkContent";

export type Vertical = {
  slug: string; key: string; label: string; short: string;
  eyebrow: string; h1a: string; h1b: string; sub: string;
  ticker: string[];
  pains: { t: string; d: string }[];
  inbound: string[]; outbound: string[];
  steps: { t: string; d: string }[];
  call: IndustryCall; demo: DemoKey;
  /** What a "win" is called in this business, e.g. "admission", "site visit". */
  win: string; wins: string;
  /** Missed-call calculator start: value of one customer (₹) and % who'd buy. */
  calc: { value: number; conv: number };
  faq: [string, string][];
  seo: { title: string; description: string; keywords: string[] };
};

const call = (k: string) => INDUSTRY_CALLS.find((c) => c.key === k)!;
const uc = (k: string) => USE_CASES.find((u) => u.key === k)!;

const HOTEL_CALL: IndustryCall = { key: "hotel", label: "Hotel", lang: "ENGLISH + TELUGU", dir: "INBOUND", number: "+91 ••••• 70231", lines: [
  { who: "caller", text: "Hi, do you have a deluxe room for this Saturday, two adults? What's the rate?" },
  { who: "ai", text: "Yes, a deluxe room is available on Saturday. It's ₹5,800 a night with breakfast. Shall I hold it for you?" },
  { who: "caller", text: "Haa, hold cheyyandi. Late check-in untundi, 11 PM." },
  { who: "ai", text: "Tappakunda — Saturday deluxe room, 11 PM check-in ani note chesanu. Front office mee number ki confirm chestaru.", tag: "BOOKING REQUEST · Sat, deluxe, late check-in → sent to front office" },
] };
const IT_CALL: IndustryCall = { key: "saas", label: "IT & SaaS", lang: "ENGLISH", dir: "OUTBOUND", number: "+91 ••••• 55902", lines: [
  { who: "ai", text: "Hi Ankit, this is Rana from CloudDesk. You requested a demo of our HR software a few minutes ago — is now a good time for two quick questions?" },
  { who: "caller", text: "Sure. We're about 120 people, mostly in Pune and Bengaluru." },
  { who: "ai", text: "Thanks. Are you replacing a tool you use today, and when would you want to go live?" },
  { who: "caller", text: "Moving off spreadsheets. Ideally this quarter.", tag: "SQL · 120 seats · this quarter → demo booked with sales" },
] };
const AUTO_CALL: IndustryCall = { key: "auto", label: "Car dealer", lang: "HINDI", dir: "OUTBOUND", number: "+91 ••••• 24618", lines: [
  { who: "ai", text: "Namaste Rahul ji, aapne kal hamari website par SUV ke baare mein poocha tha. Test drive ke liye ek slot book karun?" },
  { who: "caller", text: "Haan, par diesel automatic chahiye. Exchange offer bhi hai kya?" },
  { who: "ai", text: "Diesel automatic available hai, aur exchange offer bhi chal raha hai. Shanivaar 11 baje test drive theek rahega?" },
  { who: "caller", text: "Haan, Shanivaar 11 baje.", tag: "HOT LEAD · test drive Sat 11 AM · exchange → sent to showroom" },
] };

export const VERTICALS: Vertical[] = [
  {
    slug: "education", key: "education", label: "Education", short: "coaching institutes, schools, colleges and edtech",
    eyebrow: "AI calling for coaching institutes, schools & colleges", h1a: "Every enquiry called.", h1b: "More admissions.",
    sub: "RANA calls every new enquiry within a minute — in Telugu, Hindi, Tamil or English — answers fees, batches and timings, books demo classes, and sends your counsellors only the parents and students who are ready.",
    ticker: ["Calling a NEET enquiry in Telugu", "Booking a demo class for Saturday", "Answering a fee question at 9 PM", "Reminding a parent about the fee deadline", "Re-engaging last season's enquiries"],
    pains: [
      { t: "Enquiries wait until tomorrow", d: "Ad and website enquiries arrive all day. Counsellors call back hours later, when the parent has already spoken to another institute." },
      { t: "Admission season overwhelms the desk", d: "Result days and new-batch launches bring more calls than your team can answer. The phone rings out during peak hours." },
      { t: "Old enquiries are never called again", d: "Last season's list sits in an Excel sheet. Many of those families still need a course — nobody asks them." },
    ],
    inbound: uc("education").inbound, outbound: uc("education").outbound,
    steps: [
      { t: "Share your courses and fees", d: "Batches, timings, fees, EMI options, eligibility and your brochure. RANA writes the counselling script." },
      { t: "Connect your enquiry sources", d: "Website forms, Meta and Google ad leads, or a daily Excel list. New enquiries get a call within about a minute." },
      { t: "Counsellors get ready parents", d: "Every call is scored. Hot leads and demo-class bookings go to your counsellors on WhatsApp the moment the call ends." },
    ],
    call: call("education"), demo: "sales", win: "admission", wins: "admissions",
    calc: { value: 75000, conv: 10 },
    faq: [
      ["Can it handle parents and students in Telugu or Hindi?", "Yes. RANA speaks 11 Indian languages including Telugu, Hindi, Tamil and Kannada, and switches when the caller does — common when a student starts in English and a parent continues in Telugu."],
      ["Will it replace my counsellors?", "No. It takes the first call, the after-hours calls and the reminders, so your counsellors spend their time with parents who are ready to join."],
      ["Can it call last season's enquiries?", "Yes — that's the easiest place to start. Upload the list and RANA calls everyone during permitted hours, then shows you who is still interested. Ask for a free proof run."],
    ],
    seo: { title: "AI Calling for Coaching Institutes & Schools | RANA AI", description: "RANA AI calls every admission enquiry within a minute in Telugu, Hindi, Tamil or English, books demo classes and sends counsellors only ready parents. Free proof run.", keywords: ["ai calling for coaching institutes", "admission enquiry calling", "ai telecaller for education", "coaching institute lead follow up", "school admission calls ai", "telugu ai calling agent"] },
  },
  {
    slug: "real-estate", key: "realestate", label: "Real estate", short: "developers, brokers and channel partners",
    eyebrow: "AI calling for real-estate developers & brokers", h1a: "Every portal lead called.", h1b: "Only ready buyers for sales.",
    sub: "RANA calls every portal, ad and website lead within minutes, asks budget, location, BHK and timeline, books site visits, and sends your sales team only the buyers who are ready to visit.",
    ticker: ["Calling a portal lead in Telugu", "Booking a Sunday site visit", "Asking budget and loan needs", "Answering a price question at 10 PM", "Re-activating last quarter's leads"],
    pains: [
      { t: "Hundreds of leads, few real buyers", d: "Portals and ads send volume. Your sales team spends the day calling people who were just browsing." },
      { t: "Speed decides who gets the visit", d: "Buyers enquire on several projects at once. The first developer to call usually gets the site visit." },
      { t: "Weekend and evening calls go unanswered", d: "Buyers call when they're free — evenings and Sundays — exactly when your office is shut or busy with visitors." },
    ],
    inbound: uc("realestate").inbound, outbound: uc("realestate").outbound,
    steps: [
      { t: "Share your projects", d: "Locations, configurations, price bands, possession dates, loan tie-ups and brochures." },
      { t: "Connect your lead sources", d: "Portal leads, Meta and Google ads, your website, or a daily list. Each new lead is called within minutes." },
      { t: "Sales gets site visits", d: "Every lead is qualified on budget, timeline and loan need. Booked visits go to your sales team instantly." },
    ],
    call: call("realestate"), demo: "qualify", win: "site visit", wins: "site visits",
    calc: { value: 1_00_00_000, conv: 1 },
    faq: [
      ["Can it qualify buyers properly?", "Yes. It asks what a good sales executive asks — budget, location, configuration, timeline, loan or cash — and labels each lead hot, warm or cold with a one-line reason."],
      ["Does it work with portal leads?", "Yes. Leads can come in through a webhook, Zapier or Make, or a daily upload. RANA calls each new lead within minutes during permitted hours."],
      ["Will it follow up leads who didn't pick up?", "Yes. Unanswered numbers are retried at sensible intervals, within calling-hour rules, and anyone who says no is never called again."],
    ],
    seo: { title: "AI Calling for Real Estate Developers & Brokers | RANA AI", description: "RANA AI calls every portal and ad lead within minutes, qualifies budget and timeline, and books site visits in Telugu, Hindi and English. Free proof run.", keywords: ["ai calling for real estate", "real estate lead qualification", "site visit booking ai", "real estate ai voice agent india", "ai telecaller real estate"] },
  },
  {
    slug: "healthcare", key: "clinic", label: "Healthcare", short: "clinics, hospitals and diagnostic centres",
    eyebrow: "AI receptionist for clinics, hospitals & diagnostics", h1a: "Every patient call answered.", h1b: "Even when reception is busy.",
    sub: "RANA answers appointment calls when your front desk is with patients, tells callers doctor timings and fees, takes appointment requests, and reminds patients the day before.",
    ticker: ["Booking a skin consult in Hindi", "Telling a caller Sunday timings", "Reminding a patient about tomorrow", "Answering a test-price question", "Calling back a missed enquiry"],
    pains: [
      { t: "The desk can't answer and attend at once", d: "When the receptionist is with a patient at the counter, the phone rings out — and that patient books elsewhere." },
      { t: "No-shows waste doctor slots", d: "Patients forget appointments. Reminder calls take staff time nobody has." },
      { t: "The same five questions all day", d: "Timings, fees, doctor days, location, reports. Your staff repeat them hundreds of times a week." },
    ],
    inbound: uc("clinic").inbound, outbound: uc("clinic").outbound,
    steps: [
      { t: "Share doctors and timings", d: "Doctors, specialities, days, fees, tests and prices, location and parking." },
      { t: "Forward your number when busy", d: "Calls that aren't picked up in a few rings, or after hours, go to RANA." },
      { t: "Front desk gets requests", d: "Appointment requests arrive on WhatsApp with name, problem and preferred time, ready to confirm." },
    ],
    call: call("clinic"), demo: "booking", win: "appointment", wins: "appointments",
    calc: { value: 3000, conv: 20 },
    faq: [
      ["Does it give medical advice?", "No. It answers practical questions — timings, fees, doctors, tests — and takes appointment requests. Anything clinical goes to your staff."],
      ["Can it book directly into our system?", "It sends appointment requests to your front desk on WhatsApp or email. Direct booking into your software can be set up through a webhook on request."],
      ["Is patient information safe?", "Calls, recordings and transcripts stay in your own RANA account, visible only to your team."],
    ],
    seo: { title: "AI Receptionist for Clinics & Hospitals in India | RANA AI", description: "RANA AI answers patient calls when reception is busy, takes appointment requests and sends reminders in Hindi, Telugu, Tamil and more. Free trial.", keywords: ["ai receptionist for clinic", "hospital appointment booking ai", "clinic call answering", "patient reminder calls", "ai receptionist india"] },
  },
  {
    slug: "hospitality", key: "hospitality", label: "Hospitality", short: "hotels, resorts, restaurants and travel",
    eyebrow: "AI reservations desk for hotels, restaurants & travel", h1a: "No missed bookings.", h1b: "Even at 11 PM.",
    sub: "RANA answers availability, rate and direction questions in the guest's language, takes room, table and tour booking requests at any hour, and confirms bookings the day before.",
    ticker: ["Holding a deluxe room for Saturday", "Taking a table booking for eight", "Answering a late check-in question", "Confirming tomorrow's arrivals", "Calling past guests with an offer"],
    pains: [
      { t: "The phone rings during service", d: "At check-in rush or dinner service, nobody can answer — and the guest books the next hotel on the list." },
      { t: "Night calls go to voicemail", d: "Travellers plan late. Calls after the front office closes are bookings you never see." },
      { t: "Guests ask in many languages", d: "Domestic and foreign guests call in Hindi, Telugu, Tamil or English. Your staff can't cover them all." },
    ],
    inbound: uc("hospitality").inbound, outbound: uc("hospitality").outbound,
    steps: [
      { t: "Share rooms, menus and policies", d: "Room types, rates, inclusions, check-in rules, restaurant timings and directions." },
      { t: "Forward overflow and night calls", d: "Calls you can't pick up go to RANA, any hour." },
      { t: "Front office gets requests", d: "Booking requests arrive with dates, guests and special requests, ready to confirm." },
    ],
    call: HOTEL_CALL, demo: "booking", win: "booking", wins: "bookings",
    calc: { value: 6000, conv: 25 },
    faq: [
      ["Can it confirm a booking itself?", "It takes the booking request with dates, guests and details and sends it to your front office to confirm against your system. Direct integration can be set up through a webhook."],
      ["Does it work for restaurants too?", "Yes — table bookings, timings, menu questions and large-group requests."],
      ["Can it speak to foreign guests?", "Yes. Besides 11 Indian languages it speaks English, Spanish, French and Japanese."],
    ],
    seo: { title: "AI Receptionist for Hotels & Restaurants | RANA AI", description: "RANA AI answers hotel and restaurant calls 24×7, takes booking requests in the guest's language and confirms arrivals. Free trial.", keywords: ["ai receptionist for hotel", "hotel reservation calls ai", "restaurant table booking ai", "resort booking voice agent"] },
  },
  {
    slug: "it-saas", key: "saas", label: "IT & SaaS", short: "software companies, IT services and B2B teams",
    eyebrow: "AI SDR for IT services, SaaS & B2B companies", h1a: "Every demo request called.", h1b: "In under a minute.",
    sub: "RANA calls every inbound demo request and trial sign-up within a minute, asks your qualification questions, books meetings for your sales team, and follows up trials and renewals.",
    ticker: ["Qualifying a demo request", "Booking a meeting for Thursday", "Following up a trial sign-up", "Reminding a customer about renewal", "Answering a pricing question"],
    pains: [
      { t: "Inbound leads cool off in hours", d: "A prospect who fills your form is comparing three vendors. The one who calls first usually gets the meeting." },
      { t: "SDRs spend time on bad fits", d: "Students, job seekers and tiny teams fill demo forms too. Your SDRs call them all before finding real buyers." },
      { t: "Trials and renewals go quiet", d: "Trial users never get a call, and renewal reminders slip when the team is busy closing new deals." },
    ],
    inbound: ["Answers product, pricing and plan questions", "Captures company size, use case and timeline", "Routes qualified prospects to the right salesperson"],
    outbound: ["Calls every demo request within a minute", "Trial follow-up and onboarding check-ins", "Renewal and upgrade reminders"],
    steps: [
      { t: "Share your ICP and questions", d: "Who you sell to, plans and pricing, and the questions your SDRs ask (BANT, team size, timeline)." },
      { t: "Connect your forms and CRM", d: "Website forms and trial sign-ups via webhook, Zapier or Make. Results go back to your CRM." },
      { t: "Sales gets booked meetings", d: "Qualified prospects get a meeting slot; your team gets a summary and the recording before the call." },
    ],
    call: IT_CALL, demo: "qualify", win: "meeting", wins: "meetings",
    calc: { value: 200000, conv: 5 },
    faq: [
      ["Does it work in English for B2B buyers?", "Yes. It speaks clear English (and Hindi and other Indian languages), sounds natural and handles questions and interruptions."],
      ["Can it update our CRM?", "Call results, summaries and lead scores can be sent to HubSpot, Salesforce, Zoho or any CRM through a webhook or Zapier / Make."],
      ["Can it call international prospects?", "Yes, on the R2 engine, in English, Spanish, French or Japanese, with local numbers set up on request."],
    ],
    seo: { title: "AI SDR & Lead Qualification Calls for IT and SaaS | RANA AI", description: "RANA AI calls every demo request and trial sign-up within a minute, qualifies the lead and books meetings for your sales team. Free trial.", keywords: ["ai sdr", "ai lead qualification calls", "saas demo request follow up", "b2b ai calling agent", "inbound lead calling ai"] },
  },
  {
    slug: "ecommerce", key: "ecommerce", label: "E-commerce", short: "online stores and D2C brands",
    eyebrow: "AI calling for e-commerce & D2C brands", h1a: "Confirm every COD order.", h1b: "Cut returns before they ship.",
    sub: "RANA confirms cash-on-delivery orders before dispatch, checks address and landmark in the customer's language, answers order-status calls, and follows up abandoned carts.",
    ticker: ["Confirming a COD order in Tamil", "Fixing an address before dispatch", "Answering an order-status call", "Calling an abandoned cart", "Taking a return request"],
    pains: [
      { t: "COD orders get refused at the door", d: "Unconfirmed cash-on-delivery orders come back, and you pay shipping both ways." },
      { t: "Wrong addresses delay delivery", d: "Incomplete addresses and missing landmarks cause failed deliveries and angry customers." },
      { t: "Support lines overflow at sale time", d: "During sales, 'where is my order' calls swamp your support team." },
    ],
    inbound: uc("ecommerce").inbound, outbound: uc("ecommerce").outbound,
    steps: [
      { t: "Connect your store", d: "New orders arrive via webhook, Zapier or Make from your store platform, or a daily upload." },
      { t: "RANA calls before dispatch", d: "Each COD order is confirmed, the address checked and changes noted, in the customer's language." },
      { t: "Ops gets clean orders", d: "Confirmed, changed and cancelled orders go back to your team or sheet automatically." },
    ],
    call: call("ecommerce"), demo: "support", win: "order saved", wins: "orders saved",
    calc: { value: 1500, conv: 30 },
    faq: [
      ["Which store platforms work?", "Any platform that can send a webhook, or connect through Zapier or Make. You can also upload a daily order list."],
      ["Can it handle angry customers?", "It stays calm, captures the complaint and hands upset or complex cases to a person."],
      ["Which languages?", "11 Indian languages including Hindi, Tamil, Telugu, Kannada, Bengali and Marathi, switching when the customer does."],
    ],
    seo: { title: "COD Order Confirmation Calls & AI Support for E-commerce | RANA AI", description: "RANA AI confirms COD orders before dispatch, checks addresses and answers order-status calls in 11 Indian languages. Free trial.", keywords: ["cod confirmation calls", "ecommerce ai calling", "ndr calls ai", "d2c customer support ai", "order confirmation ivr alternative"] },
  },
  {
    slug: "finance", key: "finance", label: "Finance & insurance", short: "insurance, loans, NBFCs and fintechs",
    eyebrow: "AI calling for insurance, loans & NBFCs", h1a: "Every renewal reminded.", h1b: "Every applicant followed up.",
    sub: "RANA reminds customers before policies expire and EMIs fall due, follows up incomplete loan applications, explains documents needed, and routes serious applicants to your advisors.",
    ticker: ["Reminding a car insurance renewal", "Following up a loan application", "Explaining documents needed", "Booking an advisor callback", "Sending an EMI-due reminder"],
    pains: [
      { t: "Renewals lapse quietly", d: "Policies expire because nobody called in time — and the customer renews with someone else." },
      { t: "Applications stall halfway", d: "Applicants drop off when documents are pending and nobody follows up." },
      { t: "Advisors chase cold leads", d: "Your advisors spend hours calling people who were never going to buy." },
    ],
    inbound: uc("finance").inbound, outbound: uc("finance").outbound,
    steps: [
      { t: "Share products and rules", d: "Products, documents needed, eligibility basics and what advisors should handle." },
      { t: "Upload renewal and lead lists", d: "Renewals due, pending applications and new leads, daily or through a webhook." },
      { t: "Advisors get ready customers", d: "Interested customers get an advisor callback slot; your team sees who and why." },
    ],
    call: call("insurance"), demo: "followup", win: "renewal", wins: "renewals",
    calc: { value: 30000, conv: 8 },
    faq: [
      ["Does it give financial advice?", "No. It reminds, explains documents and captures requirements. Quotes and advice come from your licensed advisors."],
      ["Is it compliant with calling rules?", "It calls only in the hours you set, keeps a do-not-call list automatically, and only calls customers and applicants who are yours. For promotional lists, DLT registration applies."],
      ["Can it do collection calls?", "It can send polite EMI-due reminders. Recovery and negotiation stay with your team."],
    ],
    seo: { title: "AI Calling for Insurance Renewals, Loans & NBFCs | RANA AI", description: "RANA AI makes renewal reminders, loan application follow-ups and EMI reminders in 11 Indian languages, and routes serious customers to advisors.", keywords: ["insurance renewal calls ai", "loan application follow up ai", "emi reminder calls", "ai calling for nbfc", "ai calling insurance india"] },
  },
  {
    slug: "automobile", key: "auto", label: "Automobile", short: "car and two-wheeler dealerships and service centres",
    eyebrow: "AI calling for car & two-wheeler dealerships", h1a: "More test drives.", h1b: "Full service bays.",
    sub: "RANA calls every website and walk-in enquiry, books test drives, sends service-due reminders, and follows up insurance and warranty renewals — in Hindi, Telugu, Tamil and more.",
    ticker: ["Booking a Saturday test drive", "Reminding a car's first service", "Following up an SUV enquiry", "Answering an on-road price question", "Calling an insurance renewal"],
    pains: [
      { t: "Enquiries cool off before a test drive", d: "Website and walk-in enquiries need a quick, persistent follow-up that busy sales staff can't give every lead." },
      { t: "Service reminders slip", d: "Service-due and free-service reminders are missed, and customers drift to local garages." },
      { t: "Showroom phones ring out on weekends", d: "Saturdays and Sundays are busiest on the floor — and on the phone." },
    ],
    inbound: uc("auto").inbound, outbound: uc("auto").outbound,
    steps: [
      { t: "Share models, offers and service rules", d: "Models, variants, price ranges, current offers and service intervals." },
      { t: "Upload enquiries and service lists", d: "New enquiries and service-due customers, daily or through your DMS via webhook." },
      { t: "Showroom gets bookings", d: "Test drives and service bookings arrive with customer, model and slot." },
    ],
    call: AUTO_CALL, demo: "qualify", win: "test drive", wins: "test drives",
    calc: { value: 800000, conv: 3 },
    faq: [
      ["Can it quote on-road prices?", "It can share the price ranges and offers you give it, and passes exact quotes to your sales team."],
      ["Does it work for service centres?", "Yes — service-due reminders, booking requests and pickup requests."],
      ["Two-wheelers too?", "Yes. Any dealership that runs on enquiries and reminders."],
    ],
    seo: { title: "AI Calling for Car & Bike Dealerships | RANA AI", description: "RANA AI follows up every enquiry, books test drives and sends service reminders for car and two-wheeler dealers in 11 Indian languages.", keywords: ["ai calling for car dealers", "test drive booking ai", "service reminder calls", "automobile dealer ai voice agent"] },
  },
];

/** "a" or "an" before a word. */
export const art = (w: string) => (/^[aeiou]/i.test(w) ? "an" : "a");
export const verticalOf = (slug: string) => VERTICALS.find((v) => v.slug === slug);
/** Homepage "who it's for" tab key → its industry page. */
export const VERTICAL_BY_KEY: Record<string, string> = Object.fromEntries(VERTICALS.map((v) => [v.key, v.slug]));
