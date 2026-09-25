"use client";
import { useState } from "react";

const field = "w-full border border-line rounded-lg px-3 py-2.5 text-[14px] bg-paper outline-none focus:border-signal";

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
    <div className="min-h-screen bg-paper flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6"><span className="text-[22px] font-display font-bold">RANA AI</span><p className="text-[13px] text-ink-soft">AI employees that call your leads — in 11 Indian languages</p></div>
        <div className="bg-white border border-line rounded-2xl p-7 shadow-sm">
          {done ? (
            <div className="flex flex-col gap-3" data-testid="signup-done">
              <h1 className="text-[18px] font-semibold">You're in the queue</h1>
              <p className="text-[13.5px] text-ink-soft">We'll switch on your 14-day free trial shortly (usually within a working day) and email you. You can sign in now and start building your first AI employee.</p>
              <a href="/login" className="bg-signal text-white rounded-lg py-2.5 text-[14px] font-semibold text-center">Sign in</a>
            </div>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-3" data-testid="signup-form">
              <h1 className="text-[18px] font-semibold mb-1">Start your free trial</h1>
              <input id="su-company" className={field} placeholder="Company name" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} />
              <input id="su-name" className={field} placeholder="Your name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
              <input id="su-email" className={field} placeholder="Work email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
              <input id="su-phone" className={field} placeholder="Mobile number" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
              <select id="su-industry" className={field} value={f.industry} onChange={(e) => setF({ ...f, industry: e.target.value })}>
                <option value="edtech">Education / coaching</option><option value="realestate">Real estate</option><option value="hospitality">Hospitality</option><option value="saas">Software / SaaS</option><option value="other">Other</option>
              </select>
              <input id="su-password" className={field} placeholder="Choose a password (8+ characters)" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
              {err && <div className="text-[12.5px] text-miss bg-miss-tint rounded-lg px-3 py-2">{err}</div>}
              <button disabled={busy} className="bg-signal text-white rounded-lg py-2.5 text-[14px] font-semibold disabled:opacity-50 mt-1" data-testid="signup-submit">{busy ? "Creating…" : "Create my workspace"}</button>
              <p className="text-[11.5px] text-ink-soft text-center">14 days · 100 minutes · no card needed. Already have a login? <a href="/login" className="text-signal">Sign in</a></p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
