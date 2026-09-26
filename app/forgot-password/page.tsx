// @ts-nocheck
"use client";
import { useEffect, useState } from "react";
import AuthShell from "@/components/AuthShell";

/** Step 1 of "Forgot password?": ask for the email, send a one-time link. */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  useEffect(() => { const e = new URLSearchParams(window.location.search).get("email"); if (e) setEmail(e); }, []);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState("");
  const [error, setError] = useState("");
  const field = "w-full border border-line rounded-xl px-3.5 py-3 text-[14px] bg-sunken outline-none focus:border-signal";
  async function submit(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true); setError("");
    try {
      const r = await fetch("/api/auth/forgot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim() }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Couldn't send the link.");
      setSent(j.message);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }
  return (
    <AuthShell foot={<>Remembered it? <a href="/login" className="text-signal font-semibold">Back to sign in</a> · Help: <span className="text-signal font-medium">support@ranaai.in</span></>}>
      <div className="text-[11px] font-mono text-signal tracking-wider">// FORGOT PASSWORD</div>
      <h1 className="font-display text-[30px] font-semibold tracking-tight mt-1 mb-1.5">Reset your password</h1>
      {sent ? (
        <div className="flex flex-col gap-4 mt-3" data-testid="forgot-sent">
          <div className="text-[13.5px] bg-signal/10 border border-signal/25 rounded-xl px-3.5 py-3">📧 {sent}</div>
          <p className="text-[13px] text-ink-soft">Open the email from <b>support@ranaai.in</b> and press <b>Choose a new password</b>. You can close this page.</p>
          <button onClick={() => { setSent(""); }} className="text-[12.5px] text-ink-soft hover:text-ink text-left">Didn't get it? Send again</button>
        </div>
      ) : (
        <>
          <p className="text-[13.5px] text-ink-soft mb-7">Enter the email you sign in with. We'll email you a link to choose a new password.</p>
          <form onSubmit={submit} className="flex flex-col gap-4" data-testid="forgot-form">
            <div><label className="text-[12px] font-semibold text-ink-soft block mb-1.5">Work email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoFocus className={field} /></div>
            {error && <div className="text-[12.5px] text-miss bg-miss-tint border border-miss/20 rounded-xl px-3 py-2.5">{error}</div>}
            <button type="submit" disabled={loading || !email.trim()} className="bg-signal text-on-accent rounded-xl py-3 text-[14px] font-semibold disabled:opacity-40 mt-1">{loading ? "Sending…" : "Email me a reset link"}</button>
          </form>
        </>
      )}
    </AuthShell>
  );
}
