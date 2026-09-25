// Pricing and FAQ copy shared by the website and its structured data (app/landing/page.tsx).
export const PLANS = [
  { name: "Starter", price: "9,999", min: "1,000", extra: "₹9", pts: ["1 AI employee", "2 calls at the same time", "Campaigns up to 2,000 numbers", "Shared Indian number"], fee: "₹14,999 setup" },
  { name: "Growth", price: "29,999", min: "3,500", extra: "₹8", pts: ["3 AI employees", "5 calls at the same time", "Campaigns up to 10,000 numbers", "Your own Indian number"], fee: "₹24,999 setup", hi: true },
  { name: "Scale", price: "89,999", min: "12,000", extra: "₹7", pts: ["10 AI employees", "20 calls at the same time", "Campaigns up to 50,000 numbers", "Your own Indian number"], fee: "₹49,999 setup" },
];

export const FAQ: [string, string][] = [
  ["Will callers know they're talking to an AI?", "It sounds natural and follows the conversation, but we recommend it introduces itself as your assistant. Honesty keeps trust high — and callers mostly care that someone picked up instantly."],
  ["Which languages does it speak?", "11 Indian languages: Telugu, Hindi, Tamil, Kannada, Malayalam, Marathi, Bengali, Gujarati, Punjabi, Urdu and English. It can open in one and follow the caller if they switch."],
  ["Can it use my existing business number?", "Trials run on a shared Indian number. Growth and above get their own Indian number; for promotional outbound lists we help you with DLT registration so you stay compliant."],
  ["How fast can we go live?", "You can build and test your first AI employee the same day on the free trial. Done-for-you setups with your scripts and data usually take one to two weeks."],
  ["What happens when my minutes run out?", "Plan minutes are used first. After that, calls continue from a prepaid balance you top up by UPI, card or netbanking — or turn on auto-recharge so campaigns never stop."],
  ["What is an AI voice agent?", "An AI voice agent is software that talks on the phone like a trained staff member. RANA AI answers incoming calls and calls your leads, understands what people say in their own language, answers from your business information, and records, transcribes and scores every call for your team."],
  ["How much does an AI calling agent cost in India?", "RANA AI plans start at ₹9,999 a month for 1,000 connected minutes (about ₹10 a minute), with lower per-minute rates on bigger plans. Calls are billed in 30-second pulses, and every workspace starts with a 14-day free trial with 100 minutes."],
  ["Is AI calling allowed in India? What about TRAI and DND rules?", "Yes, when it follows TRAI's commercial-communication rules. RANA AI only dials inside the calling hours you set (9 AM to 9 PM, Monday to Saturday, by default), keeps a do-not-call list that grows automatically when someone asks not to be called, and stops a campaign outside those hours. For promotional lists you need DLT registration and the right number series, and you should only call people who enquired or agreed to be contacted — we help you set this up."],
  ["Do I get an invoice?", "Yes. Every payment comes with a proper invoice you can download any time from the Billing page."],
];
