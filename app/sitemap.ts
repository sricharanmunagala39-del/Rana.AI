import type { MetadataRoute } from "next";
import { listPosts } from "@/lib/posts";
import { MARKETS, MARKET_KEYS, HREFLANG } from "./landing/markets";
import { ALL_SEO } from "./seo/index";
import { VERTICALS } from "./landing/verticals";

const SITE_URL = "https://ranaai.in";

export const revalidate = 900;

// Every public page. Blog articles are added automatically from Supabase `site_posts`.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const updated = new Date("2026-09-30");
  const page = (path: string, priority: number, changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]) => ({
    url: `${SITE_URL}${path}`,
    lastModified: updated,
    changeFrequency,
    priority,
  });
  const posts = await listPosts();
  return [
    // Every country page lists all the others, so Google serves each visitor their own version.
    ...MARKET_KEYS.map((k) => ({
      ...page(MARKETS[k].path, k === "in" ? 1 : 0.9, "weekly"),
      alternates: { languages: Object.fromEntries(Object.entries(HREFLANG).map(([l, p]) => [l, `${SITE_URL}${p === "/" ? "" : p}`])) },
    })),
    // Industry home pages (/for/…).
    ...VERTICALS.map((v) => page(`/for/${v.slug}`, 0.9, "weekly")),
    // SEO landing pages: money pages first, then comparisons, industries, cities, glossary.
    ...ALL_SEO.map((p) => page(p.path, p.kind === "solution" || p.kind === "pricing" || p.kind === "language" ? 0.9 : p.kind === "glossary" ? 0.5 : 0.8, "monthly")),
    page("/industries", 0.7, "monthly"), page("/compare", 0.7, "monthly"), page("/glossary", 0.5, "monthly"),
    page("/signup", 0.6, "monthly"),
    { url: `${SITE_URL}/blog`, lastModified: posts[0] ? new Date(posts[0].updated_at) : updated, changeFrequency: "daily", priority: 0.7 },
    ...posts.map((p) => ({ url: `${SITE_URL}/blog/${p.slug}`, lastModified: new Date(p.updated_at), changeFrequency: "monthly" as const, priority: 0.6 })),
    page("/legal/contact", 0.4, "yearly"),
    page("/legal/terms", 0.3, "yearly"),
    page("/legal/privacy", 0.3, "yearly"),
    page("/legal/refunds", 0.3, "yearly"),
    page("/legal/delivery", 0.2, "yearly"),
  ];
}
