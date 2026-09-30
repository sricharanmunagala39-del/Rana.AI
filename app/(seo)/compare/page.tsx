import Hub, { hubMetadata } from "../../seo/Hub";
import { COMPARE, SEO_BY_PATH } from "../../seo/index";
export const metadata = hubMetadata("/compare", "RANA AI vs Vapi, Retell, Bland & Telecallers", "Honest comparisons of RANA AI with developer voice platforms, human telecallers, IVR and missed-call services — for Indian businesses.");
export default function Page() { return <Hub eyebrow="Compare" h1="How RANA AI compares" intro="Honest, dated comparisons — including when the other option is the better choice." pages={[SEO_BY_PATH["/vapi-alternative-india"], ...COMPARE]} />; }
