// Personalised call plan for one prospect. Built from templates + verified facts only: the script may mention
// a signal only when it was seen on the company's own page, never claims results, customers or prices,
// and always opens by saying it is an AI assistant calling for RANA AI.
import type { CampaignConfig, Evidence, Lang, OutreachPlan, Prospect } from "./types";
import { bestContact } from "./scoring";

type T = {
  hello: (person: string | null, company: string) => string;
  permission: string;
  sawSignal: (label: string) => string;
  noSignal: (industry: string) => string;
  help: (useCase: string) => string;
  demo: string;
  receptionist: (role: string) => string;
  followUp: string;
  objections: [string, string][];
  defaultQs: string[];
};

const IND: Record<string, Record<Lang, string>> = {
  real_estate: { en: "real-estate", hi: "real estate", te: "రియల్ ఎస్టేట్", "te-en": "real estate" },
  education: { en: "education and coaching", hi: "education aur coaching", te: "విద్య, కోచింగ్", "te-en": "education, coaching" },
  healthcare: { en: "healthcare", hi: "healthcare", te: "హెల్త్‌కేర్", "te-en": "healthcare" },
  recruitment: { en: "recruitment", hi: "recruitment", te: "రిక్రూట్‌మెంట్", "te-en": "recruitment" },
  hospitality: { en: "hospitality", hi: "hotel aur hospitality", te: "హోటల్", "te-en": "hotel" },
  other: { en: "your", hi: "aapke", te: "మీ", "te-en": "mee" },
};

const SIGNAL_TEXT: Record<string, Record<Lang, string>> = {
  site_visit: { en: "you take site-visit bookings", hi: "aap site visit book karte hain", te: "మీరు సైట్ విజిట్ బుకింగ్స్ తీసుకుంటారు", "te-en": "meeru site visit bookings teesukuntaru" },
  enquiries: { en: "you ask visitors to enquire or request a call back", hi: "aap logon se enquiry ya call back maangte hain", te: "మీరు ఎంక్వయిరీ లేదా కాల్ బ్యాక్ అడుగుతారు", "te-en": "meeru enquiry leda call back adugutaru" },
  admissions: { en: "you're taking admissions and course enquiries", hi: "aapke yahan admissions aur course enquiries chal rahi hain", te: "మీ దగ్గర అడ్మిషన్లు, కోర్సు ఎంక్వయిరీలు జరుగుతున్నాయి", "te-en": "mee daggara admissions, course enquiries jarugutunnayi" },
  appointments: { en: "you take appointment bookings", hi: "aap appointments book karte hain", te: "మీరు అపాయింట్‌మెంట్లు బుక్ చేస్తారు", "te-en": "meeru appointments book chestaru" },
  support: { en: "you run a customer helpline", hi: "aapki customer helpline hai", te: "మీకు కస్టమర్ హెల్ప్‌లైన్ ఉంది", "te-en": "meeku customer helpline undi" },
  recruitment: { en: "you handle candidate and hiring enquiries", hi: "aap candidates ki enquiries handle karte hain", te: "మీరు క్యాండిడేట్ ఎంక్వయిరీలు చూస్తారు", "te-en": "meeru candidate enquiries chustaru" },
  follow_ups: { en: "your team calls leads back", hi: "aapki team leads ko call back karti hai", te: "మీ టీమ్ లీడ్స్‌కి కాల్ బ్యాక్ చేస్తుంది", "te-en": "mee team leads ki call back chestundi" },
};

