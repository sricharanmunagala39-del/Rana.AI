// Industry home pages: ranaai.in/for/education, /for/real-estate, … — the homepage, told for one industry.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "../../landing/landing.css";
import Site from "../../landing/Site";
import { VERTICALS, verticalOf } from "../../landing/verticals";
import { faqFor } from "../../landing/content";
import { MARKETS } from "../../landing/markets";

const SITE = "https://ranaai.in";
export const dynamicParams = false;
export function generateStaticParams() { return VERTICALS.map((v) => ({ slug: v.slug })); }

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const v = verticalOf(params.slug); if (!v) return {};
  const path = `/for/${v.slug}`;
  return {
    title: { absolute: v.seo.title }, description: v.seo.description, keywords: v.seo.keywords,
    alternates: { canonical: path },
    openGraph: { title: v.seo.title, description: v.seo.description, url: path, type: "website", locale: "en_IN", images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: v.seo.title }] },
    twitter: { card: "summary_large_image", title: v.seo.title, description: v.seo.description, images: ["/opengraph-image"] },
  };
}

export default function IndustryPage({ params }: { params: { slug: string } }) {
  const v = verticalOf(params.slug); if (!v) notFound();
  const url = `${SITE}/for/${v.slug}`;
  const faq = [...v.faq, ...faqFor(MARKETS.in).slice(0, 4)];
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", "@id": `${url}#page`, name: v.seo.title, url, description: v.seo.description, inLanguage: "en-IN", isPartOf: { "@type": "WebSite", "@id": `${SITE}/#site`, name: "RANA AI", url: SITE } },
      { "@type": "Service", name: `AI calling for ${v.short}`, serviceType: "AI voice agent", provider: { "@type": "Organization", "@id": `${SITE}/#org`, name: "RANA AI", url: SITE }, areaServed: { "@type": "Country", name: "IN" }, audience: { "@type": "BusinessAudience", name: v.short }, url },
      { "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
      { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "RANA AI", item: SITE }, { "@type": "ListItem", position: 2, name: v.label, item: url }] },
    ],
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <Site marketKey="in" vertical={v} />
    </>
  );
}
