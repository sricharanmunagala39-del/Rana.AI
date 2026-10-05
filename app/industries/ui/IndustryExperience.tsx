"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/Sidebar";
import DemoForm from "@/app/landing/DemoForm";
import ProofRunForm from "@/app/landing/ProofRunForm";
import { captureUtm } from "@/app/landing/utm";
import { LEGAL_LINKS } from "@/app/legal/legal";
import type { Industry, UseCase } from "../types";
import type { SiteProfile } from "@/lib/siteProfile";
import SamplePlayer from "./SamplePlayer";
import LiveDemo from "./LiveDemo";
import LanguagePicker from "@/components/LanguagePicker";

export type MenuItem = { slug: string; label: string; mark: string };

/** Top bar shared by the industry pages. */
export function IndustryHeader({ onDemo }: { onDemo: () => void }) {
  return (
    <header className="sticky top-0 z-50 glass border-b border-white/[.06]">
      <div className="max-w-[1320px] mx-auto px-5 sm:px-8 h-[64px] flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5 shrink-0"><Logo size={28} /><span className="font-display text-[17px] font-semibold tracking-tight">RANA<span className="text-gradient"> AI</span></span></Link>
        <nav className="hidden md:flex items-center gap-6 text-[13.5px] text-ink-soft">
          <Link href="/for" className="hover:text-ink">Industries</Link>
          <Link href="/#how" className="hover:text-ink">How it works</Link>
          <Link href="/#pricing" className="hover:text-ink">Pricing</Link>
        </nav>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onDemo} className="hidden sm:inline-flex btn-ghost rounded-full px-4 py-2 text-[13px] font-medium">Book a demo</button>
          <Link href="/signup" className="btn-glow rounded-full px-4 py-2 text-[13px] font-semibold">Start free trial</Link>
        </div>
      </div>
    </header>
  );
}

