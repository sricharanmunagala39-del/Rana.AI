import Link from "next/link";
import "../landing/landing.css";
import { Logo } from "@/components/Sidebar";
import { LEGAL, LEGAL_LINKS } from "../legal/legal";
import { LINK_GROUPS, labelFor, HUB_LABELS } from "../seo/index";

// Marketing layout for every SEO page: simple header, and a footer that links every solution, language,
// industry, city and comparison (internal links are how Google discovers and ranks these pages).
export default function SeoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="site theme-night min-h-screen">
      <header className="border-b border-white/[.06] sticky top-0 z-40 bg-[#090c13]/85 backdrop-blur">
        <div className="max-w-[1080px] mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5 font-display font-semibold tracking-tight shrink-0"><Logo size={28} /> RANA AI</Link>
          <nav className="flex items-center gap-4 sm:gap-6 text-[13.5px] text-ink-soft">
            <Link href="/ai-calling-agent" className="hidden md:inline hover:text-signal">Product</Link>
            <Link href="/industries" className="hidden md:inline hover:text-signal">Industries</Link>
            <Link href="/pricing" className="hover:text-signal">Pricing</Link>
            <Link href="/blog" className="hidden sm:inline hover:text-signal">Blog</Link>
            <Link href="/signup" className="btn-glow rounded-full px-4 py-2 text-[13px] font-semibold text-on-accent">Start free trial</Link>
          </nav>
        </div>
      </header>
      <main className="max-w-[900px] mx-auto px-5 sm:px-8 py-10 sm:py-14">{children}</main>
      <footer className="border-t border-white/[.06] mt-10">
        <div className="max-w-[1080px] mx-auto px-5 sm:px-8 py-10 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8 text-[13px]">
          {LINK_GROUPS.map((g) => (
            <div key={g.title}>
              <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft/70 mb-3">{g.title}</div>
              <ul className="grid gap-2">{g.links.map((l) => <li key={l}><Link href={l} className="text-ink-soft hover:text-signal">{HUB_LABELS[l] || labelFor(l)}</Link></li>)}</ul>
            </div>
          ))}
        </div>
        <div className="max-w-[1080px] mx-auto px-5 sm:px-8 pb-8 text-[12.5px] text-ink-soft space-y-3">
          <nav className="flex flex-wrap gap-x-5 gap-y-2 font-mono text-[12px]">
            <Link href="/" className="hover:text-signal">Home</Link>
            {LEGAL_LINKS.map(([l, h]) => <Link key={h} href={h} className="hover:text-signal">{l}</Link>)}
          </nav>
          <p>RANA AI is a brand of {LEGAL.owner} (sole proprietor), {LEGAL.city}. Contact: <a className="text-signal" href={`mailto:${LEGAL.salesEmail}`}>{LEGAL.salesEmail}</a></p>
        </div>
      </footer>
    </div>
  );
}
