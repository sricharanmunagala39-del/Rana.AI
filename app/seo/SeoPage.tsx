// Renders one SEO page (server component) + its metadata and JSON-LD.
import type { Metadata } from "next";
import type React from "react";
import Link from "next/link";
import type { SeoPageData, SeoSection } from "./types";
import { labelFor } from "./index";
import { SOCIAL_LINKS } from "../legal/legal";
import Integrations from "@/components/Integrations";

const SITE = "https://ranaai.in";
const KIND_CRUMB: Record<string, [string, string] | null> = {
  compare: ["Compare", "/compare"], industry: ["Industries", "/industries"], glossary: ["Glossary", "/glossary"],
  solution: null, language: null, city: null, pricing: null, tool: null,
};

const clamp = (t: string, n = 160) => (t.length <= n ? t : t.slice(0, t.lastIndexOf(" ", n - 2)) + "…");

export function seoMetadata(p: SeoPageData): Metadata {
  const title = /RANA/i.test(p.title) ? p.title : `${p.title} | RANA AI`;
  return {
    title: { absolute: title },
    description: clamp(p.description),
    keywords: p.keywords,
    alternates: { canonical: p.path },
    openGraph: { title, description: p.description, url: p.path, type: "website", locale: "en_IN", siteName: "RANA AI", images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: title }] },
    twitter: { card: "summary_large_image", title, description: p.description, images: ["/opengraph-image"] },
  };
}