/** The vertical industry menu (a sideways strip on phones). */
export function IndustryMenu({ items, active }: { items: MenuItem[]; active?: string }) {
  return (
    <nav aria-label="Industries" data-testid="industry-menu" className="lg:sticky lg:top-[84px] lg:self-start">
      <div className="hidden lg:block font-mono text-[10.5px] tracking-[0.16em] text-ink-soft/80 mb-3 px-2">INDUSTRIES</div>
      <ul className="flex lg:flex-col gap-1.5 overflow-x-auto no-scrollbar -mx-5 px-5 lg:mx-0 lg:px-0 pb-1 lg:pb-0">
        {items.map((i) => {
          const on = i.slug === active;
          return (
            <li key={i.slug} className="shrink-0">
              <Link href={`/for/${i.slug}`} aria-current={on ? "page" : undefined} data-testid={`menu-${i.slug}`}
                className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-[13.5px] transition-colors whitespace-nowrap ${on ? "border-signal/60 bg-signal/10 text-signal font-semibold" : "border-transparent text-ink-soft hover:text-ink hover:bg-white/[.04]"}`}>
                <span className={`font-mono text-[10.5px] w-7 h-7 rounded-lg grid place-items-center border ${on ? "border-signal/50 bg-signal/15" : "border-white/10 bg-white/[.03]"}`}>{i.mark}</span>{i.label}
              </Link>
            </li>
          );
        })}
        <li className="shrink-0 lg:mt-3"><Link href="/for#other" className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] text-ink-soft hover:text-ink whitespace-nowrap"><span className="font-mono text-[10.5px] w-7 h-7 rounded-lg grid place-items-center border border-dashed border-white/15">+</span>Other industries</Link></li>
      </ul>
    </nav>
  );
}

export function IndustryFooter() {
  return (
    <footer className="border-t border-white/[.06] mt-10">
      <div className="max-w-[1320px] mx-auto px-5 sm:px-8 py-8 flex flex-col md:flex-row gap-4 items-center justify-between text-[12.5px] text-ink-soft">
        <div className="flex items-center gap-3"><Logo size={22} /><span>RANA AI · Hyderabad, India · hello@ranaai.in</span></div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2 justify-center font-mono text-[11.5px]">{LEGAL_LINKS.map(([l, h]) => <Link key={h} href={h} className="hover:text-signal">{l}</Link>)}</nav>
      </div>
    </footer>
  );
}

const sec = "scroll-mt-24";

/** One industry, end to end: problem → how RANA helps → use cases → watch / try / personalise → build. */
export default function IndustryExperience({ ind, menu }: { ind: Industry; menu: MenuItem[] }) {
  const [ucKey, setUcKey] = useState(ind.useCases.find((u) => u.key === "screening")?.key || ind.useCases[0].key);
  const [tab, setTab] = useState<"sample" | "live">("sample");
  const [lang, setLang] = useState("en");
  const [url, setUrl] = useState("");
  const [profile, setProfile] = useState<SiteProfile | null>(null);
  const [reading, setReading] = useState(false);
  const [readErr, setReadErr] = useState("");
  const [demo, setDemo] = useState<string | null>(null);
  const [proof, setProof] = useState(false);
  const studio = useRef<HTMLDivElement>(null);
  const uc = ind.useCases.find((u) => u.key === ucKey) || ind.useCases[0];
  const biz = profile?.company || ind.biz;

  useEffect(() => { captureUtm(); }, []);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const u = q.get("uc"); if (u && ind.useCases.some((x) => x.key === u)) setUcKey(u);
    if (q.get("try") === "1") setTab("live");
  }, [ind]);

  const open = (key: string, t: "sample" | "live") => { setUcKey(key); setTab(t); studio.current?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  async function readSite(e?: React.FormEvent) {
    e?.preventDefault(); if (!url.trim()) return;
    setReading(true); setReadErr("");
    try {
      const r = await fetch("/api/public/site-profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "We couldn't read that website.");
      setProfile(j.profile);
    } catch (e: any) { setReadErr(e.message); } finally { setReading(false); }
  }

  return (
    <div className="site theme-night min-h-screen font-sans" data-testid="industry-page">
      <div className="aurora" aria-hidden />
      <IndustryHeader onDemo={() => setDemo(`industry-${ind.slug}`)} />
      <div className="relative max-w-[1320px] mx-auto px-5 sm:px-8 pt-6 lg:pt-10 grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[230px_minmax(0,1fr)] gap-6 lg:gap-10">
        <IndustryMenu items={menu} active={ind.slug} />
        <main className="min-w-0">
          {/* Overview */}
          <section className="pb-14">
            <div className="font-mono text-[11.5px] text-signal tracking-wider">// RANA AI FOR {ind.label.toUpperCase()}</div>
            <h1 className="font-display font-semibold tracking-[-0.03em] leading-[1.02] text-[38px] sm:text-[54px] mt-3">{ind.h1a}<br /><span className="text-gradient">{ind.h1b}</span></h1>
            <p className="text-ink-soft text-[16.5px] leading-relaxed mt-5 max-w-[720px]">{ind.sub}</p>
            <div className="flex flex-wrap gap-3 mt-7">
              <button type="button" onClick={() => open(uc.key, "live")} className="btn-glow rounded-full px-6 py-3 text-[15px] font-semibold" data-testid="hero-live">Try a live {ind.label} demo</button>
              <button type="button" onClick={() => open(uc.key, "sample")} className="btn-ghost rounded-full px-6 py-3 text-[15px] font-medium">Watch a sample call</button>
            </div>
            <div className="flex flex-wrap gap-2 mt-6 text-[12px] font-mono text-ink-soft">
              {[`${ind.useCases.length} use cases`, "Inbound + outbound", "11 Indian languages + English", "Live in days"].map((t) => <span key={t} className="rounded-full border border-white/10 px-3 py-1">{t}</span>)}
            </div>
          </section>

          {/* Challenges */}
          <section id="challenges" className={`${sec} pb-16`}>
            <div className="eyebrow">// THE CHALLENGE</div>
            <h2 className="font-display text-[28px] sm:text-[38px] font-semibold tracking-[-0.025em] leading-[1.08] mt-2">What slows down {ind.short}.</h2>
            <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3 mt-7">
              {ind.challenges.map(([t, d], i) => (
                <div key={t} className="card p-5">
                  <div className="font-mono text-[11px] text-hot">0{i + 1}</div>
                  <div className="font-display text-[16.5px] font-semibold mt-2 leading-snug">{t}</div>
                  <p className="text-ink-soft text-[13.5px] leading-relaxed mt-1.5">{d}</p>
                </div>
              ))}
            </div>
          </section>

          {/* How RANA helps: the journey */}
          <section id="how-it-helps" className={`${sec} pb-16`}>
            <div className="eyebrow">// HOW RANA AI HELPS</div>
            <h2 className="font-display text-[28px] sm:text-[38px] font-semibold tracking-[-0.025em] leading-[1.08] mt-2">One AI employee across the whole journey.</h2>
            <ol className="mt-8 grid grid-cols-1 sm:grid-cols-3 xl:grid-cols-6 gap-2" data-testid="flow">
              {ind.flow.map((f, i) => (
                <li key={f} className="relative card p-4 flex flex-col gap-2">
                  <span className="font-mono text-[11px] text-signal">STEP {i + 1}</span>
                  <span className="font-display text-[16px] font-semibold leading-snug">{f}</span>
                  {i < ind.flow.length - 1 && <span aria-hidden className="hidden xl:block absolute -right-2 top-1/2 -translate-y-1/2 text-signal z-10">›</span>}
                </li>
              ))}
            </ol>
            <p className="text-ink-soft text-[14px] mt-4 max-w-[760px]">Each step below is a call RANA can make or take for you — every call recorded, transcribed, summarised and scored, with hot results sent to your team instantly.</p>
          </section>

          {/* Use cases */}
          <section id="use-cases" className={`${sec} pb-16`}>
            <div className="eyebrow">// USE CASES</div>
            <h2 className="font-display text-[28px] sm:text-[38px] font-semibold tracking-[-0.025em] leading-[1.08] mt-2">{ind.useCases.length} ways RANA AI can work for your {ind.label === "HR & Recruitment" ? "HR team" : `${ind.label.toLowerCase()} business`}.</h2>
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 mt-7">
              {ind.useCases.map((u, i) => (
                <div key={u.key} className={`card p-5 flex flex-col ${u.key === ucKey ? "card-hi" : ""}`} data-testid={`uc-${u.key}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-ink-soft">{String(i + 1).padStart(2, "0")}</span>
                    <span className={`font-mono text-[10px] rounded-full px-2 py-0.5 border ${u.dir === "out" ? "text-violet border-violet/40" : "text-signal border-signal/40"}`}>{u.dir === "out" ? "OUTBOUND" : "INBOUND"}</span>
                  </div>
                  <div className="font-display text-[17px] font-semibold mt-2 leading-snug">{u.title}</div>
                  <p className="text-ink-soft text-[13.5px] leading-relaxed mt-1.5 flex-1">{u.line}</p>
                  <div className="flex gap-2 mt-4">
                    <button type="button" onClick={() => open(u.key, "sample")} className="btn-ghost rounded-full px-3.5 py-1.5 text-[12.5px] font-medium">▶ Watch sample</button>
                    <button type="button" onClick={() => open(u.key, "live")} className="btn-glow rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold" data-testid={`try-${u.key}`}>Try live</button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Demo studio */}
          <section id="demo" ref={studio} className={`${sec} pb-16`} data-testid="studio">
            <div className="eyebrow">// EXPERIENCE IT</div>
            <h2 className="font-display text-[28px] sm:text-[38px] font-semibold tracking-[-0.025em] leading-[1.08] mt-2">Pick a use case. Watch it. Then try it yourself.</h2>
            <div className="grid xl:grid-cols-[340px_minmax(0,1fr)] gap-3 mt-7">
              <div className="card p-5 flex flex-col gap-5">
                <div>
                  <div className="font-mono text-[11px] text-signal mb-2">1 · WHAT SHOULD RANA DEMONSTRATE?</div>
                  <select value={ucKey} onChange={(e) => setUcKey(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/[.04] px-3 py-2.5 text-[14px]" aria-label="Use case" data-testid="studio-uc">
                    <optgroup label="They call you · Inbound">{ind.useCases.filter((u) => u.dir === "in").map((u) => <option key={u.key} value={u.key}>{u.title}</option>)}</optgroup>
                    <optgroup label="Rana calls them · Outbound">{ind.useCases.filter((u) => u.dir === "out").map((u) => <option key={u.key} value={u.key}>{u.title}</option>)}</optgroup>
                  </select>
                  <p className="text-[12.5px] text-ink-soft mt-2"><span className={`font-mono text-[10.5px] mr-1.5 ${uc.dir === "out" ? "text-violet" : "text-signal"}`}>{uc.dir === "out" ? "OUTBOUND" : "INBOUND"}</span>{uc.line}</p>
                </div>
                <form onSubmit={readSite}>
                  <div className="font-mono text-[11px] text-signal mb-2">2 · PERSONALISE WITH YOUR WEBSITE <span className="text-ink-soft">(OPTIONAL)</span></div>
                  <div className="flex gap-2">
                    <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="yourcompany.com" inputMode="url" className="flex-1 min-w-0 rounded-xl border border-white/10 bg-white/[.04] px-3 py-2.5 text-[14px] outline-none focus:border-signal/70" aria-label="Your company website" data-testid="studio-url" />
                    <button disabled={reading || !url.trim()} className="btn-ghost rounded-xl px-3.5 text-[13px] font-semibold disabled:opacity-50" data-testid="studio-read">{reading ? "Reading…" : "Use it"}</button>
                  </div>
                  {readErr && <p className="text-[12.5px] text-miss mt-2" role="alert">{readErr}</p>}
                  {profile ? (
                    <div className="mt-3 rounded-xl border border-signal/25 bg-signal/[.06] p-3 text-[12.5px]" data-testid="studio-profile">
                      <div className="flex items-center justify-between gap-2"><b className="text-[13.5px]">{profile.company}</b><button type="button" onClick={() => { setProfile(null); setUrl(""); }} className="text-ink-soft hover:text-ink">Clear</button></div>
                      {profile.summary && <p className="text-ink-soft mt-1 leading-relaxed">{profile.summary}</p>}
                      {profile.offerings.length > 0 && <div className="flex flex-wrap gap-1 mt-2">{profile.offerings.slice(0, 5).map((o) => <span key={o} className="rounded-full border border-white/10 px-2 py-0.5">{o}</span>)}</div>}
                      <p className="text-ink-soft mt-2">Rana will now speak as <b className="text-ink">{profile.company}</b>.</p>
                    </div>
                  ) : <p className="text-[12px] text-ink-soft mt-2">Without a website, Rana plays <b>{ind.biz}</b>, {ind.bizLine}.</p>}
                </form>
                <div>
                  <div className="font-mono text-[11px] text-signal mb-2">3 · LANGUAGE</div>
                  <LanguagePicker value={lang} onChange={setLang} />
                </div>
              </div>
              <div className="card card-hi p-5 sm:p-6 min-h-[460px] flex flex-col">
                <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
                  <div>
                    <div className="font-mono text-[11px] text-ink-soft">{ind.label.toUpperCase()} · {uc.title.toUpperCase()}</div>
                    <div className="font-display text-[19px] font-semibold mt-1">{biz}</div>
                  </div>
                  <div className="inline-flex rounded-full border border-white/10 bg-white/[.03] p-1" role="tablist">
                    <button type="button" role="tab" aria-selected={tab === "sample"} onClick={() => setTab("sample")} className={`rounded-full px-4 py-1.5 text-[13px] ${tab === "sample" ? "bg-signal text-on-accent font-semibold" : "text-ink-soft"}`} data-testid="tab-sample">Watch sample</button>
                    <button type="button" role="tab" aria-selected={tab === "live"} onClick={() => setTab("live")} className={`rounded-full px-4 py-1.5 text-[13px] ${tab === "live" ? "bg-signal text-on-accent font-semibold" : "text-ink-soft"}`} data-testid="tab-live">Try live demo</button>
                  </div>
                </div>
                <div className="flex-1">
                  {tab === "sample"
                    ? <SamplePlayer uc={uc} biz={biz} them={ind.them} onTryLive={() => setTab("live")} />
                    : <LiveDemo ind={ind} uc={uc} profile={profile} lang={lang} onBuild={() => setProof(true)} />}
                </div>
              </div>
            </div>
          </section>

          {/* Customise */}
          <section id="customise" className={`${sec} pb-16`}>
            <div className="grid lg:grid-cols-[1fr_1.1fr] gap-6 items-start">
              <div>
                <div className="eyebrow">// MAKE IT YOURS</div>
                <h2 className="font-display text-[28px] sm:text-[38px] font-semibold tracking-[-0.025em] leading-[1.08] mt-2">Customised to your business, not a template.</h2>
                <p className="text-ink-soft text-[15px] leading-relaxed mt-3">You decide what Rana knows, asks, says and where the results go. Change it any time in plain language and test it before a single {ind.them} hears it.</p>
                <ol className="mt-6 flex flex-col gap-3 text-[14px]">
                  {["Share your information — website, brochure, FAQs, price lists", "Pick use cases and write (or let RANA write) the script", "Test it by talking to it, then go live on your number or list", "Watch results land: recordings, transcripts, scores, alerts"].map((t, i) => <li key={t} className="flex gap-3"><span className="font-mono text-signal">0{i + 1}</span>{t}</li>)}
                </ol>
              </div>
              <div className="card p-6">
                <div className="font-mono text-[11px] text-signal">YOU CONTROL</div>
                <ul className="mt-4 grid sm:grid-cols-2 gap-3 text-[14px]">{ind.customize.map((c) => <li key={c} className="flex gap-2.5"><span className="text-signal">✓</span>{c}</li>)}</ul>
              </div>
            </div>
          </section>

          {/* FAQ */}
          <section className={`${sec} pb-16 max-w-[860px]`}>
            <div className="eyebrow">// QUESTIONS</div>
            <div className="mt-4 flex flex-col gap-2.5">
              {ind.faq.map(([q, a]) => (
                <details key={q} className="card group px-5 py-4"><summary className="flex items-center justify-between gap-4 cursor-pointer list-none font-display text-[16px] font-semibold">{q}<span className="plus text-signal text-[20px] transition-transform">+</span></summary><p className="text-ink-soft text-[14px] leading-relaxed mt-2.5">{a}</p></details>
              ))}
            </div>
          </section>

          {/* Build CTA */}
          <section className="pb-10">
            <div className="card card-hi relative overflow-hidden px-6 py-12 sm:py-14 text-center">
              <div className="eyebrow">// NEXT STEP</div>
              <p className="font-display text-[30px] sm:text-[46px] font-semibold tracking-[-0.03em] leading-[1.05] mt-3">Build Rana AI for<br /><span className="text-gradient">your {ind.label === "HR & Recruitment" ? "HR team" : "business"}.</span></p>
              <p className="text-ink-soft text-[15px] mt-4 max-w-[560px] mx-auto">Start with a free proof run on your own {ind.them}s, or let our team set it up with your scripts and data.</p>
              <div className="flex flex-wrap gap-3 justify-center mt-7">
                <button type="button" onClick={() => setProof(true)} className="btn-glow rounded-full px-6 py-3 text-[15px] font-semibold" data-testid="cta-proof">Free proof run on my data</button>
                <button type="button" onClick={() => setDemo(`industry-${ind.slug}-cta`)} className="btn-ghost rounded-full px-6 py-3 text-[15px] font-medium">Book a demo</button>
                <Link href="/signup" className="btn-ghost rounded-full px-6 py-3 text-[15px] font-medium">Start free trial</Link>
              </div>
            </div>
          </section>
        </main>
      </div>
      <IndustryFooter />
      <ProofRunForm open={proof} onClose={() => setProof(false)} industry={ind.label} />
      <DemoForm open={!!demo} onClose={() => setDemo(null)} source={demo || ""} prefill={profile ? { company: profile.company, message: `Industry: ${ind.label} · Use case: ${uc.title} · Website: ${profile.url}` } : { message: `Industry: ${ind.label} · Use case: ${uc.title}` }} />
    </div>
  );
}