const TPL: Record<Lang, T> = {
  en: {
    hello: (p, c) => `Hello${p ? ` ${p}` : ""}, this is Rana — an AI assistant calling on behalf of RANA AI, a Hyderabad company that builds AI voice agents. I'm calling ${c} about how you handle phone enquiries.`,
    permission: "Is now an okay time for a two-minute conversation?",
    sawSignal: (l) => `I saw on your website that ${l}.`,
    noSignal: (i) => `We work with ${i} businesses that get a lot of phone enquiries.`,
    help: (u) => `RANA AI ${u}. It can answer or make calls in English, Hindi and Telugu and send your team the details.`,
    demo: "Would a short 20-minute demo be useful, so you can hear it on your own type of calls?",
    receptionist: (r) => `Hello, this is Rana, an AI assistant calling for RANA AI about phone automation. Could you tell me who looks after ${r}, or the best way to reach them?`,
    followUp: "If they asked for time or information: one follow-up at the time they chose, then stop.",
    objections: [
      ["I'm busy", "Of course — when would be a better time for a two-minute call back?"],
      ["We already have a team for calls", "That makes sense. Many teams use it only for after-hours or overflow calls so nothing is missed. Would that be worth a quick look?"],
      ["How much does it cost?", "It depends on call volume, so I won't guess a number — the demo covers pricing for your case."],
      ["Send me details on email", "Happy to. Which email should the details go to?"],
      ["Is this a robot / AI?", "Yes, I'm an AI assistant calling for RANA AI. I can connect you with a person from our team if you prefer."],
      ["Not interested", "Understood, thank you for your time. Should we not contact you again?"],
    ],
    defaultQs: ["Roughly how many enquiry calls do you get in a day?", "What happens to calls that come in after hours or when the team is busy?"],
  },
  hi: {
    hello: (p, c) => `Namaste${p ? ` ${p} ji` : ""}, main Rana hoon — RANA AI ki taraf se baat kar rahi ek AI assistant. RANA AI Hyderabad ki company hai jo AI voice agents banati hai. Main ${c} se phone enquiries ke baare mein baat karna chahti thi.`,
    permission: "Kya abhi do minute baat kar sakte hain?",
    sawSignal: (l) => `Maine aapki website par dekha ki ${l}.`,
    noSignal: (i) => `Hum ${i} businesses ke saath kaam karte hain jinke paas bahut phone enquiries aati hain.`,
    help: (u) => `RANA AI ${u}. Yeh English, Hindi aur Telugu mein calls utha bhi sakta hai aur kar bhi sakta hai, aur details aapki team ko bhej deta hai.`,
    demo: "Kya 20 minute ka ek chhota demo dekhna theek rahega, aapke jaise calls par?",
    receptionist: (r) => `Namaste, main Rana hoon, RANA AI ki AI assistant, phone automation ke baare mein call kiya hai. ${r} kaun dekhte hain, ya unse baat karne ka sahi tareeka kya hai?`,
    followUp: "Agar unhone time ya information maangi: unke bataye time par ek follow-up, phir band.",
    objections: [
      ["Abhi busy hoon", "Bilkul — do minute ke liye kab call karun?"],
      ["Hamare paas team hai", "Samajh gayi. Kai teams ise sirf office hours ke baad ya busy time ke calls ke liye use karti hain. Ek baar dekhna chahenge?"],
      ["Kitna kharcha hai?", "Yeh call volume par depend karta hai, isliye main andaaza nahi lagaungi — demo mein aapke hisaab se pricing bata denge."],
      ["Email par bhej do", "Zaroor. Kis email par bhejun?"],
      ["Kya yeh AI hai?", "Haan, main RANA AI ki AI assistant hoon. Chahein to hamari team ka koi vyakti aapse baat kar sakta hai."],
      ["Interest nahi hai", "Theek hai, aapke samay ke liye dhanyavaad. Kya hum aapko dobara call na karein?"],
    ],
    defaultQs: ["Din mein lagbhag kitni enquiry calls aati hain?", "Office time ke baad ya busy hone par jo calls aati hain unka kya hota hai?"],
  },
  te: {
    hello: (p, c) => `నమస్కారం${p ? ` ${p} గారు` : ""}, నేను రానా — RANA AI తరఫున మాట్లాడుతున్న AI అసిస్టెంట్‌ని. RANA AI హైదరాబాద్‌లో AI వాయిస్ ఏజెంట్లు తయారు చేసే కంపెనీ. ${c} లో ఫోన్ ఎంక్వయిరీల గురించి మాట్లాడటానికి కాల్ చేశాను.`,
    permission: "ఇప్పుడు రెండు నిమిషాలు మాట్లాడొచ్చా?",
    sawSignal: (l) => `మీ వెబ్‌సైట్‌లో చూశాను — ${l}.`,
    noSignal: (i) => `ఎక్కువ ఫోన్ ఎంక్వయిరీలు వచ్చే ${i} బిజినెస్‌లతో మేము పని చేస్తాం.`,
    help: (u) => `RANA AI ${u}. ఇది ఇంగ్లీష్, హిందీ, తెలుగులో కాల్స్ తీసుకుంటుంది, చేస్తుంది, వివరాలు మీ టీమ్‌కి పంపుతుంది.`,
    demo: "మీ లాంటి కాల్స్ మీద 20 నిమిషాల చిన్న డెమో చూస్తారా?",
    receptionist: (r) => `నమస్కారం, నేను రానా, RANA AI తరఫున AI అసిస్టెంట్‌ని, ఫోన్ ఆటోమేషన్ గురించి కాల్ చేశాను. ${r} ఎవరు చూస్తారు, లేదా వారిని ఎలా కాంటాక్ట్ చేయాలి?`,
    followUp: "సమయం లేదా సమాచారం అడిగితే: వాళ్లు చెప్పిన సమయానికి ఒక ఫాలో-అప్, తర్వాత ఆపేయాలి.",
    objections: [
      ["ఇప్పుడు బిజీ", "సరే — రెండు నిమిషాలకి ఎప్పుడు కాల్ చేయమంటారు?"],
      ["మాకు టీమ్ ఉంది", "అర్థమైంది. చాలా టీమ్‌లు ఆఫీస్ టైమ్ తర్వాత లేదా బిజీ టైమ్ కాల్స్ కోసం మాత్రమే వాడతాయి. ఒకసారి చూస్తారా?"],
      ["ఎంత ఖర్చు?", "అది కాల్స్ సంఖ్య మీద ఆధారపడుతుంది, అందుకే అంచనా చెప్పను — డెమోలో మీకు సరిపోయే ధర చెప్తాం."],
      ["ఈమెయిల్ పంపండి", "తప్పకుండా. ఏ ఈమెయిల్‌కి పంపాలి?"],
      ["ఇది AI నా?", "అవును, నేను RANA AI తరఫున AI అసిస్టెంట్‌ని. కావాలంటే మా టీమ్‌లో ఒకరు మీతో మాట్లాడతారు."],
      ["ఆసక్తి లేదు", "సరే, మీ సమయానికి ధన్యవాదాలు. మళ్ళీ కాల్ చేయకూడదా?"],
    ],
    defaultQs: ["రోజుకి సుమారు ఎన్ని ఎంక్వయిరీ కాల్స్ వస్తాయి?", "ఆఫీస్ టైమ్ తర్వాత లేదా బిజీగా ఉన్నప్పుడు వచ్చే కాల్స్ ఏమవుతాయి?"],
  },
  "te-en": {
    hello: (p, c) => `Namaskaram${p ? ` ${p} garu` : ""}, nenu Rana — RANA AI tarapuna matladutunna AI assistant ni. RANA AI Hyderabad lo AI voice agents chese company. ${c} lo phone enquiries gurinchi matladataniki call chesanu.`,
    permission: "Ippudu two minutes matladocha?",
    sawSignal: (l) => `Mee website lo chusanu — ${l}.`,
    noSignal: (i) => `Ekkuva phone enquiries vache ${i} businesses tho memu work chestam.`,
    help: (u) => `RANA AI ${u}. Idi English, Hindi, Telugu lo calls teesukuntundi, chestundi, details mee team ki pamputundi.`,
    demo: "Mee lanti calls meeda 20 minutes chinna demo chustara?",
    receptionist: (r) => `Namaskaram, nenu Rana, RANA AI tarapuna AI assistant ni, phone automation gurinchi call chesanu. ${r} evaru chustaru, leda vallani ela contact cheyali?`,
    followUp: "Time leda info adigite: vallu cheppina time ki oka follow-up, tarvata aapeyali.",
    objections: [
      ["Ippudu busy", "Sare — two minutes ki eppudu call cheyamantaru?"],
      ["Maaku team undi", "Ardham aindi. Chala teams office time tarvata leda busy time calls kosam matrame vadatayi. Okasari chustara?"],
      ["Entha cost?", "Adi calls number meeda depend avutundi, anduke guess cheyanu — demo lo meeku saripoye price cheptam."],
      ["Email pampandi", "Tappakunda. Ye email ki pampali?"],
      ["Idi AI na?", "Avunu, nenu RANA AI AI assistant ni. Kavalante maa team lo okaru meetho matladataru."],
      ["Interest ledu", "Sare, mee time ki thanks. Malli call cheyakudada?"],
    ],
    defaultQs: ["Roju ki approximate ga enni enquiry calls vastayi?", "Office time tarvata leda busy ga unnappudu vache calls emavutayi?"],
  },
};

