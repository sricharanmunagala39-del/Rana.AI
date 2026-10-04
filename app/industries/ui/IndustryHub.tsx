"use client";
import { useState } from "react";
import Link from "next/link";
import DemoForm from "@/app/landing/DemoForm";
import { IndustryHeader, IndustryMenu, IndustryFooter } from "./IndustryExperience";

type Item = { slug: string; label: string; mark: string; short: string; h1a: string; count: number; top: string[] };

/** Industries hub: choose your industry, then get a page built only for it. */
export default function IndustryHub({ items }: { items: Item[] }) {
  const [demo, setDemo] = useState<string | null>(null);
  return (
    <div className="site theme-night min-h-screen font-sans" data-testid="industry-hub">
      <div className="aurora" aria-hidden />
      <IndustryHeader onDemo={() => setDemo("industries-hub")} />
      <div className="relative max-w-[1320px] mx-auto px-5 sm:px-8 pt-6 lg:pt-10 grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[230px_minmax(0,1fr)] gap-6 lg:gap-10">
        <IndustryMenu items={items} />
        <main className="min-w-0 pb-10">
          <div className="font-mono text-[11.5px] text-signal tracking-wider">// INDUSTRIES</div>
          <h1 className="font-display font-semibold tracking-[-0.03em] leading-[1.02] text-[38px] sm:text-[54px] mt-3">Pick your industry.<br /><span className="text-gradient">See exactly what Rana does for it.</span></h1>
          <p className="text-ink-soft text-[16.5px] leading-relaxed mt-5 max-w-[700px]">Every industry has its own page: the problems you face, the calls RANA takes off your team, sample calls you can watch, and a live demo you can try — personalised with your own website.</p>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 mt-10">
            {items.map((i) => (
              <Link key={i.slug} href={`/for/${i.slug}`} className="card p-5 flex flex-col group" data-testid={`hub-${i.slug}`}>
                <div className="flex items-center gap-3"><span className="font-mono text-[11px] w-9 h-9 rounded-xl grid place-items-center border border-signal/40 bg-signal/10 text-signal">{i.mark}</span><span className="font-display text-[18px] font-semibold">{i.label}</span></div>
                <p className="text-[14px] mt-3 font-medium">{i.h1a}</p>
                <p className="text-ink-soft text-[13px] mt-1">For {i.short}.</p>
                <ul className="mt-3 flex flex-col gap-1 text-[13px] text-ink-soft flex-1">{i.top.map((t) => <li key={t} className="flex gap-2"><span className="text-signal">›</span>{t}</li>)}</ul>
                <span className="mt-4 text-[13px] font-semibold text-signal group-hover:underline">{i.count} use cases · watch & try →</span>
              </Link>
            ))}
          </div>
          <div id="other" className="card mt-3 p-6 flex flex-col sm:flex-row items-center justify-between gap-4 scroll-mt-24">
            <div><div className="font-display text-[18px] font-semibold">Don&apos;t see your industry?</div><p className="text-ink-soft text-[14px] mt-1">Logistics, legal, salons, gyms, solar, government services — if your team answers or makes calls, RANA can take the repetitive ones.</p></div>
            <button type="button" onClick={() => setDemo("industries-other")} className="btn-glow rounded-full px-5 py-2.5 text-[14px] font-semibold whitespace-nowrap">Design one with us →</button>
          </div>
        </main>
      </div>
      <IndustryFooter />
      <DemoForm open={!!demo} onClose={() => setDemo(null)} source={demo || ""} />
    </div>
  );
}
