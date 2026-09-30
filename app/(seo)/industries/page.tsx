import Hub, { hubMetadata } from "../../seo/Hub";
import { INDUSTRIES } from "../../seo/index";
export const metadata = hubMetadata("/industries", "AI Voice Agents by Industry", "How AI voice agents answer and make calls for real estate, clinics, education, e-commerce, finance, insurance, hospitality and more in India.");
export default function Page() { return <Hub eyebrow="Industries" h1="AI voice agents for every industry that runs on calls" intro="Pick your industry to see the calls an AI voice agent answers and makes for you, a sample conversation, and what your team gets after every call." pages={INDUSTRIES} />; }
