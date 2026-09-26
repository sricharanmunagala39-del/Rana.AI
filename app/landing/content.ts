// Pricing and FAQ copy shared by the website and its structured data (app/landing/page.tsx).
export const PLANS = [
  { name: "Starter", price: "9,999", min: "1,000", extra: "₹9", pts: ["1 AI employee", "2 calls at the same time", "Campaigns up to 2,000 numbers", "Shared Indian number"], fee: "₹14,999 setup" },
  { name: "Growth", price: "29,999", min: "3,500", extra: "₹8", pts: ["3 AI employees", "5 calls at the same time", "Campaigns up to 10,000 numbers", "Your own Indian number"], fee: "₹24,999 setup", hi: true },
  { name: "Scale", price: "89,999", min: "12,000", extra: "₹7", pts: ["10 AI employees", "20 calls at the same time", "Campaigns up to 50,000 numbers", "Your own Indian number"], fee: "₹49,999 setup" },
];

export const FAQ: [string, string][] = [
  ["Which businesses is RANA AI for?", "Any business that answers or makes a lot of phone calls: clinics and hospitals, real estate, schools and coaching, e-commerce and D2C brands, insurance and loan companies, hotels and restaurants, automobile dealers and local service businesses. If your team misses calls, calls back late or repeats the same answers all day, RANA can take those calls."],
  ["What happens when I book a demo?", "You fill a short form and we call you within one working day. On a 20-minute call we learn how your calls work today, then show you an AI employee answering and calling for a business like yours, in your customers' language. No slides and no obligation — or start the free trial and build one yourself."],
  ["Will callers know they're talking to an AI?", "It sounds natural and follows the conversation, but we recommend it introduces itself as your assistant. Honesty keeps trust high — and callers mostly care that someone picked up instantly."],
  ["Which languages does it speak?", "11 Indian languages: Telugu, Hindi, Tamil, Kannada, Malayalam, Marathi, Bengali, Gujarati, Punjabi, Odia and English. It can open in one and follow the caller if they switch."],
  ["Can it use my existing business number?", "Trials run on a shared Indian number. Growth and above get their own Indian number; for promotional outbound lists we help you with DLT registration so you stay compliant."],
  ["How fast can we go live?", "You can build and test your first AI employee the same day on the free trial. Done-for-you setups with your scripts and data usually take one to two weeks."],
  ["What happens when my minutes run out?", "Plan minutes are used first. After that, calls continue from a prepaid balance you top up by UPI, card or netbanking — or turn on auto-recharge so campaigns never stop."],
  ["What is an AI voice agent?", "An AI voice agent is software that talks on the phone like a trained staff member. RANA AI answers incoming calls and calls your leads, understands what people say in their own language, answers from your business information, and records, transcribes and scores every call for your team."],
  ["How much does an AI calling agent cost in India?", "RANA AI plans start at ₹9,999 a month for 1,000 connected minutes (about ₹10 a minute), with lower per-minute rates on bigger plans. Calls are billed in 30-second pulses, and every workspace starts with a 14-day free trial with 100 minutes."],
  ["Is AI calling allowed in India? What about TRAI and DND rules?", "Yes, when it follows TRAI's commercial-communication rules. RANA AI only dials inside the calling hours you set (9 AM to 9 PM, Monday to Saturday, by default), keeps a do-not-call list that grows automatically when someone asks not to be called, and stops a campaign outside those hours. For promotional lists you need DLT registration and the right number series, and you should only call people who enquired or agreed to be contacted — we help you set this up."],
  ["Do I get an invoice?", "Yes. Every payment comes with a proper invoice you can download any time from the Billing page."],
];

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
