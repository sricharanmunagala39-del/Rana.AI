import Hub, { hubMetadata } from "../../seo/Hub";
import { GLOSSARY } from "../../seo/index";
export const metadata = hubMetadata("/glossary", "AI Calling Glossary — DLT, TRAI, IVR & More", "Plain-English definitions of AI calling and telecalling terms for Indian businesses: DLT registration, TRAI TCCCPR, DND, IVR, speed to lead and more.");
export default function Page() { return <Hub eyebrow="Glossary" h1="AI calling glossary" intro="Plain-English definitions of the terms you'll meet when you automate business calls in India." pages={GLOSSARY} />; }
