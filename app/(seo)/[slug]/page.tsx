import { notFound } from "next/navigation";
import SeoPage, { seoMetadata } from "../../seo/SeoPage";
import { TOP_LEVEL } from "../../seo/index";

// Top-level SEO pages: /ai-receptionist, /telugu-ai-voice-agent, /ai-voice-agent-hyderabad, …
export const dynamicParams = false;
export function generateStaticParams() { return TOP_LEVEL.map((p) => ({ slug: p.path.slice(1) })); }
const find = (slug: string) => TOP_LEVEL.find((p) => p.path === `/${slug}`);
export function generateMetadata({ params }: { params: { slug: string } }) { const p = find(params.slug); return p ? seoMetadata(p) : {}; }
export default function Page({ params }: { params: { slug: string } }) { const p = find(params.slug); if (!p) notFound(); return <SeoPage p={p} />; }
