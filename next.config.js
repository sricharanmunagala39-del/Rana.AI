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
    ];
  },
  // Browsers and crawlers still ask for /favicon.ico; serve the app icon instead of a 404.
  async rewrites() {
    return [{ source: "/favicon.ico", destination: "/icon.svg" }];
  },
};

module.exports = nextConfig;
