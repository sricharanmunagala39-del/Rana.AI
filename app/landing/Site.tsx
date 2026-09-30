"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import RanaCore from "@/components/RanaCore";
import Integrations from "@/components/Integrations";
import { Logo } from "@/components/Sidebar";
import { INDUSTRY_CALLS, GLOBAL_CALLS, USE_CASES, ENGINES_LINE, CALC, CALL_LANGUAGE_COUNT, plansFor, faqFor, type Line, type IndustryCall } from "./content";
import { TRIAL_DAYS, TRIAL_MINUTES, PLANS as PRICE_LIST, PRICE_BOOK, CURRENCIES, CURRENCY_SYMBOL as SYMBOL, money, moneyShort, type Currency } from "@/lib/pricing";
import { MARKETS, MARKET_KEYS, MARKET_COOKIE, marketForZone, type Market, type MarketKey } from "./markets";
import DemoForm, { type DemoPrefill } from "./DemoForm";
import RanaLive, { type LiveMode } from "./RanaLive";
import { SCENARIOS, type DemoKey } from "./talkContent";
import { captureUtm } from "./utm";
import { LEGAL_LINKS, SOCIAL_LINKS } from "@/app/legal/legal";

// Public contact address (Zoho Mail inbox for ranaai.in).
const CONTACT_EMAIL = "hello@ranaai.in";

const CUR_NOTE: Record<Currency, string> = { INR: "Prices in Indian rupees, excluding 18% GST.", USD: "Prices in US dollars, excluding local taxes.", EUR: "Prices in euros, excluding VAT.", JPY: "Prices in Japanese yen, excluding consumption tax." };

const NAV = [["Industries", "#industries"], ["How it works", "#how"], ["Pricing", "#pricing"], ["FAQ", "#faq"]];

