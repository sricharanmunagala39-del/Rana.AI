import type { Metadata } from "next";
import "./landing.css";
import Site from "./Site";
import { FAQ, PLANS } from "./content";

const TITLE = "RANA AI — AI Voice Calling Agents in 11 Indian Languages";
const DESCRIPTION =
  "AI voice agents that answer and make your business calls in Telugu, Hindi, Tamil and 8 more Indian languages, qualify every lead and book the next step. 14-day free trial.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords: [
    "AI voice agent India", "AI calling agent", "AI voice agent for business", "AI telecaller",
    "Telugu AI voice agent", "Hindi AI voice agent", "AI receptionist India", "lead qualification calls",
    "outbound AI calling", "inbound call answering AI",
  ],
  alternates: { canonical: "/" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/", type: "website", images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "RANA AI — AI voice agents for Indian businesses" }] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: ["/opengraph-image"] },
};

// Structured data so Google understands who we are, what we sell and our FAQs.
function jsonLd() {
  const org = {
    "@type": "Organization",
    "@id": "https://ranaai.in/#org",
    name: "RANA AI",
    url: "https://ranaai.in",
    logo: "https://ranaai.in/icon.svg",
    email: "hello@ranaai.in",
    address: { "@type": "PostalAddress", addressLocality: "Hyderabad", addressRegion: "Telangana", addressCountry: "IN" },
    contactPoint: [{ "@type": "ContactPoint", contactType: "sales", email: "hello@ranaai.in", areaServed: "IN", availableLanguage: ["English", "Hindi", "Telugu"] }],
  };
  const app = {
    "@type": "SoftwareApplication",
    name: "RANA AI",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: "https://ranaai.in",
    description: DESCRIPTION,
    publisher: { "@id": "https://ranaai.in/#org" },
    inLanguage: ["en-IN", "hi-IN", "te-IN", "ta-IN", "kn-IN", "ml-IN", "mr-IN", "bn-IN", "gu-IN", "pa-IN", "or-IN"],
    offers: PLANS.map((p) => ({
      "@type": "Offer",
      name: `${p.name} plan`,
      price: p.price.replace(/,/g, ""),
      priceCurrency: "INR",
      description: `${p.min} minutes per month`,
      url: "https://ranaai.in/#pricing",
    })),
  };
  const site = { "@type": "WebSite", "@id": "https://ranaai.in/#site", name: "RANA AI", url: "https://ranaai.in", inLanguage: "en-IN", publisher: { "@id": "https://ranaai.in/#org" } };
  const faq = {
    "@type": "FAQPage",
    mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  };
  return JSON.stringify({ "@context": "https://schema.org", "@graph": [org, site, app, faq] });
}

export default function LandingPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd() }} />
      <Site />
    </>
  );
}
