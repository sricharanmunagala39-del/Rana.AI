// The shape of every SEO landing page (solutions, languages, cities, industries, comparisons, glossary).
// Content lives in app/seo/data/*; one renderer (SeoPage) turns it into a page with JSON-LD.

export type SeoKind = "solution" | "language" | "city" | "industry" | "compare" | "glossary" | "pricing" | "tool";

export type SeoSection = {
  h2: string;
  /** Paragraphs, separated by a blank line. */
  body?: string;
  bullets?: string[];
  /** Numbered steps. */
  steps?: string[];
  table?: { head: string[]; rows: string[][]; note?: string };
  /** A sample conversation (Rana ↔ caller). */
  call?: { who: "ai" | "caller"; text: string }[];
};

export type SeoPageData = {
  path: string;            // "/ai-receptionist", "/compare/rana-ai-vs-vapi", …
  kind: SeoKind;
  /** <title> — keep under ~60 characters; " | RANA AI" is added unless it already contains RANA. */
  title: string;
  /** Meta description, ~150 characters. */
  description: string;
  h1: string;
  eyebrow: string;
  intro: string;
  keywords: string[];
  /** Quick facts shown as chips under the intro. */
  facts?: string[];
  sections: SeoSection[];
  faqs: { q: string; a: string }[];
  /** Paths of related pages to link to (other SEO pages, blog posts). */
  related: string[];
  /** Which demo the "Try it" button opens on the homepage. */
  demo?: "qualify" | "sales" | "support" | "booking" | "followup";
  /** Short label used in link lists and the footer. */
  label: string;
  /** Date the facts were last checked (comparisons, rules, prices). */
  checked?: string;
  sources?: { label: string; url: string }[];
};
