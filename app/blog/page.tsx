import type { Metadata } from "next";
import Link from "next/link";
import { listPosts, fmtDate } from "@/lib/posts";

export const revalidate = 900;

const TITLE = "Blog — AI Voice Agents & Calling Automation for Indian Businesses";
const DESCRIPTION = "Guides on AI voice agents, AI telecallers, lead qualification and call automation in Telugu, Hindi, Tamil and other Indian languages.";

export const metadata: Metadata = {
  title: { absolute: `${TITLE} · RANA AI` },
  description: DESCRIPTION,
  alternates: { canonical: "/blog" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/blog", type: "website" },
};

export default async function Blog() {
  const posts = await listPosts();
  return (
    <div>
      <p className="eyebrow">// BLOG</p>
      <h1 className="font-display text-[34px] sm:text-[42px] font-semibold tracking-tight mt-3">AI voice agents for Indian businesses</h1>
      <p className="text-[16px] leading-7 mt-4 text-ink/80">{DESCRIPTION}</p>
      {posts.length === 0 ? (
        <p className="mt-10 text-ink-soft">New articles are on the way.</p>
      ) : (
        <ul className="mt-10 divide-y divide-white/[.06]">
          {posts.map((p) => (
            <li key={p.slug} className="py-6">
              <p className="font-mono text-[12px] text-ink-soft">{fmtDate(p.published_at)} · {p.category}</p>
              <h2 className="font-display text-[22px] font-semibold tracking-tight mt-1">
                <Link href={`/blog/${p.slug}`} className="hover:text-signal">{p.title}</Link>
              </h2>
              <p className="text-[15px] leading-7 text-ink/80 mt-1">{p.description}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
