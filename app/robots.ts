import type { MetadataRoute } from "next";

const SITE_URL = "https://ranaai.in";

// Public marketing + legal pages are crawlable; the signed-in app and APIs are not.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/legal/", "/signup", "/blog"],
        disallow: [
          "/api/", "/hq", "/agent", "/agents", "/employees", "/talk", "/inbound", "/outbound",
          "/billing", "/settings", "/phone-numbers", "/scripts", "/coming-soon", "/login", "/landing",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
