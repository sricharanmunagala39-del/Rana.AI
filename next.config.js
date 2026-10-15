/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Common guesses for the home screen.
  async redirects() {
    return [
      { source: "/dashboard", destination: "/", permanent: false },
      { source: "/home", destination: "/", permanent: false },
      // The old one-agent editors were replaced by My Employees + Script Studio.
      { source: "/scripts", destination: "/employees", permanent: false },
      { source: "/agent", destination: "/employees", permanent: false },
      // SEO: one page per industry. These /industries pages duplicated the richer /for pages, and Google flagged
      // them as "Duplicate without user-selected canonical". Keep in sync with MERGED_INTO_FOR in app/seo/data/industries.ts.
      { source: "/industries/real-estate", destination: "/for/real-estate", permanent: true },
      { source: "/industries/clinics-hospitals", destination: "/for/healthcare", permanent: true },
      { source: "/industries/education-coaching", destination: "/for/education", permanent: true },
      { source: "/industries/e-commerce", destination: "/for/ecommerce", permanent: true },
      { source: "/industries/banking-nbfc-loans", destination: "/for/bfsi", permanent: true },
      { source: "/industries/hotels-hospitality", destination: "/for/hospitality", permanent: true },
      { source: "/industries/automobile-dealers", destination: "/for/automobile", permanent: true },
      { source: "/industries/recruitment-staffing", destination: "/for/hr-recruitment", permanent: true },
      { source: "/compare/rana-ai-vs-vapi", destination: "/vapi-alternative-india", permanent: true },
    ];
  },
  // Browsers and crawlers still ask for /favicon.ico; serve the app icon instead of a 404.
  async rewrites() {
    return [{ source: "/favicon.ico", destination: "/icon.svg" }];
  },
};

module.exports = nextConfig;
