import Link from "next/link";
import "../landing/landing.css";
import { Logo } from "@/components/Sidebar";
import { LEGAL, LEGAL_LINKS } from "./legal";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="site theme-night min-h-screen">
      <header className="border-b border-white/[.06]">
        <div className="max-w-[860px] mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 font-display font-semibold tracking-tight">
            <Logo size={28} /> RANA AI
          </Link>
          <Link href="/" className="text-[13px] text-ink-soft hover:text-signal">← Back to ranaai.in</Link>
        </div>
      </header>
      <main className="max-w-[860px] mx-auto px-5 sm:px-8 py-12 sm:py-16">{children}</main>
      <footer className="border-t border-white/[.06]">
        <div className="max-w-[860px] mx-auto px-5 sm:px-8 py-8 text-[13px] text-ink-soft space-y-4">
          <nav className="flex flex-wrap gap-x-6 gap-y-2 font-mono text-[12px]">
            {LEGAL_LINKS.map(([l, h]) => <Link key={h} href={h} className="hover:text-signal">{l}</Link>)}
          </nav>
          <p>RANA AI is a brand of {LEGAL.owner} (sole proprietor), {LEGAL.city}. Contact: <a className="text-signal" href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a></p>
        </div>
      </footer>
    </div>
  );
}
