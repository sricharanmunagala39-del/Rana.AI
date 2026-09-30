// Public (logged-out) paths for the SEO pages — read by middleware (edge), so it stays a plain list.
// A test checks it covers every path in app/seo/index.ts.
export const SEO_PUBLIC_PATHS = [
  "/pricing", "/compare", "/industries", "/glossary",
  "/ai-calling-agent", "/ai-receptionist", "/ai-receptionist-for-clinics", "/ai-telecaller",
  "/telugu-ai-voice-agent", "/hindi-ai-voice-agent", "/tamil-ai-voice-agent", "/kannada-ai-voice-agent",
  "/vapi-alternative-india",
  "/ai-voice-agent-hyderabad", "/ai-voice-agent-vijayawada", "/ai-voice-agent-visakhapatnam", "/ai-voice-agent-bangalore",
  "/ai-voice-agent-chennai", "/ai-voice-agent-mumbai", "/ai-voice-agent-delhi", "/ai-voice-agent-pune",
];
