import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPost, listPosts, fmtDate } from "@/lib/posts";

export const revalidate = 900;

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const p = await getPost(params.slug);
  if (!p) return { title: "Not found", robots: { index: false } };
  const url = `/blog/${p.slug}`;
  return {
    title: { absolute: `${p.title} · RANA AI` },
    description: p.description,
    keywords: p.keywords,
    alternates: { canonical: url },
    openGraph: { title: p.title, description: p.description, url, type: "article", publishedTime: p.published_at, modifiedTime: p.updated_at, images: [{ url: "/opengraph-image", width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title: p.title, description: p.description, images: ["/opengraph-image"] },
  };
}

export default async function PostPage({ params }: { params: { slug: string } }) {
  const p = await getPost(params.slug);
  if (!p) notFound();
  const url = `https://ranaai.in/blog/${p.slug}`;
  const related = (await listPosts()).filter((x) => x.slug !== p.slug).slice(0, 3);
  const graph: any[] = [
    {
      "@type": "BlogPosting",
      headline: p.title,
      description: p.description,
      datePublished: p.published_at,
      dateModified: p.updated_at,
      mainEntityOfPage: url,
      url,
      image: "https://ranaai.in/opengraph-image",
      keywords: p.keywords.join(", "),
      author: { "@type": "Organization", name: "RANA AI", url: "https://ranaai.in" },
      publisher: { "@id": "https://ranaai.in/#org" },
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://ranaai.in/" },
        { "@type": "ListItem", position: 2, name: "Blog", item: "https://ranaai.in/blog" },
        { "@type": "ListItem", position: 3, name: p.title, item: url },
      ],
    },
  ];
  if (p.faq?.length) {
    graph.push({ "@type": "FAQPage", mainEntity: p.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) });
  }
  return (
    <article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c") }} />
      <nav className="font-mono text-[12px] text-ink-soft"><Link href="/" className="hover:text-signal">Home</Link> / <Link href="/blog" className="hover:text-signal">Blog</Link></nav>
      <h1 className="font-display text-[32px] sm:text-[40px] font-semibold tracking-tight mt-4 leading-tight">{p.title}</h1>
      <p className="text-ink-soft text-[14px] mt-3">{fmtDate(p.published_at)}{p.updated_at && p.updated_at.slice(0, 10) !== p.published_at.slice(0, 10) ? ` · Updated ${fmtDate(p.updated_at)}` : ""}</p>
      <div
        className="mt-8 text-[16px] leading-8 text-ink/85 space-y-5 [&_h2]:font-display [&_h2]:text-[24px] [&_h2]:font-semibold [&_h2]:text-ink [&_h2]:mt-10 [&_h3]:font-display [&_h3]:text-[19px] [&_h3]:font-semibold [&_h3]:text-ink [&_h3]:mt-6 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:mt-1.5 [&_a]:text-signal [&_a]:underline [&_strong]:text-ink [&_table]:w-full [&_table]:text-[14px] [&_th]:text-left [&_th]:py-2 [&_th]:pr-4 [&_th]:border-b [&_th]:border-white/10 [&_td]:py-2 [&_td]:pr-4 [&_td]:border-b [&_td]:border-white/[.06] [&_td]:align-top"
        dangerouslySetInnerHTML={{ __html: p.body_html }}
      />
      {p.faq?.length > 0 && (
        <section className="mt-12">
          <h2 className="font-display text-[24px] font-semibold">Frequently asked questions</h2>
          <div className="mt-4 space-y-5">
            {p.faq.map((f) => (
              <div key={f.q}>
                <h3 className="font-semibold text-ink text-[16px]">{f.q}</h3>
                <p className="text-[15px] leading-7 text-ink/80 mt-1">{f.a}</p>
              </div>
            ))}
          </div>
        </section>
      )}
      <aside className="mt-14 rounded-2xl border border-white/10 p-6 sm:p-8">
        <h2 className="font-display text-[22px] font-semibold">Let an AI voice agent take your calls</h2>
        <p className="text-[15px] leading-7 text-ink/80 mt-2">RANA AI answers and makes your business calls in 11 Indian languages, qualifies every lead and hands the hot ones to your team.</p>
        <Link href="/signup" className="inline-block mt-4 text-signal font-semibold">Start your 14-day free trial →</Link>
      </aside>
      {related.length > 0 && (
        <section className="mt-12">
          <h2 className="font-display text-[20px] font-semibold">Keep reading</h2>
          <ul className="mt-3 space-y-2">
            {related.map((r) => <li key={r.slug}><Link href={`/blog/${r.slug}`} className="text-signal hover:underline">{r.title}</Link></li>)}
          </ul>
        </section>
      )}
    </article>
  );
}
