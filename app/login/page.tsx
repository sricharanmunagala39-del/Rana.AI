// @ts-nocheck
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ticket, setTicket] = useState("");
  const [code, setCode] = useState("");
  function go(data) {
    // Invited with a one-time password: set their own before anything else.
    if (data.mustChangePassword) { router.push("/settings?tab=account&first=1"); return; }
    const next = new URLSearchParams(window.location.search).get("next"); router.push(next && next.startsWith("/") && !next.startsWith("//") && next !== "/" ? next : (data.home || "/"));
  }
  async function handleCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/auth/2fa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket, code }) });
      const data = await res.json();
      if (!res.ok) { if (res.status === 401 && /took too long/.test(data.error || "")) setTicket(""); throw new Error(data.error || "Sign-in failed"); }
      go(data);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), password }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      if (data.twoFactor) { setTicket(data.ticket); setCode(""); return; }
      go(data);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }
  return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-9 h-9 rounded-xl bg-signal flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.95.36 1.87.68 2.75a2 2 0 0 1-.45 2.11L8.09 9.910a16 16 0 0 0 6 6l1.33-1.34a2 2 0 0 1 2.11-.45c.88.32 1.8.55 2.75.68A2 2 0 0 1 22 16.92z"/></svg>
            </div>
            <span className="text-[22px] font-display font-bold tracking-tight">RANA AI</span>
          </div>
          <p className="text-[13px] text-ink-soft">AI-powered voice calling platform</p>
        </div>
        <div className="bg-raised border border-line rounded-2xl p-7 shadow-sm">
          {ticket ? (
            <form onSubmit={handleCode} className="flex flex-col gap-4" data-testid="twofa-form">
              <h1 className="text-[17px] font-semibold">Enter your 6-digit code</h1>
              <p className="text-[12.5px] text-ink-soft -mt-2">Open your authenticator app and type the code shown for RANA AI.</p>
              <input id="twofa-code" inputMode="numeric" autoComplete="one-time-code" autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="123456" className="w-full border border-line rounded-lg px-3 py-2.5 text-[20px] tracking-[0.3em] text-center bg-paper outline-none focus:border-signal" />
              {error && <div className="text-[12.5px] text-miss bg-miss-tint border border-miss/20 rounded-lg px-3 py-2.5">{error}</div>}
              <button type="submit" disabled={loading || code.length !== 6} className="bg-signal text-on-accent rounded-lg py-2.5 text-[14px] font-semibold disabled:opacity-40">{loading ? "Checking" : "Verify and sign in"}</button>
              <button type="button" onClick={() => { setTicket(""); setError(""); }} className="text-[12.5px] text-ink-soft">← Use a different account</button>
            </form>
          ) : (<>
          <h1 className="text-[17px] font-semibold mb-5">Sign in to your account</h1>
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div><label className="text-[12.5px] font-semibold text-ink-soft block mb-1.5">Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoFocus className="w-full border border-line rounded-lg px-3 py-2.5 text-[14px] bg-paper outline-none focus:border-signal" /></div>
            <div><label className="text-[12.5px] font-semibold text-ink-soft block mb-1.5">Password</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="" className="w-full border border-line rounded-lg px-3 py-2.5 text-[14px] bg-paper outline-none focus:border-signal" /></div>
            {error && <div className="text-[12.5px] text-miss bg-miss-tint border border-miss/20 rounded-lg px-3 py-2.5">{error}</div>}
            <button type="submit" disabled={loading || !email.trim() || !password.trim()} className="bg-signal text-on-accent rounded-lg py-2.5 text-[14px] font-semibold disabled:opacity-40 mt-1">{loading ? "Signing in" : "Sign in"}</button>
          </form>
          </>)}
        </div>
        <p className="text-center text-[12px] text-ink-soft mt-5">New to RANA? <a href="/signup" className="text-signal font-medium">Start a free trial</a> · Help: <span className="text-signal font-medium">support@getrana.in</span></p>
      </div>
    </div>
  );
}
