// @ts-nocheck
"use client";
import { useEffect, useState } from "react";
import AuthShell from "@/components/AuthShell";

/** Step 2 of "Forgot password?": opened from the email link; choose the new password. */
export default function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [check, setCheck] = useState(null); // null = checking, {ok,email}
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token") || "";
    setToken(t);
    // Keep the secret link out of the address bar and browser history once it's read.
    if (t) window.history.replaceState(null, "", "/reset-password");
    fetch(`/api/auth/reset?token=${encodeURIComponent(t)}`).then((r) => r.json()).then(setCheck).catch(() => setCheck({ ok: false }));
  }, []);
  const tooShort = pw.length > 0 && pw.length < 10;
  const noMix = pw.length >= 10 && !(/[a-zA-Z]/.test(pw) && /\d/.test(pw));
  const mismatch = pw2.length > 0 && pw !== pw2;
  const ready = pw.length >= 10 && !noMix && pw === pw2;
  async function submit(e) {
    e.preventDefault();
    if (!ready) return;
    setLoading(true); setError("");
    try {
      const r = await fetch("/api/auth/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password: pw }) });
      const j = await r.json();
      if (!r.ok) { if (j.expired) setCheck({ ok: false }); throw new Error(j.error || "Couldn't change the password."); }
      setDone(j.email);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }
  const field = "w-full border border-line rounded-xl px-3.5 py-3 text-[14px] bg-sunken outline-none focus:border-signal";
  const foot = <>Back to <a href="/login" className="text-signal font-semibold">sign in</a> · Help: <span className="text-signal font-medium">support@ranaai.in</span></>;
  return (
    <AuthShell foot={foot}>
      <div className="text-[11px] font-mono text-signal tracking-wider">// NEW PASSWORD</div>
      <h1 className="font-display text-[30px] font-semibold tracking-tight mt-1 mb-1.5">Choose a new password</h1>
      {done ? (
        <div className="flex flex-col gap-4 mt-3" data-testid="reset-done">
          <div className="text-[13.5px] bg-signal/10 border border-signal/25 rounded-xl px-3.5 py-3">✓ Password changed. For your safety, every other device was signed out.</div>
          <a href={`/login?email=${encodeURIComponent(done)}&reset=1`} className="bg-signal text-on-accent rounded-xl py-3 text-[14px] font-semibold text-center">Sign in with your new password →</a>
        </div>
      ) : check === null ? (
        <p className="text-[13.5px] text-ink-soft">Checking your link…</p>
      ) : !check.ok ? (
        <div className="flex flex-col gap-4 mt-3" data-testid="reset-expired">
          <div className="text-[13px] text-miss bg-miss-tint border border-miss/20 rounded-xl px-3.5 py-3">This reset link has expired or was already used. Links work once, for 30 minutes.</div>
          <a href="/forgot-password" className="bg-signal text-on-accent rounded-xl py-3 text-[14px] font-semibold text-center">Send me a new link</a>
        </div>
      ) : (
        <>
          <p className="text-[13.5px] text-ink-soft mb-7">For <b>{check.email}</b>. Use at least 10 characters with letters and numbers.</p>
          <form onSubmit={submit} className="flex flex-col gap-4" data-testid="reset-form">
            <div><label className="text-[12px] font-semibold text-ink-soft block mb-1.5">New password</label><input type={show ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" autoFocus className={field} />
              {tooShort && <div className="text-[12px] text-hot mt-1">At least 10 characters.</div>}
              {noMix && <div className="text-[12px] text-hot mt-1">Mix letters and numbers.</div>}</div>
            <div><label className="text-[12px] font-semibold text-ink-soft block mb-1.5">Type it again</label><input type={show ? "text" : "password"} value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" className={field} />
              {mismatch && <div className="text-[12px] text-hot mt-1">The two passwords don't match.</div>}</div>
            <label className="text-[12.5px] text-ink-soft flex items-center gap-2"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show password</label>
            {error && <div className="text-[12.5px] text-miss bg-miss-tint border border-miss/20 rounded-xl px-3 py-2.5">{error}</div>}
            <button type="submit" disabled={loading || !ready} className="bg-signal text-on-accent rounded-xl py-3 text-[14px] font-semibold disabled:opacity-40 mt-1">{loading ? "Saving…" : "Save new password"}</button>
          </form>
        </>
      )}
    </AuthShell>
  );
}
