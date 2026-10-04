"use client";
import { TRIAL_DAYS, TRIAL_MINUTES } from "@/lib/pricing";
import { useEffect, useState } from "react";
import { COUNTRIES, countryOf, flagOf, guessCountry } from "@/lib/countries";
import AuthShell from "@/components/AuthShell";
import { utmTag } from "@/app/landing/utm";

const field = "w-full border border-line rounded-xl px-3.5 py-3 text-[14px] bg-sunken outline-none focus:border-signal";

/** Public "Start a free trial" page. The workspace waits for RANA HQ's approval before calling is switched on. */
export default function SignupPage() {
  const [f, setF] = useState({ company: "", name: "", email: "", phone: "", password: "", industry: "edtech" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const [country, setCountry] = useState("IN");
  const marketCookie = () => (typeof document === "undefined" ? "" : (document.cookie.match(/(?:^|; )rana_market=([a-z]+)/) || [])[1] || "");
  // First guess from the website version they came from and their browser time zone; they can change it.
  useEffect(() => { setCountry(guessCountry(marketCookie() || "in", Intl.DateTimeFormat().resolvedOptions().timeZone)); }, []);
  const cty = countryOf(country) || COUNTRIES[0];
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      // Full international number: country code + the local number without a leading 0.
      const local = f.phone.replace(/[^\d]/g, "").replace(/^0+/, "");
      const phone = local ? `+${cty.dial}${local.startsWith(cty.dial) && local.length > 10 ? local.slice(cty.dial.length) : local}` : "";
      const r = await fetch("/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, phone, country: cty.code, source: utmTag(), market: cty.market, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }) });
      const j = await r.json(); if (!r.ok) { setErr(j.error || "Sign-up failed"); return; }
      setDone(true);
    } finally { setBusy(false); }
  }
  return (
    <AuthShell foot={done ? null : <>Already have a login? <a href="/login" className="text-signal font-semibold">Sign in</a></>}>
      {done ? (
        <div className="flex flex-col gap-3" data-testid="signup-done">
          <div className="w-12 h-12 rounded-2xl bg-signal-tint text-signal flex items-center justify-center text-[22px] shadow-glow">✓</div>
          <h1 className="font-display text-[28px] font-semibold tracking-tight">You're in the queue</h1>
          <p className="text-[13.5px] text-ink-soft leading-relaxed">We'll switch on your {TRIAL_DAYS}-day free trial ({TRIAL_MINUTES} minutes, both voice engines R1 and R2) shortly (usually within a working day) and email you. You can sign in now and start building your first AI employee.</p>
          <a href="/login" className="bg-signal text-on-accent rounded-xl py-3 text-[14px] font-semibold text-center mt-2">Sign in →</a>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3" data-testid="signup-form">
          <div className="text-[11px] font-mono text-signal tracking-wider">// {TRIAL_DAYS} DAYS · {TRIAL_MINUTES} MINUTES · NO CARD</div>
          <h1 className="font-display text-[30px] font-semibold tracking-tight -mt-0.5">Hire your first<br /><span className="text-gradient">AI employee</span></h1>
          <p className="text-[13.5px] text-ink-soft mb-2">Set up in minutes. It calls in 11 Indian languages plus Spanish, French and Japanese, on two voice engines (R1 and R2) — pick one per employee.</p>
          <div className="grid grid-cols-2 gap-3">
            <input id="su-company" className={field} placeholder="Company name" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} />
            <input id="su-name" className={field} placeholder="Your name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </div>
          <input id="su-email" className={field} placeholder="Work email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <label htmlFor="su-country" className="sr-only">Country</label>
          <select id="su-country" className={field} value={country} onChange={(e) => setCountry(e.target.value)} data-testid="signup-country" aria-label="Country">
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{flagOf(c.code)}  {c.name} (+{c.dial})</option>)}
          </select>
          <div className="flex gap-2">
            <span className="shrink-0 border border-line rounded-xl px-3.5 py-3 text-[14px] bg-sunken text-ink-soft tabular-nums" data-testid="signup-dial">{flagOf(cty.code)} +{cty.dial}</span>
            <input id="su-phone" className={field} placeholder="Mobile number" inputMode="tel" autoComplete="tel-national" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </div>
          <select id="su-industry" className={field} value={f.industry} onChange={(e) => setF({ ...f, industry: e.target.value })}>
            <option value="edtech">Education / coaching</option><option value="realestate">Real estate</option><option value="hospitality">Hospitality</option><option value="saas">Software / SaaS</option><option value="other">Other</option>
          </select>
          <input id="su-password" className={field} placeholder="Choose a password (8+ characters)" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          {err && <div className="text-[12.5px] text-miss bg-miss-tint border border-miss/20 rounded-xl px-3 py-2">{err}</div>}
          <button disabled={busy} className="bg-signal text-on-accent rounded-xl py-3 text-[14px] font-semibold disabled:opacity-50 mt-1" data-testid="signup-submit">{busy ? "Creating…" : "Create my workspace →"}</button>
          <p className="text-[11.5px] text-ink-soft leading-relaxed text-center">By creating a workspace you agree to our <a href="/legal/terms" className="text-signal">Terms</a> and <a href="/legal/privacy" className="text-signal">Privacy Policy</a>, and confirm you will only call people who have enquired with you or agreed to be contacted.</p>
        </form>
      )}
    </AuthShell>
  );
}
