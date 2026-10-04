// Industry experience pages: ranaai.in/for/hr-recruitment, /for/real-estate, … — problem, use cases, sample calls,
// a live demo personalised with the visitor's website, and the path to building RANA for their business.
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import "../../landing/landing.css";
import { INDUSTRY_LIST, INDUSTRY_ALIASES, industryOf } from "../../industries";
import IndustryExperience from "../../industries/ui/IndustryExperience";

const SITE = "https://ranaai.in";
export const dynamicParams = false;
export function generateStaticParams() { return [...INDUSTRY_LIST.map((i) => ({ slug: i.slug })), ...Object.keys(INDUSTRY_ALIASES).map((slug) => ({ slug }))]; }

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const ind = industryOf(params.slug); if (!ind) return {};
  const path = `/for/${ind.slug}`;
  return {
    title: { absolute: ind.seo.title }, description: ind.seo.description, keywords: ind.seo.keywords,
    alternates: { canonical: path },
    openGraph: { title: ind.seo.title, description: ind.seo.description, url: path, type: "website", locale: "en_IN", images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: ind.seo.title }] },
    twitter: { card: "summary_large_image", title: ind.seo.title, description: ind.seo.description, images: ["/opengraph-image"] },
  };
}

export default function IndustryPage({ params }: { params: { slug: string } }) {
  if (INDUSTRY_ALIASES[params.slug]) permanentRedirect(`/for/${INDUSTRY_ALIASES[params.slug]}`);
  const ind = industryOf(params.slug); if (!ind) notFound();
  const url = `${SITE}/for/${ind.slug}`;
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", "@id": `${url}#page`, name: ind.seo.title, url, description: ind.seo.description, inLanguage: "en-IN", isPartOf: { "@type": "WebSite", "@id": `${SITE}/#site`, name: "RANA AI", url: SITE } },
      { "@type": "Service", name: `RANA AI for ${ind.label}`, serviceType: "AI voice agent", provider: { "@type": "Organization", "@id": `${SITE}/#org`, name: "RANA AI", url: SITE }, areaServed: { "@type": "Country", name: "IN" }, audience: { "@type": "BusinessAudience", name: ind.short }, url,
        hasOfferCatalog: { "@type": "OfferCatalog", name: `${ind.label} use cases`, itemListElement: ind.useCases.map((u) => ({ "@type": "Offer", itemOffered: { "@type": "Service", name: u.title, description: u.line } })) } },
      { "@type": "FAQPage", mainEntity: ind.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
      { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "RANA AI", item: SITE }, { "@type": "ListItem", position: 2, name: "Industries", item: `${SITE}/for` }, { "@type": "ListItem", position: 3, name: ind.label, item: url }] },
    ],
  };
  const menu = INDUSTRY_LIST.map((i) => ({ slug: i.slug, label: i.label, mark: i.mark }));
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <IndustryExperience ind={ind} menu={menu} />
    </>
  );
}
