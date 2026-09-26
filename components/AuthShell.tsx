"use client";
import Link from "next/link";
import { Logo } from "@/components/Sidebar";
import Orb from "@/components/Orb";

/** Split-screen frame for sign-in / sign-up: living brand panel on the left, the form on the right. */
export default function AuthShell({ children, foot }: { children: React.ReactNode; foot?: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper grid lg:grid-cols-[1.05fr_1fr]">
      <aside className="hidden lg:flex relative overflow-hidden flex-col justify-between p-12 border-r border-line stage-glow text-white">
        <Link href="/landing" className="flex items-center gap-2.5 relative z-10">
          <Logo />
          <span className="font-display text-[18px] font-semibold tracking-tight">RANA<span className="text-gradient"> AI</span></span>
        </Link>
        <div className="absolute -right-24 top-6 pointer-events-none"><Orb size={500} /></div>
        <div className="relative z-10 max-w-[440px]">
          <div className="inline-flex items-center gap-2 font-mono text-[11px] text-[#2DE1C2] bg-[#2DE1C2]/10 border border-[#2DE1C2]/20 rounded-md px-2.5 py-1 mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#2DE1C2] live-dot" /> STATUS: ANSWERING CALLS, RIGHT NOW
          </div>
          <h2 className="font-display text-[40px] leading-[1.04] font-semibold tracking-[-0.02em]">We build what<br /><span className="text-gradient">answers back.</span></h2>
          <p className="text-white/55 text-[14.5px] mt-4 leading-relaxed">AI employees that pick up, qualify and follow up — in 11 Indian languages — and hand your team only the leads worth calling.</p>
          <div className="mt-7 rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur p-4 font-mono text-[12px] leading-relaxed">
            <div className="text-white/40">CALLER · 9:42 PM · CLINIC</div>
            <div className="text-white/85">“Kal Dr. Sharma available hain? Skin ke liye dikhana hai.”</div>
            <div className="text-[#2DE1C2] mt-2.5">RANA · replies in Hindi</div>
            <div className="text-white/85">“Namaste! Kal 11:30 ka slot khaali hai — aapka naam bataiye?”</div>
            <div className="mt-3 inline-block text-[10.5px] text-[#F5B356] border border-[#F5B356]/50 rounded px-2 py-0.5">APPOINTMENT REQUEST → SENT TO TEAM</div>
          </div>
        </div>
      </aside>
      <main className="flex flex-col items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[400px] animate-rise">
          <Link href="/landing" className="lg:hidden flex items-center justify-center gap-2.5 mb-8">
            <Logo size={34} />
            <span className="font-display text-[22px] font-semibold tracking-tight">RANA<span className="text-gradient"> AI</span></span>
          </Link>
          {children}
          {foot && <div className="text-center text-[12.5px] text-ink-soft mt-6">{foot}</div>}
        </div>
      </main>
    </div>
  );
}