function MicIcon({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>;
}

const featuresFor = (india: boolean) => [
  { k: "INBOUND", t: "Answers every call, 24×7", d: "After hours, during the rush, on Sundays. It picks up in the caller's language, answers questions from your own knowledge, and captures their details.", big: true },
  { k: "OUTBOUND", t: "Calls your lead lists", d: `Upload a list and launch a campaign. Your AI employee dials, follows up and books the next step — ${india ? "no telecaller hiring" : "no extra hiring"}.` },
  india
    ? { k: "LANGUAGE", t: "Indian + global languages", d: "11 Indian languages — the mother tongues of nearly 9 in 10 Indians — switching when the caller does. Plus Spanish, French and Japanese for callers abroad." }
    : { k: "LANGUAGE", t: "Global + Indian languages", d: "English, Spanish, French, Japanese and Hindi — plus 9 more Indian languages that switch when the caller does. Voices in 40+ languages." },
  { k: "QUALIFY", t: "Hot · warm · cold, automatically", d: "Every call is recorded, transcribed, summarised and scored. Your team opens the dashboard and calls the ready-to-close leads first." },
  { k: "VOICE", t: "A voice that sounds like you", d: `Pick from ${india ? "natural Indian voices" : "900+ natural voices"} or clone your own, and set the tone — warm counsellor, crisp sales, patient support.` },
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

/** Crawlable links to the SEO pages (kept small here so the client bundle doesn't load their content). */
const EXPLORE: [string, [string, string][]][] = [
  ["Solutions", [["AI calling agent", "/ai-calling-agent"], ["AI receptionist", "/ai-receptionist"], ["AI receptionist for clinics", "/ai-receptionist-for-clinics"], ["AI telecaller", "/ai-telecaller"], ["AI voice calling", "/ai-voice-calling"], ["Telecaller software", "/telecaller-software"], ["Pricing", "/pricing"]]],
  ["Languages & cities", [["Telugu AI voice agent", "/telugu-ai-voice-agent"], ["Hindi AI voice agent", "/hindi-ai-voice-agent"], ["Tamil AI voice agent", "/tamil-ai-voice-agent"], ["Kannada AI voice agent", "/kannada-ai-voice-agent"], ["Hyderabad", "/ai-voice-agent-hyderabad"], ["Vijayawada", "/ai-voice-agent-vijayawada"], ["Visakhapatnam", "/ai-voice-agent-visakhapatnam"], ["Bengaluru", "/ai-voice-agent-bangalore"]]],
  ["Industries", [["Real estate", "/industries/real-estate"], ["Clinics & hospitals", "/industries/clinics-hospitals"], ["Education & coaching", "/industries/education-coaching"], ["E-commerce & D2C", "/industries/e-commerce"], ["Banking & NBFC", "/industries/banking-nbfc-loans"], ["Insurance", "/industries/insurance"], ["All industries →", "/industries"]]],
  ["Compare & learn", [["Best AI voice agents in India", "/best-ai-voice-agents-india"], ["AI calling cost calculator", "/tools/ai-calling-cost-calculator"], ["Vapi alternative India", "/vapi-alternative-india"], ["RANA AI vs Retell AI", "/compare/rana-ai-vs-retell-ai"], ["RANA AI vs Bland AI", "/compare/rana-ai-vs-bland-ai"], ["AI vs human telecaller", "/compare/ai-vs-human-telecaller"], ["TRAI DLT rules", "/glossary/trai-tcccpr-rules"], ["Glossary", "/glossary"], ["Blog", "/blog"]]],
];

/** Hero: RANA's live voice core. Tap it to talk to Rana; the ticker shows the kind of calls she handles. */
const HERO_TICKER_IN = ["Answering a clinic's call in Telugu", "Booking a site visit in Hindi", "Qualifying an admission enquiry in Tamil", "Confirming a COD order in Kannada", "Following up a gym trial in English"];
const HERO_TICKER_GLOBAL = ["Answering a dental clinic in English", "Booking a viewing in Spanish", "Qualifying a lead in French", "Confirming an order in Japanese", "Following up a trial in English"];
function HeroCore({ onTalk, india }: { onTalk: () => void; india: boolean }) {
  const list = india ? HERO_TICKER_IN : HERO_TICKER_GLOBAL;
  const [i, setI] = useState(0);
  const [hover, setHover] = useState(false);
  useEffect(() => { const t = setInterval(() => setI((x) => x + 1), 3600); return () => clearInterval(t); }, []);
  const chip = "absolute hidden sm:flex items-center gap-1.5 font-mono text-[10.5px] tracking-[0.14em] text-ink-soft border border-white/10 bg-[#0b0e14]/90 rounded-full px-2.5 py-1 pointer-events-none";
  return (
    <div className="relative flex flex-col items-center" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className="relative w-[480px] max-w-full">
        <RanaCore size="100%" mode={hover ? "listening" : "idle"} pulse={i} onClick={onTalk} label="Talk to Rana — ask anything about RANA AI" className="w-full" >
          <span className="flex flex-col items-center gap-2 font-mono text-[11px] tracking-[0.22em] text-ink opacity-80 group-hover:opacity-100 transition-opacity" data-testid="hero-core">
            <MicIcon size={26} />TALK TO RANA
            <span className="text-[9.5px] tracking-[0.16em] text-ink-soft normal-case">Ask me anything about RANA AI</span>
          </span>
        </RanaCore>
        <span className={`${chip} top-[8%] left-[2%]`}><span className="w-1.5 h-1.5 rounded-full bg-signal live-dot" />R1 · ONLINE</span>
        <span className={`${chip} top-[14%] right-[0%]`}>{india ? "11 INDIAN LANGUAGES" : "14 LANGUAGES"}</span>
        <span className={`${chip} bottom-[16%] left-[0%]`}>~1 S RESPONSE</span>
        <span className={`${chip} bottom-[9%] right-[4%]`}>24 × 7</span>
      </div>
      <div className="mt-2 h-6 font-mono text-[12px] text-signal/90 tracking-wide text-center" aria-live="polite" data-testid="hero-ticker">
        <span key={i} className="hud-pop inline-block">▸ {list[i % list.length]}…</span>
      </div>
    </div>
  );
}

function LiveCall({ calls }: { calls: IndustryCall[] }) {
  const [ind, setInd] = useState(0);
  const [round, setRound] = useState(0);
  const pinned = useRef(false); // once the visitor picks a business, keep replaying that one
  const [lines, setLines] = useState<Line[]>([]);
  const [typing, setTyping] = useState("");
  const call = calls[ind] || calls[0];
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setLines(call.lines); return; }
    let alive = true;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    (async () => {
      setLines([]);
      for (const l of call.lines) {
        for (let i = 1; i <= l.text.length && alive; i += 2) { setTyping(l.text.slice(0, i)); await sleep(22); }
        if (!alive) return;
        setTyping(""); setLines((x) => [...x, l]); await sleep(900);
      }
      await sleep(4200);
      // Keep cycling through businesses until the visitor picks one; then replay theirs.
      if (alive) { if (pinned.current) setRound((r) => r + 1); else setInd((i) => (i + 1) % calls.length); }
    })();
    return () => { alive = false; };
  }, [ind, round]); // eslint-disable-line react-hooks/exhaustive-deps
  const next = call.lines[lines.length];
  const who = (l: Line) => (l.who === "ai" ? "RANA · AI EMPLOYEE" : call.dir === "OUTBOUND" ? "CUSTOMER" : "CALLER");
  return (
    <div className="card p-5 sm:p-6 font-mono text-[12.5px]" data-testid="live-call">
      <div className="flex flex-wrap gap-1.5 mb-4 font-sans" role="tablist" aria-label="Pick a business">
        {calls.map((c, i) => (
          <button key={c.key} role="tab" aria-selected={i === ind} onClick={() => { pinned.current = true; setTyping(""); setInd(i); if (i === ind) setRound((r) => r + 1); }} className={`rounded-full border px-2.5 py-1 text-[11.5px] transition-colors ${i === ind ? "border-signal/60 bg-signal/10 text-signal" : "border-white/10 text-ink-soft hover:text-ink"}`}>{c.label}</button>
        ))}
      </div>
      <div className="flex justify-between items-center text-ink-soft text-[11px] mb-4">
        <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-signal live-dot" /> LIVE · {call.dir} · {call.number}</span>
        <span>{call.lang}</span>
      </div>
      <div className="wave flex items-end gap-[3px] h-12 mb-5" aria-hidden>
        {Array.from({ length: 44 }, (_, i) => <i key={i} style={{ animationDelay: `${(i % 11) * 0.08}s` }} />)}
      </div>
      <div className="flex flex-col gap-3 min-h-[250px]">
        {lines.map((l, i) => (
          <div key={`${call.key}-${i}`} className="animate-rise">
            <div className={`text-[10.5px] mb-0.5 ${l.who === "ai" ? "text-signal" : "text-ink-soft"}`}>{who(l)}</div>
            <div className="text-ink/90 font-sans text-[13.5px] leading-snug">{l.text}</div>
            {l.tag && <div className="mt-2.5 inline-block text-[10.5px] text-hot border border-hot/60 bg-hot/10 rounded px-2 py-0.5">{l.tag}</div>}
          </div>
        ))}
        {typing && next && (
          <div>
            <div className={`text-[10.5px] mb-0.5 ${next.who === "ai" ? "text-signal" : "text-ink-soft"}`}>{who(next)}</div>
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

function Industries({ onDemo }: { onDemo: () => void }) {
  const [k, setK] = useState(USE_CASES[0].key);
  const u = USE_CASES.find((x) => x.key === k) || USE_CASES[0];
  return (
    <section id="industries" className="max-w-[1160px] mx-auto px-5 sm:px-8 pb-24 scroll-mt-20">
      <div className="reveal max-w-[720px]">
        <div className="eyebrow">// WHO IT&apos;S FOR</div>
        <h2 className="font-display text-[32px] sm:text-[46px] font-semibold tracking-[-0.025em] leading-[1.05] mt-3">Any business that runs<br /><span className="text-ink-soft">on phone calls.</span></h2>
        <p className="text-ink-soft text-[16px] leading-relaxed mt-4">Missed calls, slow follow-ups and leads that go cold look the same in every industry. Pick yours and see which calls RANA takes off your team.</p>
      </div>
      <div className="reveal flex flex-wrap gap-2 mt-8" role="tablist" aria-label="Industries">
        {USE_CASES.map((x) => (
          <button key={x.key} role="tab" aria-selected={x.key === k} onClick={() => setK(x.key)} data-testid={`ind-${x.key}`}
            className={`rounded-full border px-4 py-2 text-[13.5px] transition-colors ${x.key === k ? "border-signal/60 bg-signal/10 text-signal font-semibold" : "border-white/10 text-ink-soft hover:text-ink hover:border-white/25"}`}>{x.label}</button>
        ))}
      </div>
      <div className="grid lg:grid-cols-[1fr_1fr_1fr] gap-3 mt-5" data-testid="industry-panel">
        <div className="card p-6 flex flex-col">
          <div className="font-mono text-[11px] text-hot">THE PROBLEM</div>
          <div className="font-display text-[20px] font-semibold mt-3 leading-snug">{u.pain}</div>
          <div className="mt-auto pt-6"><div className="font-mono text-[11px] text-signal">THE RESULT</div><div className="font-display text-[18px] font-semibold mt-1 text-gradient">{u.result}</div></div>
        </div>
        <div className="card p-6">
          <div className="font-mono text-[11px] text-signal">INCOMING CALLS · RANA ANSWERS</div>
          <ul className="mt-4 flex flex-col gap-2.5 text-[14.5px]">{u.inbound.map((t) => <li key={t} className="flex gap-2.5"><span className="text-signal">✓</span>{t}</li>)}</ul>
        </div>
        <div className="card p-6">
          <div className="font-mono text-[11px] text-violet">OUTGOING CALLS · RANA DIALS</div>
          <ul className="mt-4 flex flex-col gap-2.5 text-[14.5px]">{u.outbound.map((t) => <li key={t} className="flex gap-2.5"><span className="text-violet">✓</span>{t}</li>)}</ul>
        </div>
      </div>
      <div className="reveal card mt-3 p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-[14.5px]"><b>Don&apos;t see your business?</b> <span className="text-ink-soft">If your team answers or makes calls, RANA can take the repetitive ones — in your customers&apos; language.</span></div>
        <button onClick={onDemo} className="btn-ghost rounded-full px-5 py-2.5 text-[14px] font-semibold whitespace-nowrap">Show me for my business →</button>
      </div>
    </section>
  );
}

/** Honest back-of-the-envelope: the visitor's own numbers, the visitor's own estimate.
 *  Customer value uses a log scale per currency (₹500 → ₹10 crore, $10 → $10M, …) with one-click presets. */
function MissedCalls({ onDemo, market }: { onDemo: () => void; market: Market }) {
  const cur: Currency = market.currency;
  const C = CALC[cur];
  const niceRound = (v: number) => { const m = 10 ** Math.max(0, Math.floor(Math.log10(v)) - 1); return Math.max(C.min, Math.round(v / m) * m); };
  const valueOfPos = (p: number) => niceRound(C.min * (C.max / C.min) ** (p / 1000));
  const posOfValue = (v: number) => Math.round((1000 * Math.log(Math.min(C.max, Math.max(C.min, v)) / C.min)) / Math.log(C.max / C.min));
  const [missed, setMissed] = useState(15);
  const [conv, setConv] = useState(10);
  const [value, setValue] = useState(C.def);
  const perMonth = missed * market.workDays;
  const won = perMonth * (conv / 100);
  const lost = Math.round(won * value);
  const plan = PRICE_BOOK[cur].plans.launch.price;
  const slider = "w-full accent-[rgb(45,225,194)]";
  return (
    <section className="max-w-[1160px] mx-auto px-5 sm:px-8 pb-24">
      <div className="card card-hi reveal p-6 sm:p-10 grid lg:grid-cols-[1.1fr_1fr] gap-10 items-center" data-testid="missed-calc">
        <div>
          <div className="eyebrow">// WHAT MISSED CALLS COST YOU</div>
          <h2 className="font-display text-[28px] sm:text-[38px] font-semibold tracking-[-0.025em] leading-[1.08] mt-3">Every unanswered call<br />is a customer who called someone else.</h2>
          <div className="flex flex-wrap gap-2 mt-6" role="group" aria-label="Pick your business">
            {C.presets.map(([label, v, c]) => (
              <button key={label} type="button" onClick={() => { setValue(v); setConv(c); }} data-testid={`calc-preset-${label.split(" ")[0].toLowerCase()}`}
                className={`rounded-full border px-3 py-1.5 text-[12.5px] transition-colors ${value === v ? "border-signal/60 bg-signal/10 text-signal font-semibold" : "border-white/10 text-ink-soft hover:text-ink hover:border-white/25"}`}>{label}</button>
            ))}
          </div>
          <div className="flex flex-col gap-6 mt-6 text-[14px]">
            <label className="block"><div className="flex justify-between mb-2"><span className="text-ink-soft">Calls you miss or can&apos;t call back, per day</span><b className="font-mono">{missed}</b></div>
              <input type="range" min={1} max={300} value={missed} onChange={(e) => setMissed(+e.target.value)} className={slider} aria-label="Missed calls per day" /></label>
            <label className="block"><div className="flex justify-between mb-2"><span className="text-ink-soft">Of those, how many would have bought</span><b className="font-mono">{conv}%</b></div>
              <input type="range" min={0.5} max={50} step={0.5} value={conv} onChange={(e) => setConv(+e.target.value)} className={slider} aria-label="Conversion percent" /></label>
            <label className="block"><div className="flex justify-between items-center gap-3 mb-2"><span className="text-ink-soft">What one customer or sale is worth to you</span>
                <span className="flex items-center gap-1 font-mono font-bold">{SYMBOL[cur]}<input type="number" min={C.min} max={C.max} value={value} onChange={(e) => setValue(Math.min(C.max, Math.max(0, Math.round(+e.target.value || 0))))}
                  className="w-[132px] bg-transparent border border-white/15 rounded-md px-2 py-1 text-right" aria-label="Customer value" data-testid="calc-value" /></span></div>
              <input type="range" min={0} max={1000} value={posOfValue(value)} onChange={(e) => setValue(valueOfPos(+e.target.value))} className={slider} aria-label="Customer value slider" />
              <div className="relative h-4 text-[11px] text-ink-soft mt-1 font-mono">{C.ticks.map(([t, v], i, a) => (
                <span key={t} className="absolute whitespace-nowrap" style={{ left: `${posOfValue(v) / 10}%`, transform: i === 0 ? "none" : i === a.length - 1 ? "translateX(-100%)" : "translateX(-50%)" }}>{t}</span>))}</div></label>
          </div>
        </div>
        <div className="text-center lg:text-left">
          <div className="font-mono text-[11.5px] text-ink-soft">BUSINESS YOU MAY BE LOSING EACH MONTH</div>
          <div className="font-display text-[46px] sm:text-[60px] font-semibold tracking-tight text-gradient leading-none mt-3" data-testid="calc-lost">{moneyShort(cur, lost)}</div>
          <div className="text-[13.5px] text-ink-soft mt-3">{perMonth.toLocaleString("en-US")} missed calls × {conv}% = about {won >= 10 ? Math.round(won).toLocaleString("en-US") : Math.round(won * 10) / 10} customers × {moneyShort(cur, value)}, over {market.workDays} working days. Your numbers — change them.</div>
          <div className="mt-6 rounded-xl border border-white/10 bg-white/[.03] p-4 text-[14px]" data-testid="calc-roi">RANA answers and calls back every one of them, from <b>{money(cur, plan)} a month</b>.{" "}
            {value > 0 && lost > 0 ? (value >= plan
              ? <>One extra customer pays for <b>{value >= plan * 12 ? "a full year" : Math.floor(value / plan) === 1 ? "a month" : `${Math.floor(value / plan)} months`}</b> of RANA.</>
              : <>It pays for itself with <b>{Math.ceil(plan / value)} extra customers</b> a month.</>) : null}
          </div>
          <div className="flex flex-wrap gap-3 mt-6 justify-center lg:justify-start">
            <Link href="/signup" className="btn-glow rounded-full px-6 py-3 text-[14px] font-semibold">Start free — {TRIAL_DAYS} days</Link>
            <button onClick={onDemo} className="btn-ghost rounded-full px-6 py-3 text-[14px] font-medium">Book a demo</button>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Country / currency switcher. Each choice is its own page (/, /global, /us, /ae, /eu, /jp) so Google can index them. */
function MarketSwitcher({ market, align = "right" }: { market: Market; align?: "right" | "left" | "up" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  const pick = (k: MarketKey) => { try { document.cookie = `${MARKET_COOKIE}=${k}; path=/; max-age=31536000; samesite=lax`; } catch {} };
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} data-testid="market-switch"
        className="flex items-center gap-1.5 rounded-full border border-white/10 hover:border-white/25 px-3 py-2 text-[12.5px] font-mono text-ink-soft hover:text-ink">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9S14.5 18.3 12 21M12 3C9.5 5.7 8.2 8.7 8.2 12s1.3 6.3 3.8 9" /></svg>
        {market.short} · {SYMBOL[market.currency]}
      </button>
      {open && (
        <div role="menu" className={`absolute z-[70] w-[230px] rounded-xl border border-white/10 bg-[#0b0e14] p-1.5 shadow-2xl ${align === "up" ? "bottom-full mb-2 left-1/2 -translate-x-1/2" : align === "left" ? "left-0 mt-2" : "right-0 mt-2"}`} data-testid="market-menu">
          {MARKET_KEYS.map((k) => { const m = MARKETS[k]; return (
            <a key={k} role="menuitem" href={m.path} onClick={() => pick(k)} data-testid={`market-${k}`}
              className={`flex items-center justify-between rounded-lg px-3 py-2 text-[13px] ${k === market.key ? "bg-signal/10 text-signal font-semibold" : "text-ink-soft hover:bg-white/[.05] hover:text-ink"}`}>
              <span>{m.name}</span><span className="font-mono text-[11.5px]">{SYMBOL[m.currency]} {m.currency}</span>
            </a>); })}
        </div>
      )}
    </div>
  );
}

/** A quiet hint when the visitor's timezone suggests another country page. Never redirects (keeps every page crawlable). */
function MarketHint({ market }: { market: Market }) {
  const [to, setTo] = useState<MarketKey | null>(null);
  useEffect(() => {
    try {
      if (document.cookie.includes(`${MARKET_COOKIE}=`)) return;
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      const guess = marketForZone(tz);
      if (!guess || guess === market.key) return;
      if (market.key !== "in" && guess === "global") return;
      setTo(guess);
    } catch {}
  }, [market.key]);
  if (!to) return null;
  const m = MARKETS[to];
  const dismiss = () => { try { document.cookie = `${MARKET_COOKIE}=${market.key}; path=/; max-age=31536000; samesite=lax`; } catch {} setTo(null); };
  return (
    <div className="relative z-[55] border-b border-signal/20 bg-signal/10 text-[13px]" data-testid="market-hint">
      <div className="max-w-[1160px] mx-auto px-5 sm:px-8 py-2.5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center">
        <span>{to === "in" ? "In India? See prices in rupees." : `Visiting from ${m.key === "global" ? "outside India" : m.name}? See prices in ${m.currency}.`}</span>
        <a href={m.path} onClick={() => { try { document.cookie = `${MARKET_COOKIE}=${to}; path=/; max-age=31536000; samesite=lax`; } catch {} }} className="font-semibold text-signal">Go to {m.name} →</a>
        <button type="button" onClick={dismiss} className="text-ink-soft hover:text-ink" aria-label="Stay on this page">Stay here</button>
      </div>
    </div>
  );
}

export default function Site({ marketKey = "in" }: { marketKey?: MarketKey }) {
  const market = MARKETS[marketKey] || MARKETS.in;
  const india = market.key === "in";
  const FEATURES = featuresFor(india);
  // Visitors can switch the pricing currency right in the pricing section (clean local price points, not live FX).
  const [cur, setCur] = useState<Currency>(market.currency);
  const PLANS = plansFor({ ...market, currency: cur });
  const FAQ = faqFor(market);
  const book = PRICE_BOOK[cur];
  useReveal();
  const [menu, setMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => { const f = () => setScrolled(window.scrollY > 12); f(); window.addEventListener("scroll", f, { passive: true }); return () => window.removeEventListener("scroll", f); }, []);
  useEffect(() => { document.body.style.overflow = menu ? "hidden" : ""; }, [menu]);
  // "Book a demo" opens the form. Links like ranaai.in/?demo=1 or ranaai.in/#demo open it straight away (for ads, WhatsApp, email).
  const [demo, setDemo] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<DemoPrefill | null>(null);
  const openDemo = (from: string) => () => { setMenu(false); setPrefill(null); setDemo(from); };
  // "Talk to Rana" and the instant demos (live voice). Links: ranaai.in/#talk, ranaai.in/?try=booking
  const [live, setLive] = useState<{ mode: LiveMode; scenario: DemoKey | null } | null>(null);
  const openTalk = () => { setMenu(false); setLive({ mode: "talk", scenario: null }); };
  const openTry = (k: DemoKey | null = null) => { setMenu(false); setLive({ mode: "demo", scenario: k }); };
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (window.location.hash === "#talk" || q.get("talk") === "1") setLive({ mode: "talk", scenario: null });
    const t = q.get("try"); if (t) setLive({ mode: "demo", scenario: (SCENARIOS.some((x) => x.key === t) ? t : null) as DemoKey | null });
  }, []);
  useEffect(() => { const q = new URLSearchParams(window.location.search); if (q.get("demo") === "1" || window.location.hash === "#demo") setDemo("link"); }, []);
  useEffect(() => { captureUtm(); }, []);
  // Mark the page as scrolling (pauses animations and the voice core) and clear it shortly after scrolling stops.
  useEffect(() => {
    let t: any = 0; const html = document.documentElement;
    const f = () => { html.classList.add("is-scrolling"); clearTimeout(t); t = setTimeout(() => html.classList.remove("is-scrolling"), 160); };
    window.addEventListener("scroll", f, { passive: true });
    return () => { window.removeEventListener("scroll", f); clearTimeout(t); html.classList.remove("is-scrolling"); };
  }, []);

  return (
    <div className="site theme-night min-h-screen font-sans">
      <div className="aurora" aria-hidden />
      <MarketHint market={market} />

      {/* ---------- Nav ---------- */}
      <header className={`sticky top-0 z-50 transition-all ${scrolled ? "glass border-b border-white/[.06]" : ""}`}>
        <div className="max-w-[1280px] mx-auto px-5 sm:px-8 h-[68px] flex items-center justify-between gap-4 whitespace-nowrap">
          <a href="#top" className="flex items-center gap-2.5 shrink-0"><Logo size={30} /><span className="font-display text-[18px] font-semibold tracking-tight">RANA<span className="text-gradient"> AI</span></span></a>
          <nav className="hidden xl:flex items-center gap-7 text-[13.5px] text-ink-soft">
            {NAV.map(([l, h]) => <a key={h} href={h} className="hover:text-ink">{l}</a>)}
          </nav>
          <div className="hidden md:flex items-center gap-3">
            <MarketSwitcher market={market} />
            <Link href="/login" className="text-[13.5px] font-medium text-ink-soft hover:text-ink px-3 py-2">Sign in</Link>
            <Link href="/signup" className="btn-glow rounded-full px-4 py-2 text-[13.5px] font-semibold" data-testid="nav-trial">Start free trial</Link>
            <button onClick={() => setMenu(true)} className="xl:hidden font-mono text-[12px] border border-signal/60 text-signal rounded-full px-3.5 py-2" aria-label="Open menu">MENU +</button>
          </div>
          <div className="md:hidden flex items-center gap-2"><MarketSwitcher market={market} />
          <button onClick={() => setMenu(true)} className="font-mono text-[12px] border border-signal/60 text-signal rounded-full px-4 py-2" aria-label="Open menu" data-testid="menu-btn">MENU +</button></div>
        </div>
      </header>
      {menu && (
        <div className="fixed inset-0 z-[60] bg-paper/[.98] flex flex-col items-center justify-center gap-6 animate-rise" data-testid="menu">
          <button onClick={() => setMenu(false)} className="absolute top-5 right-6 text-[32px] leading-none text-ink-soft" aria-label="Close menu">×</button>
          {NAV.map(([l, h]) => <a key={h} href={h} onClick={() => setMenu(false)} className="font-display text-[36px] font-semibold tracking-tight hover:text-signal">{l}</a>)}
          <div className="flex flex-wrap justify-center gap-3 mt-4">
            <Link href="/login" className="btn-ghost rounded-full px-5 py-3 text-[14px] font-medium">Sign in</Link>
            <button onClick={openDemo("menu")} className="btn-ghost rounded-full px-5 py-3 text-[14px] font-medium">Book a demo</button>
            <Link href="/signup" className="btn-glow rounded-full px-5 py-3 text-[14px] font-semibold">Start free trial</Link>
          </div>
        </div>
      )}

      <main id="top">
        {/* ---------- Hero ---------- */}
        <section className="max-w-[1160px] mx-auto px-5 sm:px-8 pt-10 sm:pt-16 pb-16 grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[1.05fr_1fr] gap-10 lg:gap-6 items-center">
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center gap-2 font-mono text-[11.5px] text-signal border border-signal/25 bg-signal/10 rounded-full px-3 py-1.5 mb-7">
              <span className="w-1.5 h-1.5 rounded-full bg-signal live-dot" /> STATUS: ANSWERING CALLS, RIGHT NOW
            </div>
            <h1>
              <span className="block eyebrow uppercase mb-4">{india ? "AI voice agent & AI calling agent for Indian businesses" : market.key === "global" ? "AI voice agents for businesses worldwide" : `AI voice agents for businesses in ${market.key === "us" ? "the United States" : market.key === "ae" ? "the UAE & Gulf" : market.name}`}</span>
              <span className="block font-display font-semibold tracking-[-0.035em] leading-[0.98] text-[46px] sm:text-[64px] lg:text-[72px]">
                We build what<br /><span className="text-gradient">answers back.</span>
              </span>
            </h1>
            <p className="text-ink-soft text-[16.5px] sm:text-[18px] leading-relaxed mt-6 max-w-[540px] mx-auto lg:mx-0">
              {india
                ? "AI calling agents for any business that runs on phone calls — clinics, real estate, education, e-commerce, finance, hospitality and more. They answer and make your calls in Telugu, Hindi, Tamil and 8 more Indian languages — plus Spanish, French and Japanese for callers abroad — and hand your team only the leads worth calling back."
                : "AI calling agents for any business that runs on phone calls — clinics, real estate, education, e-commerce, finance, hospitality and more. They answer and make your calls around the clock in English, Spanish, French, Japanese, Hindi and 9 more Indian languages, and hand your team only the leads worth calling back."}
            </p>
            <div className="flex flex-wrap gap-3 mt-9 justify-center lg:justify-start">
              <button onClick={() => openTry()} className="btn-glow rounded-full px-6 py-3.5 text-[15px] font-semibold" data-testid="hero-try">Try an instant demo</button>
              <button onClick={openDemo("hero")} className="btn-ghost rounded-full px-6 py-3.5 text-[15px] font-medium" data-testid="hero-demo">Book a demo</button>
            </div>
            <div className="text-[12.5px] text-ink-soft/80 mt-4">Or tap Rana to ask her anything about RANA AI — no sign-up. <Link href="/signup" className="text-signal font-semibold hover:underline" data-testid="hero-trial">start free for {TRIAL_DAYS} days</Link> · {TRIAL_MINUTES} minutes · no card.</div>
          </div>
          <HeroCore onTalk={openTalk} india={india} />
        </section>

        {/* ---------- Stats ---------- */}
        <section className="max-w-[1160px] mx-auto px-5 sm:px-8 pb-14">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[[<Count key="a" to={CALL_LANGUAGE_COUNT} />, india ? "Call languages — Indian + global" : "Call languages — global + Indian"], ["24×7", "Answers every call"], [<Count key="b" to={14} />, "Day free trial"], [<><Count key="c" to={30} />s</>, "Billing pulses — not full minutes"]].map(([v, l], i) => (
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
                {["ANSWER EVERY CALL", "CAPTURE EVERY LEAD", "ANY INDUSTRY", india ? "INDIAN + GLOBAL LANGUAGES" : "GLOBAL + INDIAN LANGUAGES", "INBOUND + OUTBOUND", "LIVE IN DAYS", india ? "PAY BY UPI" : "PAY BY CARD", "YOUR OWN VOICE"].map((t) => (
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
              Every conversation becomes structured data. Every signal becomes an action your team doesn&apos;t have to chase. Pick a business on the right and watch a real-style call — their language in, a qualified lead out.
            </p>
            <div className="mt-8 card p-5">
              <div className="eyebrow">// THE GAP</div>
              <div className="font-display text-[20px] font-semibold mt-2">Missed calls don&apos;t show up on any dashboard.</div>
              <p className="text-ink-soft text-[14px] leading-relaxed mt-2">A call after hours, during a rush, or in a language the front desk isn&apos;t fluent in — it just doesn&apos;t get answered. Nobody finds out what that lead was worth.</p>
            </div>
          </div>
          <div className="reveal"><LiveCall calls={india ? INDUSTRY_CALLS : GLOBAL_CALLS} /></div>
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
          <div className="reveal mt-3"><Integrations /></div>
          <div className="reveal flex flex-wrap items-center gap-2 mt-5 text-[12.5px]">
            <span className="font-mono text-ink-soft mr-1">COMING NEXT →</span>
            {["WhatsApp follow-ups to customers", "Two-way CRM sync", "Predictive lead scoring"].map((t) => <span key={t} className="rounded-full border border-white/10 px-3 py-1 text-ink-soft">{t}</span>)}
          </div>
        </section>

        <Industries onDemo={openDemo("industries")} />

        {/* ---------- Dashboard preview ---------- */}
        <section className="max-w-[1160px] mx-auto px-5 sm:px-8 pb-24 grid lg:grid-cols-[1fr_1.35fr] gap-12 items-center">
          <div className="reveal">
            <div className="eyebrow">// YOUR DASHBOARD</div>
            <h2 className="font-display text-[32px] sm:text-[42px] font-semibold tracking-[-0.025em] leading-[1.05] mt-3">Open it once.<br />Know everything.</h2>
            <p className="text-ink-soft text-[16px] leading-relaxed mt-4">Calls, connect rate, talk time, hot leads and every transcript — live. Filter by today, campaign or direction, and see exactly why a call didn&apos;t connect.</p>
            <ul className="mt-6 flex flex-col gap-2.5 text-[14.5px]">
              {["Hot leads ranked so sales calls the right people first", "Hot leads sent to Slack, WhatsApp or email the moment a call ends", "Excel reports with exactly the columns you choose", "Campaign-by-campaign results"].map((t) => <li key={t} className="flex gap-2.5"><span className="text-signal">✓</span>{t}</li>)}
            </ul>
          </div>
          <div className="reveal"><DashboardPreview /></div>
        </section>

        <MissedCalls key={market.currency} market={market} onDemo={openDemo("calculator")} />

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
        <section id="pricing" className="max-w-[1280px] mx-auto px-5 sm:px-8 py-24">
          <div className="reveal text-center max-w-[640px] mx-auto">
            <div className="eyebrow">// PRICING</div>
            <h2 className="font-display text-[32px] sm:text-[46px] font-semibold tracking-[-0.025em] mt-3">Plans that pay for themselves.</h2>
            <p className="text-ink-soft text-[16px] mt-3">Start free for {TRIAL_DAYS} days with {TRIAL_MINUTES} minutes. {cur === market.currency ? market.taxNote : CUR_NOTE[cur]} Pay annually and the setup fee is waived.</p>
            <div className="inline-flex mt-5 rounded-full border border-white/10 bg-white/[.03] p-1" role="group" aria-label="Show prices in" data-testid="currency-switch">
              {CURRENCIES.map((c) => (
                <button key={c} type="button" onClick={() => setCur(c)} aria-pressed={cur === c} data-testid={"cur-" + c}
                  className={"rounded-full px-3.5 py-1.5 font-mono text-[12px] transition-colors " + (cur === c ? "bg-signal text-on-accent font-semibold" : "text-ink-soft hover:text-ink")}>{SYMBOL[c]} {c}</button>
              ))}
            </div>
            <p className="text-[14px] mt-3 font-medium" data-testid="engines-line">{ENGINES_LINE}</p>
          </div>
          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3 mt-12">
            {PLANS.map((p) => (
              <div key={p.name} className={`card reveal p-6 flex flex-col ${p.hi ? "card-hi xl:-translate-y-3" : ""}`} data-testid={`plan-${p.name.toLowerCase()}`}>
                <div className="flex items-center justify-between">
                  <div className="font-display text-[20px] font-semibold">{p.name}</div>
                  {p.hi && <span className="text-[11px] font-mono text-on-accent bg-signal rounded-full px-2.5 py-1">MOST POPULAR</span>}
                </div>
                <div className="mt-5 flex items-baseline gap-1"><span className="text-ink-soft text-[20px]">{p.symbol}</span><span className="font-display text-[40px] font-semibold tracking-tight">{p.price}</span><span className="text-ink-soft text-[14px]">/month</span></div>
                <div className="text-[13.5px] mt-1"><b>{p.min} minutes</b> <span className="text-ink-soft">· then {p.extra}/min prepaid</span></div>
                <ul className="mt-6 flex flex-col gap-2.5 text-[14px] flex-1">
                  {p.pts.map((t) => <li key={t} className="flex gap-2.5"><span className="text-signal">✓</span>{t}</li>)}
                  <li className="flex gap-2.5 text-ink-soft"><span className="text-ink-soft">+</span>{p.fee} (free on annual)</li>
                </ul>
                <Link href="/signup" className={`mt-7 rounded-full py-3 text-center text-[14px] font-semibold ${p.hi ? "btn-glow" : "btn-ghost"}`}>Start free trial</Link>
              </div>
            ))}
          </div>
          {!india && <p className="reveal text-center text-[13px] text-ink-soft mt-4" data-testid="numbers-note">Local numbers: US numbers are ready now; UK, UAE, Europe, Japan and other countries are set up on request. You can also forward your existing number.</p>}
          <div className="reveal card mt-3 p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div><div className="font-display text-[20px] font-semibold">Enterprise <span className="text-ink-soft text-[14px] font-normal">· from {moneyShort(cur, book.enterpriseFrom)}/month</span></div><div className="text-ink-soft text-[14px] mt-1">{PRICE_LIST.enterprise.minutes.toLocaleString(india ? "en-IN" : "en-US")}+ minutes a month, unlimited AI employees, {PRICE_LIST.enterprise.concurrency} calls at once, both voice engines, and custom per-minute rates.</div></div>
            <button onClick={openDemo("enterprise")} className="btn-ghost rounded-full px-6 py-3 text-[14px] font-semibold whitespace-nowrap">Talk to us →</button>
          </div>
        </section>

        {/* ---------- Field report + who built it ---------- */}
        <section className="max-w-[1160px] mx-auto px-5 sm:px-8 pb-24 grid lg:grid-cols-[1.3fr_1fr] gap-3">
          <div className="card reveal p-8">
            <div className="eyebrow">// FIELD REPORT · FIRST DEPLOYMENT</div>
            <p className="font-display text-[22px] sm:text-[26px] font-medium leading-snug mt-4 tracking-tight">
              RANA AI is live with a leading medical-entrance coaching network across South India — answering enquiries and running outbound campaigns end to end, in Telugu and English.
            </p>
            <div className="font-mono text-[11.5px] text-ink-soft mt-5">Full results will be published here as the numbers come in.</div>
          </div>
          <div className="card reveal p-8">
            <div className="eyebrow">// WHO BUILT IT</div>
            <p className="font-display text-[20px] font-semibold leading-snug mt-4">Built in Hyderabad by people who have run sales teams, admissions and franchise operations.</p>
            <p className="text-ink-soft text-[14px] leading-relaxed mt-3">We know what a missed call costs, because we have chased those leads ourselves. RANA is the teammate we wanted: one that picks up every time, in the customer&apos;s language.</p>
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
              <Link href="/signup" className="btn-glow rounded-full px-7 py-3.5 text-[15px] font-semibold">Start free — {TRIAL_DAYS} days</Link>
              <button onClick={openDemo("footer-cta")} className="btn-ghost rounded-full px-7 py-3.5 text-[15px] font-medium">Book a demo</button>
            </div>
            <div className="text-[13px] text-ink-soft mt-5">or write to <a href={`mailto:${CONTACT_EMAIL}`} className="text-signal">{CONTACT_EMAIL}</a></div>
          </div>
        </section>
      </main>

      <DemoForm open={!!demo} onClose={() => setDemo(null)} source={demo || ""} prefill={prefill} />
      <RanaLive open={!!live} mode={live?.mode || "talk"} scenario={live?.scenario || null} market={market} onClose={() => setLive(null)}
        onBookDemo={(p) => { setLive(null); setPrefill(p); setDemo(`live-${live?.mode || "talk"}${live?.scenario ? `-${live.scenario}` : ""}`); }} />

      <nav aria-label="Explore RANA AI" className="border-t border-white/[.06]" data-testid="explore-links">
        <div className="max-w-[1160px] mx-auto px-5 sm:px-8 py-12 grid grid-cols-2 md:grid-cols-4 gap-8 text-[13.5px]">
          {EXPLORE.map(([title, links]) => (
            <div key={title}>
              <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft/70 mb-3">{title}</div>
              <ul className="grid gap-2">{links.map(([l, h]) => <li key={h}><Link href={h} className="text-ink-soft hover:text-signal">{l}</Link></li>)}</ul>
            </div>
          ))}
        </div>
      </nav>
      <footer className="border-t border-white/[.06]">
        <div className="max-w-[1160px] mx-auto px-5 sm:px-8 py-10 flex flex-col md:flex-row gap-6 items-center justify-between text-[13px] text-ink-soft">
          <div className="flex items-center gap-3"><Logo size={24} /><span>RANA AI — Hyderabad, India · serving businesses worldwide</span></div>
          <nav className="flex flex-wrap gap-6 justify-center font-mono text-[12px]">
            {NAV.map(([l, h]) => <a key={h} href={h} className="hover:text-signal">{l}</a>)}
            <Link href="/blog" className="hover:text-signal">Blog</Link>
            <Link href="/login" className="hover:text-signal">Sign in</Link>
          </nav>
          <div className="flex items-center gap-3"><MarketSwitcher market={market} align="up" /><span>© {new Date().getFullYear()} RANA AI</span></div>
        </div>
        <div className="max-w-[1160px] mx-auto px-5 sm:px-8 pb-8 flex flex-col md:flex-row gap-3 items-center justify-between text-[12px] text-ink-soft/80">
          <nav className="flex flex-wrap gap-x-5 gap-y-2 justify-center font-mono">
            {LEGAL_LINKS.map(([l, h]) => <Link key={h} href={h} className="hover:text-signal">{l}</Link>)}
            {SOCIAL_LINKS.map(([l, h]) => <a key={h} href={h} target="_blank" rel="noopener noreferrer" className="hover:text-signal">{l}</a>)}
          </nav>
          <div>RANA AI is a brand of Munagala Sri Charan · {CONTACT_EMAIL}</div>
        </div>
      </footer>
    </div>
  );
}
