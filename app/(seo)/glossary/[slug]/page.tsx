import { notFound } from "next/navigation";
import SeoPage, { seoMetadata } from "../../../seo/SeoPage";
import { GLOSSARY } from "../../../seo/index";

export const dynamicParams = false;
export function generateStaticParams() { return GLOSSARY.map((p) => ({ slug: p.path.split("/").pop()! })); }
const find = (slug: string) => GLOSSARY.find((p) => p.path === `/glossary/${slug}`);
export function generateMetadata({ params }: { params: { slug: string } }) { const p = find(params.slug); return p ? seoMetadata(p) : {}; }
export default function Page({ params }: { params: { slug: string } }) { const p = find(params.slug); if (!p) notFound(); return <SeoPage p={p} />; }