function jsonLd(p: SeoPageData) {
  const url = `${SITE}${p.path}`;
  const crumb = KIND_CRUMB[p.kind];
  const graph: any[] = [
    { "@type": "Organization", "@id": `${SITE}/#org`, name: "RANA AI", alternateName: ["Rana AI", "RANA"], sameAs: SOCIAL_LINKS.map(([, u]) => u), url: SITE, logo: `${SITE}/icon.svg`, email: "hello@ranaai.in", address: { "@type": "PostalAddress", addressLocality: "Hyderabad", addressRegion: "Telangana", addressCountry: "IN" } },
    { "@type": "WebSite", "@id": `${SITE}/#website`, url: SITE, name: "RANA AI", publisher: { "@id": `${SITE}/#org` } },
    { "@type": "WebPage", "@id": `${url}#page`, url, name: p.h1, description: p.description, inLanguage: "en-IN", isPartOf: { "@id": `${SITE}/#website` }, about: { "@id": `${SITE}/#org` }, ...(p.checked ? { dateModified: "2026-09-30" } : {}) },
    { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` }, ...(crumb ? [{ "@type": "ListItem", position: 2, name: crumb[0], item: `${SITE}${crumb[1]}` }] : []), { "@type": "ListItem", position: crumb ? 3 : 2, name: p.label, item: url }] },
  ];
  if (p.kind === "glossary") graph.push({ "@type": "DefinedTerm", name: p.label, description: p.intro, inDefinedTermSet: `${SITE}/glossary` });
  else if (p.kind === "tool") graph.push({ "@type": "WebApplication", name: p.label, url, applicationCategory: "BusinessApplication", operatingSystem: "Any (web browser)", isAccessibleForFree: true, offers: { "@type": "Offer", price: "0", priceCurrency: "INR" }, publisher: { "@id": `${SITE}/#org` } });
  else if (p.kind !== "compare") graph.push({ "@type": "Service", name: p.h1, serviceType: p.label, description: p.description, provider: { "@id": `${SITE}/#org` }, areaServed: p.kind === "city" ? { "@type": "City", name: p.label.includes(" in ") ? p.label.split(" in ").pop() : p.label.replace(/^AI voice agent /, "") } : { "@type": "Country", name: "India" }, url });
  if (p.faqs.length) graph.push({ "@type": "FAQPage", mainEntity: p.faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) });
  return { "@context": "https://schema.org", "@graph": graph };
}

function Section({ s }: { s: SeoSection }) {
  return (
    <section className="mt-12">
      <h2 className="font-display text-[24px] sm:text-[28px] font-semibold tracking-tight">{s.h2}</h2>
      {s.body && s.body.split("\n\n").map((para, i) => <p key={i} className="text-[16px] leading-relaxed text-ink-soft mt-4">{para}</p>)}
      {s.bullets && <ul className="mt-4 grid gap-2.5">{s.bullets.map((b) => <li key={b} className="flex gap-3 text-[15.5px] leading-relaxed"><span className="text-signal mt-[3px]" aria-hidden>▸</span><span>{b}</span></li>)}</ul>}
      {s.steps && <ol className="mt-4 grid gap-3">{s.steps.map((b, i) => <li key={b} className="flex gap-3 text-[15.5px] leading-relaxed"><span className="shrink-0 w-7 h-7 rounded-full border border-signal/40 text-signal font-mono text-[13px] grid place-items-center">{i + 1}</span><span className="pt-0.5">{b}</span></li>)}</ol>}
      {s.table && (
        <div className="mt-5 overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-[14px] min-w-[560px]">
            <thead><tr className="bg-white/[.04]">{s.table.head.map((h, i) => <th key={i} className="text-left font-semibold px-4 py-3 border-b border-white/10">{h}</th>)}</tr></thead>
            <tbody>{s.table.rows.map((r, i) => <tr key={i} className="border-b border-white/[.06] last:border-0">{r.map((c, j) => <td key={j} className={`px-4 py-3 align-top ${j === 0 ? "font-medium" : "text-ink-soft"} ${j === r.length - 1 && s.table!.head.length > 2 ? "text-ink" : ""}`}>{c}</td>)}</tr>)}</tbody>
          </table>
          {s.table.note && <div className="text-[12px] text-ink-soft px-4 py-2.5 border-t border-white/[.06]">{s.table.note}</div>}
        </div>
      )}
      {s.call && (
        <div className="mt-5 rounded-2xl border border-white/10 bg-white/[.02] p-5 flex flex-col gap-3">
          {s.call.map((l, i) => (
            <div key={i} className={`max-w-[85%] ${l.who === "ai" ? "self-start" : "self-end text-right"}`}>
              <div className={`font-mono text-[10.5px] tracking-wider mb-1 ${l.who === "ai" ? "text-signal" : "text-violet"}`}>{l.who === "ai" ? "RANA AI" : "CALLER"}</div>
              <div className={`inline-block rounded-2xl px-4 py-2.5 text-[14.5px] leading-snug ${l.who === "ai" ? "bg-signal/[.08] border border-signal/25" : "bg-violet/[.08] border border-violet/25"}`}>{l.text}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function SeoPage({ p, children }: { p: SeoPageData; children?: React.ReactNode }) {
  const crumb = KIND_CRUMB[p.kind];
  return (
    <article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(p)) }} />
      <nav aria-label="Breadcrumb" className="font-mono text-[12px] text-ink-soft flex flex-wrap gap-1.5">
        <Link href="/" className="hover:text-signal">Home</Link><span>/</span>
        {crumb && <><Link href={crumb[1]} className="hover:text-signal">{crumb[0]}</Link><span>/</span></>}
        <span className="text-ink">{p.label}</span>
      </nav>
      <div className="eyebrow mt-8">{p.eyebrow}</div>
      <h1 className="font-display text-[36px] sm:text-[50px] font-semibold tracking-[-0.03em] leading-[1.05] mt-3">{p.h1}</h1>
      <p className="text-[17px] sm:text-[18.5px] leading-relaxed text-ink-soft mt-5 max-w-[760px]">{p.intro}</p>
      {p.facts && <div className="flex flex-wrap gap-2 mt-6">{p.facts.map((f) => <span key={f} className="font-mono text-[11.5px] rounded-full border border-signal/30 bg-signal/10 text-signal px-3 py-1.5">{f}</span>)}</div>}
      {p.kind !== "glossary" && (
        <div className="flex flex-wrap gap-3 mt-8">
          <Link href="/?talk=1" className="btn-glow rounded-full px-6 py-3 text-[15px] font-semibold" data-testid="seo-talk">🎙️ Talk to Rana now</Link>
          {p.demo && <Link href={`/?try=${p.demo}`} className="btn-ghost rounded-full px-6 py-3 text-[15px] font-medium">Try a live demo</Link>}
          <Link href="/signup" className="btn-ghost rounded-full px-6 py-3 text-[15px] font-medium">Start free trial</Link>
        </div>
      )}

      {children}

      {p.sections.map((s) => <Section key={s.h2} s={s} />)}

      {p.kind !== "glossary" && p.kind !== "tool" && (
        <section className="mt-12">
          <h2 className="font-display text-[24px] sm:text-[28px] font-semibold tracking-tight">Where your leads go</h2>
          <div className="mt-5"><Integrations /></div>
        </section>
      )}

      {p.faqs.length > 0 && (
        <section className="mt-14">
          <h2 className="font-display text-[24px] sm:text-[28px] font-semibold tracking-tight">Frequently asked questions</h2>
          <div className="mt-4 divide-y divide-white/[.07] border-y border-white/[.07]">
            {p.faqs.map((f) => (
              <details key={f.q} className="group py-4">
                <summary className="cursor-pointer list-none flex justify-between gap-4 text-[16px] font-semibold"><span>{f.q}</span><span className="text-signal group-open:rotate-45 transition-transform">+</span></summary>
                <p className="text-[15px] leading-relaxed text-ink-soft mt-3">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      {(p.checked || p.sources) && (
        <p className="text-[12.5px] text-ink-soft mt-8">
          {p.checked && <>Facts checked on {p.checked}. </>}
          {p.sources && <>Sources: {p.sources.map((s, i) => <span key={s.url}>{i ? ", " : ""}<a href={s.url} rel="nofollow noopener" target="_blank" className="underline hover:text-signal">{s.label}</a></span>)}.</>}
        </p>
      )}

      <section className="mt-14 rounded-2xl border border-signal/30 bg-signal/[.06] p-6 sm:p-8">
        <div className="font-display text-[24px] font-semibold">Ready to stop missing calls?</div>
        <p className="text-ink-soft text-[15px] mt-2 max-w-[620px]">Build your first AI employee on the free trial and test it in your browser today — no card needed. Or see every plan and price.</p>
        <div className="flex flex-wrap gap-3 mt-5">
          <Link href="/signup" className="btn-glow rounded-full px-6 py-3 text-[15px] font-semibold">Start free trial</Link>
          <Link href="/pricing" className="btn-ghost rounded-full px-6 py-3 text-[15px] font-medium">See pricing</Link>
        </div>
      </section>

      {p.related.length > 0 && (
        <section className="mt-12">
          <h2 className="font-display text-[20px] font-semibold">Related</h2>
          <ul className="mt-3 grid sm:grid-cols-2 gap-2">
            {p.related.map((r) => <li key={r}><Link href={r} className="block rounded-xl border border-white/10 hover:border-signal/40 px-4 py-3 text-[14.5px] hover:text-signal">{labelFor(r)} →</Link></li>)}
          </ul>
        </section>
      )}
    </article>
  );
}
