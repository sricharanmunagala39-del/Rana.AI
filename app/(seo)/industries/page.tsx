import Hub, { hubMetadata } from "../../seo/Hub";
import { INDUSTRIES } from "../../seo/index";
import { INDUSTRY_LIST } from "../../industries";
import type { SeoPageData } from "../../seo/types";
export const metadata = hubMetadata("/industries", "AI Voice Agents by Industry", "How AI voice agents answer and make calls for real estate, clinics, education, e-commerce, finance, insurance, hospitality and more in India.");
// The main industries have full pages at /for/<slug>; the rest have an /industries page. List both, one link each.
const FOR_PAGES = INDUSTRY_LIST.map((i) => ({ path: `/for/${i.slug}`, label: i.label, intro: i.sub }) as SeoPageData);
export default function Page() { return <Hub eyebrow="Industries" h1="AI voice agents for every industry that runs on calls" intro="Pick your industry to see the calls an AI voice agent answers and makes for you, a sample conversation, and what your team gets after every call." pages={[...FOR_PAGES, ...INDUSTRIES]} />; }
