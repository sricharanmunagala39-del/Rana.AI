"use client";
import { useState } from "react";
import AuthShell from "@/components/AuthShell";

const field = "w-full border border-line rounded-xl px-3.5 py-3 text-[14px] bg-sunken outline-none focus:border-signal";

/** Public "Start a free trial" page. The workspace waits for RANA HQ's approval before calling is switched on. */
export default function SignupPage() {
  const [f, setF] = useState({ company: "", name: "", email: "", phone: "", password: "", industry: "edtech" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      const r = await fetch("/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
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
          <p className="text-[13.5px] text-ink-soft leading-relaxed">We'll switch on your 14-day free trial shortly (usually within a working day) and email you. You can sign in now and start building your first AI employee.</p>
          <a href="/login" className="bg-signal text-on-accent rounded-xl py-3 text-[14px] font-semibold text-center mt-2">Sign in →</a>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3" data-testid="signup-form">
          <div className="text-[11px] font-mono text-signal tracking-wider">// 14 DAYS · 100 MINUTES · NO CARD</div>
          <h1 className="font-display text-[30px] font-semibold tracking-tight -mt-0.5">Hire your first<br /><span className="text-gradient">AI employee</span></h1>
          <p className="text-[13.5px] text-ink-soft mb-2">Set up in minutes. It calls in 11 Indian languages.</p>
          <div className="grid grid-cols-2 gap-3">
            <input id="su-company" className={field} placeholder="Company name" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} />
            <input id="su-name" className={field} placeholder="Your name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </div>
          <input id="su-email" className={field} placeholder="Work email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <input id="su-phone" className={field} placeholder="Mobile number" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          <select id="su-industry" className={field} value={f.industry} onChange={(e) => setF({ ...f, industry: e.target.value })}>
            <option value="edtech">Education / coaching</option><option value="realestate">Real estate</option><option value="hospitality">Hospitality</option><option value="saas">Software / SaaS</option><option value="other">Other</option>
          </select>
          <input id="su-password" className={field} placeholder="Choose a password (8+ characters)" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          {err && <div className="text-[12.5px] text-miss bg-miss-tint border border-miss/20 rounded-xl px-3 py-2">{err}</div>}
          <button disabled={busy} className="bg-signal text-on-accent rounded-xl py-3 text-[14px] font-semibold disabled:opacity-50 mt-1" data-testid="signup-submit">{busy ? "Creating…" : "Create my workspace →"}</button>
        </form>
      )}
    </AuthShell>
  );
}
