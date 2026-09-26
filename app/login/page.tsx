// @ts-nocheck
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AuthShell from "@/components/AuthShell";
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [justReset, setJustReset] = useState(false);
  useEffect(() => { const q = new URLSearchParams(window.location.search); const e = q.get("email"); if (e) setEmail(e); setJustReset(q.get("reset") === "1"); }, []);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ticket, setTicket] = useState("");
  const [code, setCode] = useState("");
  function go(data) {
    // Invited with a one-time password: set their own before anything else.
    if (data.mustChangePassword) { router.push("/settings?tab=account&first=1"); return; }
    const next = new URLSearchParams(window.location.search).get("next"); const safe = !!next && /^\/(?![\/\\])/.test(next) && !/[\\\s]/.test(next) && next !== "/"; // blocks //evil and /\evil
    router.push(safe ? next! : (data.home || "/"));
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
  const field = "w-full border border-line rounded-xl px-3.5 py-3 text-[14px] bg-sunken outline-none focus:border-signal";
  return (
    <AuthShell foot={<>New to RANA? <a href="/signup" className="text-signal font-semibold">Start a free trial</a> · Help: <span className="text-signal font-medium">support@ranaai.in</span></>}>
      {ticket ? (
        <form onSubmit={handleCode} className="flex flex-col gap-4" data-testid="twofa-form">
          <div className="text-[11px] font-mono text-signal tracking-wider">// STEP 2 OF 2</div>
          <h1 className="font-display text-[28px] font-semibold tracking-tight -mt-2">Enter your 6-digit code</h1>
          <p className="text-[13px] text-ink-soft -mt-2">Open your authenticator app and type the code shown for RANA AI.</p>
          <input id="twofa-code" inputMode="numeric" autoComplete="one-time-code" autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="123456" className="w-full border border-line rounded-xl px-3 py-3.5 text-[24px] font-mono tracking-[0.4em] text-center bg-sunken outline-none focus:border-signal" />
          {error && <div className="text-[12.5px] text-miss bg-miss-tint border border-miss/20 rounded-xl px-3 py-2.5">{error}</div>}
          <button type="submit" disabled={loading || code.length !== 6} className="bg-signal text-on-accent rounded-xl py-3 text-[14px] font-semibold disabled:opacity-40">{loading ? "Checking…" : "Verify and sign in"}</button>
          <button type="button" onClick={() => { setTicket(""); setError(""); }} className="text-[12.5px] text-ink-soft hover:text-ink">← Use a different account</button>
        </form>
      ) : (
        <>
          <div className="text-[11px] font-mono text-signal tracking-wider">// WELCOME BACK</div>
          <h1 className="font-display text-[30px] font-semibold tracking-tight mt-1 mb-1.5">Sign in to RANA</h1>
          <p className="text-[13.5px] text-ink-soft mb-7">Your AI employees kept working while you were away.</p>
          {justReset && <div className="text-[13px] bg-signal/10 border border-signal/25 rounded-xl px-3.5 py-2.5 mb-4" data-testid="reset-ok">✓ Password changed. Sign in with your new password.</div>}
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div><label className="text-[12px] font-semibold text-ink-soft block mb-1.5">Work email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoFocus className={field} /></div>
            <div><div className="flex items-center justify-between mb-1.5"><label className="text-[12px] font-semibold text-ink-soft">Password</label><a href={`/forgot-password${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ""}`} className="text-[12px] text-signal font-semibold" data-testid="forgot-link">Forgot password?</a></div><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className={field} /></div>
            {error && <div className="text-[12.5px] text-miss bg-miss-tint border border-miss/20 rounded-xl px-3 py-2.5">{error}</div>}
            <button type="submit" disabled={loading || !email.trim() || !password.trim()} className="bg-signal text-on-accent rounded-xl py-3 text-[14px] font-semibold disabled:opacity-40 mt-1">{loading ? "Signing in…" : "Sign in →"}</button>
          </form>
        </>
      )}
    </AuthShell>
  );
}
