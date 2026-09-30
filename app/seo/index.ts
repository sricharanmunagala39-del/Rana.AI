// Every SEO page, looked up by path. Add pages in app/seo/data/*, and list new top-level prefixes in ./paths.ts.
import type { SeoPageData } from "./types";
import { LANDING } from "./data/landing";
import { PRICING } from "./data/pricing";
import { COMPARE } from "./data/compare";
import { INDUSTRIES } from "./data/industries";
import { CITIES } from "./data/cities";
import { GLOSSARY } from "./data/glossary";

export const ALL_SEO: SeoPageData[] = [...LANDING, PRICING, ...COMPARE, ...INDUSTRIES, ...CITIES, ...GLOSSARY];
export const SEO_BY_PATH: Record<string, SeoPageData> = Object.fromEntries(ALL_SEO.map((p) => [p.path, p]));
/** Pages served at the top level (/ai-receptionist, /ai-voice-agent-hyderabad …) by app/(seo)/[slug]. */
export const TOP_LEVEL = [...LANDING, ...CITIES];
export { LANDING, PRICING, COMPARE, INDUSTRIES, CITIES, GLOSSARY };

/** Blog posts we link to from SEO pages (titles kept here so pages render without a DB call). */
export const BLOG_LABELS: Record<string, string> = {
  "/blog/ai-voice-agent-for-business-india": "AI voice agent for business in India: complete guide",
  "/blog/ai-telecaller-for-real-estate-india": "AI telecaller for real estate in India",
  "/blog/ai-calling-for-coaching-institutes": "AI calling for coaching institutes",
  "/blog/ai-receptionist-for-clinics-india": "AI receptionist for clinics in India",
  "/blog/telecaller-vs-ai-calling-cost-india": "Telecaller vs AI calling cost in India",
  "/blog/telugu-ai-voice-agent": "Telugu AI voice agent guide",
  "/blog/trai-dlt-rules-for-ai-calling": "TRAI DLT rules for AI calling",
  "/blog/missed-call-to-lead-conversion": "Missed call to lead conversion playbook",
};
export const labelFor = (path: string) => SEO_BY_PATH[path]?.label || BLOG_LABELS[path] || path;

/** Footer / hub link groups. */
export const LINK_GROUPS: { title: string; links: string[] }[] = [
  { title: "Solutions", links: ["/ai-calling-agent", "/ai-receptionist", "/ai-receptionist-for-clinics", "/ai-telecaller", "/pricing"] },
  { title: "Languages", links: ["/telugu-ai-voice-agent", "/hindi-ai-voice-agent", "/tamil-ai-voice-agent", "/kannada-ai-voice-agent"] },
  { title: "Industries", links: ["/industries/real-estate", "/industries/clinics-hospitals", "/industries/education-coaching", "/industries/e-commerce", "/industries/banking-nbfc-loans", "/industries/insurance", "/industries"] },
  { title: "Cities", links: CITIES.map((c) => c.path) },
  { title: "Compare", links: ["/vapi-alternative-india", "/compare/rana-ai-vs-vapi", "/compare/rana-ai-vs-retell-ai", "/compare/rana-ai-vs-bland-ai", "/compare/ai-vs-human-telecaller", "/compare"] },
  { title: "Learn", links: ["/blog", "/glossary/dlt-registration", "/glossary/trai-tcccpr-rules", "/glossary/speed-to-lead", "/glossary"] },
];
export const HUB_LABELS: Record<string, string> = { "/industries": "All industries →", "/compare": "All comparisons →", "/glossary": "Glossary →", "/blog": "Blog" };
