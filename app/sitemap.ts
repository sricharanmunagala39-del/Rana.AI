import type { MetadataRoute } from "next";
import { listPosts } from "@/lib/posts";

const SITE_URL = "https://ranaai.in";

export const revalidate = 900;

// Every public page. Blog articles are added automatically from Supabase `site_posts`.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const updated = new Date("2026-09-25");
  const page = (path: string, priority: number, changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]) => ({
    url: `${SITE_URL}${path}`,
    lastModified: updated,
    changeFrequency,
    priority,
  });
  const posts = await listPosts();
  return [
    page("/", 1, "weekly"),
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
