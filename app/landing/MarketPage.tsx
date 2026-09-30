// One server component + metadata builder for every country page (/, /global, /us, /ae, /eu, /jp).
import type { Metadata } from "next";
import "./landing.css";
import Site from "./Site";
import { faqFor, plansFor } from "./content";
import { MARKETS, HREFLANG, type MarketKey } from "./markets";
import { PRICE_LIST_NOTE } from "./seoCopy";

const SITE = "https://ranaai.in";

const COPY: Record<MarketKey, { title: string; description: string; keywords: string[]; area: string[] }> = {
  in: {
    title: "AI Voice Agent & AI Calling Agent in India | RANA AI",
    description: "RANA AI is an AI voice agent and AI calling agent for Indian businesses: answers every call and calls every lead in Telugu, Hindi, Tamil and 8 more languages, 24×7. Free trial.",
    keywords: ["AI voice agent India", "AI calling agent", "AI calling agent India", "AI voice agent", "AI calling", "AI voice agent for business", "AI telecaller", "Telugu AI voice agent", "Hindi AI voice agent", "AI receptionist India", "lead qualification calls", "outbound AI calling", "inbound call answering AI", "AI receptionist for clinics", "AI calling for real estate", "COD order confirmation calls", "AI calling for insurance renewals", "AI telecaller for education"],
    area: ["IN"],
  },
  global: {
    title: "RANA AI — AI Voice Agents & AI Receptionists for Businesses Worldwide",
    description: "AI voice agents that answer every call 24×7 and call your leads in English, Spanish, French, Japanese, Hindi and 9 more Indian languages. Plans from $69/month. 14-day free trial.",
    keywords: ["AI voice agent", "AI receptionist", "AI phone agent for small business", "AI calling agent", "AI answering service", "multilingual AI voice agent", "AI appointment booking calls", "outbound AI calling"],
    area: [],
  },
  us: {
    title: "RANA AI — AI Receptionist & AI Voice Agents for US Businesses",
    description: "An AI receptionist that answers every call 24×7, books appointments and follows up leads — in English, Spanish and more. US numbers, TCPA-aware calling. Plans from $69/month.",
    keywords: ["AI receptionist", "AI answering service for small business", "AI phone agent", "AI voice agent USA", "AI receptionist for dental clinic", "AI receptionist for real estate", "Spanish AI receptionist"],
    area: ["US"],
  },
  ae: {
    title: "RANA AI — AI Voice Agents for Businesses in the UAE & Gulf",
    description: "AI voice agents that answer and make your calls in English, Hindi, Malayalam, Tamil, Telugu and more — for clinics, real estate and education consultancies in the UAE and Gulf. Plans from $69/month.",
    keywords: ["AI voice agent Dubai", "AI receptionist UAE", "AI calling agent Gulf", "Hindi AI voice agent Dubai", "AI receptionist for clinics Dubai", "AI calling for real estate Dubai"],
    area: ["AE", "SA", "QA", "KW", "OM", "BH"],
  },
  eu: {
    title: "RANA AI — AI Voice Agents & AI Receptionists for European Businesses",
    description: "AI voice agents that answer every call and call your leads in English, Spanish and French — for clinics, hotels, real estate and e-commerce in Europe. GDPR-aware. Plans from €65/month.",
    keywords: ["AI receptionist Europe", "AI voice agent", "KI Telefonassistent", "agente de voz IA", "agent vocal IA", "AI phone answering hotel", "AI receptionist clinic"],
    area: ["DE", "FR", "ES", "IT", "NL", "IE", "BE", "PT", "AT"],
  },
  jp: {
    title: "RANA AI — AI Voice Agents for Businesses in Japan",
    description: "AI voice agents that answer and make your business calls in Japanese and English, 24×7 — order confirmations, bookings and lead follow-ups. Plans from ¥9,900/month.",
    keywords: ["AI電話対応", "AI 音声エージェント", "AI receptionist Japan", "AI voice agent Japan", "電話自動応答 AI"],
    area: ["JP"],
  },
};

const url = (path: string) => (path === "/" ? SITE : `${SITE}${path}`);

export function marketMetadata(k: MarketKey): Metadata {
  const m = MARKETS[k], c = COPY[k];
  return {
    title: { absolute: c.title },
    description: c.description,
    keywords: c.keywords,
    alternates: { canonical: m.path, languages: HREFLANG },
    openGraph: { title: c.title, description: c.description, url: m.path, type: "website", locale: k === "in" ? "en_IN" : k === "jp" ? "ja_JP" : "en_US", images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: c.title }] },
    twitter: { card: "summary_large_image", title: c.title, description: c.description, images: ["/opengraph-image"] },
  };
}

function jsonLd(k: MarketKey) {
  const m = MARKETS[k], c = COPY[k];
  const org = {
    "@type": "Organization", "@id": `${SITE}/#org`, name: "RANA AI", url: SITE, logo: `${SITE}/icon.svg`, email: "hello@ranaai.in",
    address: { "@type": "PostalAddress", addressLocality: "Hyderabad", addressRegion: "Telangana", addressCountry: "IN" },
    contactPoint: [{ "@type": "ContactPoint", contactType: "sales", email: "hello@ranaai.in", availableLanguage: ["English", "Hindi", "Telugu"] }],
  };
  const app = {
    "@type": "SoftwareApplication", name: "RANA AI", applicationCategory: "BusinessApplication", operatingSystem: "Web", url: url(m.path),
    description: c.description, publisher: { "@id": `${SITE}/#org` },
    ...(c.area.length ? { areaServed: c.area.map((a) => ({ "@type": "Country", name: a })) } : {}),
    offers: plansFor(m).map((p) => ({ "@type": "Offer", name: `${p.name} plan`, price: p.price.replace(/[^\d.]/g, ""), priceCurrency: m.currency, description: `${p.min} minutes per month. ${PRICE_LIST_NOTE}`, url: `${url(m.path)}#pricing` })),
  };
  const site = { "@type": "WebPage", "@id": `${url(m.path)}#page`, name: c.title, url: url(m.path), inLanguage: k === "in" ? "en-IN" : "en", isPartOf: { "@type": "WebSite", "@id": `${SITE}/#site`, name: "RANA AI", url: SITE } };
  const faq = { "@type": "FAQPage", mainEntity: faqFor(m).map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) };
  return JSON.stringify({ "@context": "https://schema.org", "@graph": [org, site, app, faq] });
}

export default function MarketPage({ market }: { market: MarketKey }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(market) }} />
      <Site marketKey={market} />
    </>
  );
}
