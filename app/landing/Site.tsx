"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Orb from "@/components/Orb";
import { Logo } from "@/components/Sidebar";
import { PLANS, FAQ } from "./content";
import { LEGAL_LINKS } from "@/app/legal/legal";

// Public contact address (Zoho Mail inbox for ranaai.in).
const CONTACT_EMAIL = "hello@ranaai.in";
const DEMO = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("RANA AI demo")}&body=${encodeURIComponent("Hi RANA team, I'd like a demo.\n\nCompany:\nCalls we get / make:\nRough monthly call volume:\nPhone:")}`;

const NAV = [["Product", "#product"], ["How it works", "#how"], ["Pricing", "#pricing"], ["FAQ", "#faq"]];

const SCRIPT: { who: "caller" | "ai"; text: string; tag?: string }[] = [
  { who: "caller", text: "Hello, NEET long-term batch fees enti? Weekend classes unnaya?" },
  { who: "ai", text: "Namaskaram! Undi — weekend batch Saturday, Sunday. Fees EMI lo kuda kattochu. Mee peru cheppandi?" },
  { who: "caller", text: "Sneha. Naku repu demo class kavali." },
  { who: "ai", text: "Done Sneha garu — repu 11 AM demo book chesa. Details WhatsApp ki pampistha.", tag: "HOT LEAD · demo booked → sent to your team" },
];

const FEATURES = [
  { k: "INBOUND", t: "Answers every call, 24×7", d: "After hours, during the rush, on Sundays. It picks up in the caller's language, answers questions from your own knowledge, and captures their details.", big: true },
  { k: "OUTBOUND", t: "Calls your lead lists", d: "Upload a list and launch a campaign. Your AI employee dials, follows up and books the next step — no telecaller hiring." },
  { k: "LANGUAGE", t: "11 Indian languages", d: "Telugu, Hindi, Tamil, Kannada, Malayalam, Marathi, Bengali, Gujarati, Punjabi, Urdu and English — and it switches when the caller does." },
  { k: "QUALIFY", t: "Hot · warm · cold, automatically", d: "Every call is recorded, transcribed, summarised and scored. Your team opens the dashboard and calls the ready-to-close leads first." },
  { k: "VOICE", t: "A voice that sounds like you", d: "Pick from natural Indian voices or clone your own, and set the tone — warm counsellor, crisp sales, patient support." },
  { k: "CONTROL", t: "You're in control", d: "Change the script, voice and knowledge yourself and test it on the Talk page before a single customer hears it.", wide: true },
];

const STEPS = [
  { n: "01", t: "Tell it your business", d: "Start from an industry template, add your fees, FAQs and brochure. RANA writes the call playbook for you." },
  { n: "02", t: "Talk to it", d: "Test your AI employee in the browser or have it call your own phone. Tweak until it sounds right." },
  { n: "03", t: "Go live", d: "Point your calls at it or launch a campaign to your lead list. Most teams are live within days." },
  { n: "04", t: "Watch the leads land", d: "Hot leads, follow-ups and every transcript on one dashboard. We review results with you and tune it." },
];


function useReveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll(".reveal"));
    if (!("IntersectionObserver" in window)) { els.forEach((e) => e.classList.add("in")); return; }
    const io = new IntersectionObserver((ents) => ents.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px" });
    els.forEach((e) => io.observe(e));
    const move = (ev: PointerEvent) => {
      const c = (ev.target as HTMLElement)?.closest?.(".card") as HTMLElement | null; if (!c) return;
      const r = c.getBoundingClientRect(); c.style.setProperty("--mx", `${ev.clientX - r.left}px`); c.style.setProperty("--my", `${ev.clientY - r.top}px`);
    };
    document.addEventListener("pointermove", move);
    return () => { io.disconnect(); document.removeEventListener("pointermove", move); };
  }, []);
}

function LiveCall() {
  const [lines, setLines] = useState<{ who: string; text: string; tag?: string }[]>([]);
  const [typing, setTyping] = useState("");
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setLines(SCRIPT); return; }
    let alive = true;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    (async () => {
      while (alive) {
        setLines([]);
        for (const l of SCRIPT) {
          for (let i = 1; i <= l.text.length && alive; i += 2) { setTyping(l.text.slice(0, i)); await sleep(22); }
          if (!alive) return;
          setTyping(""); setLines((x) => [...x, l]); await sleep(900);
        }
        await sleep(4200);
      }
    })();
    return () => { alive = false; };
  }, []);
  const next = SCRIPT[lines.length];
  return (
    <div className="card p-5 sm:p-6 font-mono text-[12.5px]" data-testid="live-call">
      <div className="flex justify-between items-center text-ink-soft text-[11px] mb-4">
        <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-signal live-dot" /> LIVE · INBOUND · +91 ••••• 42118</span>
        <span>TELUGU ⇄ ENGLISH</span>
      </div>
      <div className="wave flex items-end gap-[3px] h-12 mb-5" aria-hidden>
        {Array.from({ length: 44 }, (_, i) => <i key={i} style={{ animationDelay: `${(i % 11) * 0.08}s` }} />)}
      </div>
      <div className="flex flex-col gap-3 min-h-[228px]">
        {lines.map((l, i) => (
          <div key={i} className="animate-rise">
            <div className={`text-[10.5px] mb-0.5 ${l.who === "ai" ? "text-signal" : "text-ink-soft"}`}>{l.who === "ai" ? "RANA · AI EMPLOYEE" : "CALLER"}</div>
            <div className="text-ink/90 font-sans text-[13.5px] leading-snug">{l.text}</div>
            {l.tag && <div className="mt-2.5 inline-block text-[10.5px] text-hot border border-hot/60 bg-hot/10 rounded px-2 py-0.5">{l.tag}</div>}
          </div>
        ))}
        {typing && next && (
          <div>
            <div className={`text-[10.5px] mb-0.5 ${next.who === "ai" ? "text-signal" : "text-ink-soft"}`}>{next.who === "ai" ? "RANA · AI EMPLOYEE" : "CALLER"}</div>
            <div className="text-ink/90 font-sans text-[13.5px] leading-snug caret">{typing}</div>
          </div>
        )}
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2 mt-5 pt-5 border-t border-white/10 text-[10.5px] text-center text-ink-soft">
        <div className="border border-white/10 rounded-lg py-2">CALL</div><span className="text-signal">→</span>
        <div className="border border-signal/60 text-signal rounded-lg py-2 shadow-glow">RANA CORE</div><span className="text-signal">→</span>
        <div className="border border-white/10 rounded-lg py-2">YOUR TEAM</div>
      </div>
    </div>
  );
}

function Count({ to, suffix = "", pad = 0 }: { to: number; suffix?: string; pad?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [v, setV] = useState(to);
  useEffect(() => {
    const el = ref.current; if (!el || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    setV(0);
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return; io.disconnect();
      const t0 = performance.now();
      const step = (t: number) => { const k = Math.min(1, (t - t0) / 1200); setV(Math.round(to * (1 - Math.pow(1 - k, 3)))); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
    io.observe(el); return () => io.disconnect();
  }, [to]);
  return <span ref={ref}>{String(v).padStart(pad, "0")}{suffix}</span>;
}

function DashboardPreview() {
  const bars = [22, 30, 26, 44, 38, 52, 47, 63, 58, 71, 66, 80];
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-center gap-1.5 mb-4"><span className="w-2.5 h-2.5 rounded-full bg-miss/70" /><span className="w-2.5 h-2.5 rounded-full bg-hot/70" /><span className="w-2.5 h-2.5 rounded-full bg-signal/70" /><span className="ml-3 text-[11px] font-mono text-ink-soft">app · Dashboard · Today</span></div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-3">
        {[["Total calls", "842", "+12%"], ["Connected", "391", "46%"], ["Hot leads", "57", "+9"], ["Talk time", "19h 40m", "avg 3m"]].map(([k, v, s]) => (
          <div key={k} className="rounded-xl border border-white/[.07] bg-white/[.02] p-3">
            <div className="text-[10.5px] text-ink-soft">{k}</div>
            <div className="font-display text-[20px] font-semibold">{v}</div>
            <div className="text-[10.5px] text-signal">▲ {s}</div>
          </div>
        ))}
      </div>
      <div className="grid sm:grid-cols-[1.4fr_1fr] gap-2.5">
        <div className="rounded-xl border border-white/[.07] bg-white/[.02] p-3">
          <div className="text-[11px] text-ink-soft mb-2 flex justify-between"><span>Calls by hour</span><span><span className="text-signal">■</span> in <span className="text-violet ml-1">■</span> out</span></div>
          <div className="flex items-end gap-1.5 h-[110px]">
            {bars.map((b, i) => (
              <div key={i} className="flex-1 flex flex-col justify-end gap-[2px] h-full">
                <div className="rounded-t bg-violet/80" style={{ height: `${b * 0.55}%` }} />
                <div className="bg-signal/90" style={{ height: `${b * 0.45}%` }} />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-white/[.07] bg-white/[.02] p-3 text-[12px]">
          <div className="text-[11px] text-ink-soft mb-2">Hot leads — call these now</div>
          {[["Sneha R.", "Ready to close", "text-signal bg-signal/10"], ["Karthik", "Hot", "text-hot bg-hot/10"], ["Irfan M.", "Hot", "text-hot bg-hot/10"], ["Divya N.", "Warm", "text-warm bg-warm/10"]].map(([n, s, c]) => (
            <div key={n} className="flex justify-between items-center py-1.5 border-b border-white/[.06] last:border-0"><span className="font-medium">{n}</span><span className={`text-[10.5px] font-semibold rounded-full px-2 py-0.5 ${c}`}>{s}</span></div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Site() {
  useReveal();
  const [menu, setMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => { const f = () => setScrolled(window.scrollY > 12); f(); window.addEventListener("scroll", f, { passive: true }); return () => window.removeEventListener("scroll", f); }, []);
  useEffect(() => { document.body.style.overflow = menu ? "hidden" : ""; }, [menu]);

  return (
    <div className="site theme-night min-h-screen font-sans">
      <div className="aurora" aria-hidden />

      {/* ---------- Nav ---------- */}
      <header className={`sticky top-0 z-50 transition-all ${scrolled ? "glass border-b border-white/[.06]" : ""}`}>
        <div className="max-w-[1160px] mx-auto px-5 sm:px-8 h-[68px] flex items-center justify-between">
          <a href="#top" className="flex items-center gap-2.5"><Logo size={30} /><span className="font-display text-[18px] font-semibold tracking-tight">RANA<span className="text-gradient"> AI</span></span></a>
          <nav className="hidden md:flex items-center gap-8 text-[13.5px] text-ink-soft">
            {NAV.map(([l, h]) => <a key={h} href={h} className="hover:text-ink">{l}</a>)}
          </nav>
          <div className="hidden md:flex items-center gap-3">
            <Link href="/login" className="text-[13.5px] font-medium text-ink-soft hover:text-ink px-3 py-2">Sign in</Link>
            <Link href="/signup" className="btn-glow rounded-full px-4 py-2 text-[13.5px] font-semibold" data-testid="nav-trial">Start free trial</Link>
          </div>
          <button onClick={() => setMenu(true)} className="md:hidden font-mono text-[12px] border border-signal/60 text-signal rounded-full px-4 py-2" aria-label="Open menu" data-testid="menu-btn">MENU +</button>
        </div>
      </header>
      {menu && (
        <div className="fixed inset-0 z-[60] bg-paper/95 backdrop-blur-xl flex flex-col items-center justify-center gap-6 animate-rise" data-testid="menu">
          <button onClick={() => setMenu(false)} className="absolute top-5 right-6 text-[32px] leading-none text-ink-soft" aria-label="Close menu">×</button>
          {NAV.map(([l, h]) => <a key={h} href={h} onClick={() => setMenu(false)} className="font-display text-[36px] font-semibold tracking-tight hover:text-signal">{l}</a>)}
          <div className="flex gap-3 mt-4">
            <Link href="/login" className="btn-ghost rounded-full px-5 py-3 text-[14px] font-medium">Sign in</Link>
            <Link href="/signup" className="btn-glow rounded-full px-5 py-3 text-[14px] font-semibold">Start free trial</Link>
          </div>
        </div>
      )}

      <main id="top">
        {/* ---------- Hero ---------- */}
        <section className="max-w-[1160px] mx-auto px-5 sm:px-8 pt-10 sm:pt-16 pb-16 grid lg:grid-cols-[1.05fr_1fr] gap-10 lg:gap-6 items-center">
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center gap-2 font-mono text-[11.5px] text-signal border border-signal/25 bg-signal/10 rounded-full px-3 py-1.5 mb-7">
              <span className="w-1.5 h-1.5 rounded-full bg-signal live-dot" /> STATUS: ANSWERING CALLS, RIGHT NOW
            </div>
            <h1>
              <span className="block eyebrow uppercase mb-4">AI voice agents for Indian businesses</span>
              <span className="block font-display font-semibold tracking-[-0.035em] leading-[0.98] text-[46px] sm:text-[64px] lg:text-[72px]">
                We build what<br /><span className="text-gradient">answers back.</span>
              </span>
            </h1>
            <p className="text-ink-soft text-[16.5px] sm:text-[18px] leading-relaxed mt-6 max-w-[540px] mx-auto lg:mx-0">
              AI calling agents that answer and make your business calls in Telugu, Hindi, Tamil and 8 more Indian languages, understand what each caller needs, and hand your team only the leads worth calling back.
            </p>
            <div className="flex flex-wrap gap-3 mt-9 justify-center lg:justify-start">
              <Link href="/signup" className="btn-glow rounded-full px-6 py-3.5 text-[15px] font-semibold" data-testid="hero-trial">Start free — 14 days</Link>
              <a href={DEMO} className="btn-ghost rounded-full px-6 py-3.5 text-[15px] font-medium">Book a demo →</a>
            </div>
            <div className="text-[12.5px] text-ink-soft/80 mt-4">100 free minutes · no card needed · cancel anytime</div>
          </div>
          <div className="relative flex flex-col items-center">
            <Orb size={520} interactive className="max-w-full" />
            <div className="font-mono text-[11px] text-ink-soft/70 -mt-4">press &amp; hold the core</div>
          </div>
        </section>

        {/* ---------- Stats ---------- */}
        <section className="max-w-[1160px] mx-auto px-5 sm:px-8 pb-14">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[[<Count key="a" to={11} />, "Indian languages"], ["24×7", "Answers every call"], [<Count key="b" to={14} />, "Day free trial"], [<><Count key="c" to={30} />s</>, "Billing pulses — not full minutes"]].map(([v, l], i) => (
              <div key={i} className="card px-5 py-5 text-center">
                <div className="font-display text-[30px] sm:text-[36px] font-semibold text-gradient">{v}</div>
                <div className="text-[12.5px] text-ink-soft mt-1">{l}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- Marquee ---------- */}
        <div className="border-y border-white/[.06] py-4 overflow-hidden" aria-hidden>
          <div className="marquee-track font-mono text-[13px] text-ink-soft">
            {[0, 1].map((k) => (
              <div key={k} className="flex">
                {["ANSWER EVERY CALL", "CAPTURE EVERY LEAD", "NEVER GO COLD", "11 INDIAN LANGUAGES", "INBOUND + OUTBOUND", "LIVE IN DAYS", "PAY BY UPI", "YOUR OWN VOICE"].map((t) => (
                  <span key={t} className="px-8 whitespace-nowrap"><b className="text-signal mr-2">●</b>{t}</span>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* ---------- Live demo + chain ---------- */}
        <section id="product" className="max-w-[1160px] mx-auto px-5 sm:px-8 py-24 grid lg:grid-cols-2 gap-12 items-center">
          <div className="reveal">
            <div className="eyebrow">// HOW WE THINK ABOUT IT</div>
            <p className="font-display font-semibold tracking-tight text-[28px] sm:text-[40px] leading-tight mt-4">
              CALL <b className="text-signal">→</b> DATA <b className="text-signal">→</b> AI <b className="text-signal">→</b> ACTION <b className="text-signal">→</b> <span className="text-gradient">RESULT</span>
            </p>
            <p className="text-ink-soft text-[16px] leading-relaxed mt-5 max-w-[480px]">
              Every conversation becomes structured data. Every signal becomes an action your team doesn&apos;t have to chase. Watch a real-style call on the right — Telugu in, qualified lead out.
            </p>
            <div className="mt-8 card p-5">
              <div className="eyebrow">// THE GAP</div>
              <div className="font-display text-[20px] font-semibold mt-2">Missed calls don&apos;t show up on any dashboard.</div>
              <p className="text-ink-soft text-[14px] leading-relaxed mt-2">A call after hours, during a rush, or in a language the front desk isn&apos;t fluent in — it just doesn&apos;t get answered. Nobody finds out what that lead was worth.</p>
            </div>
          </div>
          <div className="reveal"><LiveCall /></div>
        </section>

        {/* ---------- Features (bento) ---------- */}
        <section className="max-w-[1160px] mx-auto px-5 sm:px-8 pb-24">
          <div className="reveal max-w-[640px]">
            <div className="eyebrow">// WHAT YOU GET</div>
            <h2 className="font-display text-[32px] sm:text-[46px] font-semibold tracking-[-0.025em] leading-[1.05] mt-3">One AI employee.<br /><span className="text-ink-soft">Every call your team can&apos;t get to.</span></h2>
          </div>
          <div className="grid md:grid-cols-3 gap-3 mt-10">
            {FEATURES.map((f) => (
              <div key={f.k} className={`card reveal p-6 ${(f as any).wide ? "md:col-span-3" : f.big ? "md:col-span-2" : ""}`}>
                <div className="font-mono text-[11px] text-signal">SVC / {f.k}</div>
                <div className="font-display text-[21px] font-semibold mt-3 tracking-tight">{f.t}</div>
                <p className="text-ink-soft text-[14.5px] leading-relaxed mt-2 max-w-[520px]">{f.d}</p>
              </div>
            ))}
          </div>
          <div className="reveal flex flex-wrap items-center gap-2 mt-5 text-[12.5px]">
            <span className="font-mono text-ink-soft mr-1">COMING NEXT →</span>
            {["WhatsApp follow-ups", "Slack & WhatsApp hot-lead alerts", "CRM sync", "Predictive lead scoring"].map((t) => <span key={t} className="rounded-full border border-white/10 px-3 py-1 text-ink-soft">{t}</span>)}
          </div>
        </section>

        {/* ---------- Dashboard preview ---------- */}
        <section className="max-w-[1160px] mx-auto px-5 sm:px-8 pb-24 grid lg:grid-cols-[1fr_1.35fr] gap-12 items-center">
          <div className="reveal">
            <div className="eyebrow">// YOUR DASHBOARD</div>
            <h2 className="font-display text-[32px] sm:text-[42px] font-semibold tracking-[-0.025em] leading-[1.05] mt-3">Open it once.<br />Know everything.</h2>
            <p className="text-ink-soft text-[16px] leading-relaxed mt-4">Calls, connect rate, talk time, hot leads and every transcript — live. Filter by today, campaign or direction, and see exactly why a call didn&apos;t connect.</p>
            <ul className="mt-6 flex flex-col gap-2.5 text-[14.5px]">
              {["Hot leads ranked so sales calls the right people first", "Campaign-by-campaign results", "Plan minutes and prepaid balance at a glance"].map((t) => <li key={t} className="flex gap-2.5"><span className="text-signal">✓</span>{t}</li>)}
            </ul>
          </div>
          <div className="reveal"><DashboardPreview /></div>
        </section>

        {/* ---------- How it works ---------- */}
        <section id="how" className="border-y border-white/[.06] bg-white/[.012]">
          <div className="max-w-[1160px] mx-auto px-5 sm:px-8 py-24">
            <div className="reveal"><div className="eyebrow">// ROLLOUT</div>
              <h2 className="font-display text-[32px] sm:text-[46px] font-semibold tracking-[-0.025em] mt-3">From sign-up to live calls.</h2></div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-10">
              {STEPS.map((s) => (
                <div key={s.n} className="card reveal p-6">
                  <div className="font-mono text-[28px] font-semibold text-gradient">{s.n}</div>
                  <div className="font-display text-[18px] font-semibold mt-4">{s.t}</div>
                  <p className="text-ink-soft text-[14px] leading-relaxed mt-2">{s.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- Pricing ---------- */}
        <section id="pricing" className="max-w-[1160px] mx-auto px-5 sm:px-8 py-24">
          <div className="reveal text-center max-w-[640px] mx-auto">
            <div className="eyebrow">// PRICING</div>
            <h2 className="font-display text-[32px] sm:text-[46px] font-semibold tracking-[-0.025em] mt-3">Plans that pay for themselves.</h2>
            <p className="text-ink-soft text-[16px] mt-3">Start free for 14 days with 100 minutes. Prices exclude GST, which is added where applicable. Pay annually and the setup fee is waived.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-3 mt-12">
            {PLANS.map((p) => (
              <div key={p.name} className={`card reveal p-7 flex flex-col ${p.hi ? "card-hi md:-translate-y-3" : ""}`} data-testid={`plan-${p.name.toLowerCase()}`}>
                <div className="flex items-center justify-between">
                  <div className="font-display text-[20px] font-semibold">{p.name}</div>
                  {p.hi && <span className="text-[11px] font-mono text-on-accent bg-signal rounded-full px-2.5 py-1">MOST POPULAR</span>}
                </div>
                <div className="mt-5 flex items-baseline gap-1"><span className="text-ink-soft text-[20px]">₹</span><span className="font-display text-[46px] font-semibold tracking-tight">{p.price}</span><span className="text-ink-soft text-[14px]">/month</span></div>
                <div className="text-[13.5px] mt-1"><b>{p.min} minutes</b> <span className="text-ink-soft">· then {p.extra}/min prepaid</span></div>
                <ul className="mt-6 flex flex-col gap-2.5 text-[14px] flex-1">
                  {p.pts.map((t) => <li key={t} className="flex gap-2.5"><span className="text-signal">✓</span>{t}</li>)}
                  <li className="flex gap-2.5 text-ink-soft"><span className="text-ink-soft">+</span>{p.fee} (free on annual)</li>
                </ul>
                <Link href="/signup" className={`mt-7 rounded-full py-3 text-center text-[14px] font-semibold ${p.hi ? "btn-glow" : "btn-ghost"}`}>Start free trial</Link>
              </div>
            ))}
          </div>
          <div className="reveal card mt-3 p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div><div className="font-display text-[20px] font-semibold">Enterprise</div><div className="text-ink-soft text-[14px] mt-1">35,000+ minutes a month, unlimited AI employees, 50 calls at once, and custom per-minute rates.</div></div>
            <a href={DEMO} className="btn-ghost rounded-full px-6 py-3 text-[14px] font-semibold whitespace-nowrap">Talk to us →</a>
          </div>
        </section>

        {/* ---------- Field report + industries ---------- */}
        <section className="max-w-[1160px] mx-auto px-5 sm:px-8 pb-24 grid lg:grid-cols-[1.3fr_1fr] gap-3">
          <div className="card reveal p-8">
            <div className="eyebrow">// FIELD REPORT</div>
            <p className="font-display text-[22px] sm:text-[26px] font-medium leading-snug mt-4 tracking-tight">
              RANA AI is live inside a leading NEET &amp; medical-entrance coaching network across South India — answering admission enquiries and running outbound campaigns end to end.
            </p>
            <div className="font-mono text-[11.5px] text-ink-soft mt-5">Full results will be published here as the numbers come in.</div>
          </div>
          <div className="card reveal p-8">
            <div className="eyebrow">// BUILT FOR</div>
            <div className="flex flex-wrap gap-2 mt-4">
              {["Coaching & test-prep", "Colleges & admissions", "Clinics & diagnostics", "Real estate", "Hospitality", "Local services & franchises"].map((t, i) => (
                <span key={t} className={`rounded-full px-3.5 py-2 text-[13px] border ${i === 0 ? "border-signal/40 bg-signal/10 text-signal" : "border-white/10 text-ink-soft"}`}>{t}</span>
              ))}
            </div>
            <p className="text-ink-soft text-[14px] leading-relaxed mt-5">Built by someone who ran admissions and franchise sales operations inside a coaching network — not a generic AI vendor.</p>
          </div>
        </section>

        {/* ---------- FAQ ---------- */}
        <section id="faq" className="max-w-[860px] mx-auto px-5 sm:px-8 pb-24">
          <div className="reveal text-center"><div className="eyebrow">// FAQ</div><h2 className="font-display text-[32px] sm:text-[42px] font-semibold tracking-[-0.025em] mt-3">Questions, answered.</h2></div>
          <div className="mt-10 flex flex-col gap-2.5">
            {FAQ.map(([q, a]) => (
              <details key={q} className="card reveal group px-6 py-5">
                <summary className="flex items-center justify-between gap-4 cursor-pointer list-none font-display text-[17px] font-semibold">{q}<span className="plus text-signal text-[22px] transition-transform">+</span></summary>
                <p className="text-ink-soft text-[14.5px] leading-relaxed mt-3">{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ---------- Final CTA ---------- */}
        <section className="max-w-[1160px] mx-auto px-5 sm:px-8 pb-20">
          <div className="card card-hi reveal relative overflow-hidden px-6 py-16 sm:py-20 text-center">
            <div className="eyebrow">// CONTACT</div>
            <p className="font-display text-[34px] sm:text-[60px] font-semibold tracking-[-0.03em] leading-[1.02] mt-4">Got a call<br /><span className="text-gradient">you&apos;re missing?</span></p>
            <p className="text-ink-soft text-[16px] mt-5">Hire your first AI employee in minutes. It starts answering today.</p>
            <div className="flex flex-wrap gap-3 justify-center mt-9">
              <Link href="/signup" className="btn-glow rounded-full px-7 py-3.5 text-[15px] font-semibold">Start free — 14 days</Link>
              <a href={`mailto:${CONTACT_EMAIL}`} className="btn-ghost rounded-full px-7 py-3.5 text-[15px] font-medium">{CONTACT_EMAIL}</a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[.06]">
        <div className="max-w-[1160px] mx-auto px-5 sm:px-8 py-10 flex flex-col md:flex-row gap-6 items-center justify-between text-[13px] text-ink-soft">
          <div className="flex items-center gap-2.5"><Logo size={24} /><span>RANA AI — Hyderabad, India</span></div>
          <nav className="flex flex-wrap gap-6 justify-center font-mono text-[12px]">
            {NAV.map(([l, h]) => <a key={h} href={h} className="hover:text-signal">{l}</a>)}
            <Link href="/login" className="hover:text-signal">Sign in</Link>
          </nav>
          <div>© {new Date().getFullYear()} RANA AI</div>
        </div>
        <div className="max-w-[1160px] mx-auto px-5 sm:px-8 pb-8 flex flex-col md:flex-row gap-3 items-center justify-between text-[12px] text-ink-soft/80">
          <nav className="flex flex-wrap gap-x-5 gap-y-2 justify-center font-mono">
            {LEGAL_LINKS.map(([l, h]) => <Link key={h} href={h} className="hover:text-signal">{l}</Link>)}
          </nav>
          <div>RANA AI is a brand of Munagala Sri Charan · {CONTACT_EMAIL}</div>
        </div>
      </footer>
    </div>
  );
}
