import type { MetadataRoute } from "next";

const SITE_URL = "https://ranaai.in";

// Every public page. Add new marketing pages here so search engines find them quickly.
export default function sitemap(): MetadataRoute.Sitemap {
  const updated = new Date("2026-09-25");
  const page = (path: string, priority: number, changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]) => ({
    url: `${SITE_URL}${path}`,
    lastModified: updated,
    changeFrequency,
    priority,
  });
  return [
    page("/", 1, "weekly"),
    page("/signup", 0.6, "monthly"),
    page("/legal/contact", 0.4, "yearly"),
    page("/legal/terms", 0.3, "yearly"),
    page("/legal/privacy", 0.3, "yearly"),
    page("/legal/refunds", 0.3, "yearly"),
    page("/legal/delivery", 0.2, "yearly"),
  ];
}