const ROLE_PHRASE: Record<Lang, string> = { en: "sales or customer calls", hi: "sales ya customer calls", te: "సేల్స్ లేదా కస్టమర్ కాల్స్", "te-en": "sales leda customer calls" };

export function buildOutreach(p: Prospect, cfg: CampaignConfig): OutreachPlan {
  const lang = cfg.language;
  const t = TPL[lang];
  const best = bestContact(p);
  const first = best.person?.decisionMaker && best.person.name ? best.person.name.replace(/^(Dr|Mr|Mrs|Ms|Prof)\.?\s/i, "").split(" ")[0] : null;
  const title = best.person?.name && /^dr\.?\s/i.test(best.person.name) ? `Dr ${best.person.name.replace(/^dr\.?\s*/i, "").split(" ")[0]}` : first;
  const ind = (IND[cfg.industry] || IND.other)[lang];
  // Lean only on signals seen on their site, strongest first.
  const order = ["site_visit", "admissions", "appointments", "recruitment", "enquiries", "follow_ups", "support"];
  const sig = order.map((k) => p.signals.find((s) => s.key === k)).find((s) => s && SIGNAL_TEXT[s.key]);
  const groundedOn: Evidence[] = [];
  if (sig) groundedOn.push({ field: "signal", value: sig.snippet, url: sig.url, at: new Date().toISOString(), verified: true });
  const problem = sig ? t.sawSignal(SIGNAL_TEXT[sig.key][lang]) : t.noSignal(ind);
  const useCase = (cfg.useCase || "answers enquiry calls and follows up with leads automatically").trim().replace(/\.$/, "");
  const qs = [...cfg.qualification.filter(Boolean), ...t.defaultQs].slice(0, 2);
  return {
    language: lang,
    opening: t.hello(title, p.company.name),
    permission: t.permission,
    problem,
    howWeHelp: t.help(lang === "en" ? useCase : useCase),
    questions: qs,
    demoInvite: t.demo,
    receptionist: t.receptionist(ROLE_PHRASE[lang]),
    objections: t.objections.map(([objection, reply]) => ({ objection, reply })),
    followUp: t.followUp,
    groundedOn,
  };
}

/** Lines a script must never contain: guarantees, invented numbers, fake customers. Used by tests and before live calls. */
export function unsafeClaims(plan: OutreachPlan): string[] {
  const all = [plan.opening, plan.problem, plan.howWeHelp, plan.demoInvite, ...plan.objections.map((o) => o.reply)].join("\n");
  const bad: string[] = [];
  if (/guarantee|100%|double your|triple your|\d+\s?%\s?(more|increase|growth)/i.test(all)) bad.push("Promises a result");
  if (/(clients like|customers like|trusted by|used by)\s+[A-Z]/.test(all)) bad.push("Names customers");
  if (/₹\s?\d|\$\s?\d|rs\.?\s?\d/i.test(all)) bad.push("Quotes a price");
  if (!/AI assistant|AI అసిస్టెంట్/i.test(plan.opening)) bad.push("Doesn't say it's an AI");
  return bad;
}
