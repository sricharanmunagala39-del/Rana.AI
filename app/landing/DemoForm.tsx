"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const INDUSTRIES = ["Clinic / hospital / diagnostics", "Real estate", "Education / coaching / college", "E-commerce / D2C", "Insurance / loans / finance", "Hotel / restaurant / travel", "Automobile dealer / service", "Home & local services", "Other"];
const LANGS = ["Telugu", "Hindi", "Tamil", "Kannada", "Malayalam", "Marathi", "Bengali", "Gujarati", "Punjabi", "Odia", "English"];
const VOLUMES = ["Under 500 calls / month", "500 – 2,000", "2,000 – 10,000", "10,000+", "Not sure yet"];
const TIMES = ["Morning (10–12)", "Afternoon (12–4)", "Evening (4–7)", "Any time"];

/** "Book a demo" — a real form (not an email link), saved for RANA HQ and confirmed to the visitor. */
export default function DemoForm({ open, onClose, source }: { open: boolean; onClose: () => void; source: string }) {
  const [f, setF] = useState<any>({ name: "", phone: "", email: "", company: "", industry: "", wants: "both", languages: [] as string[], volume: "", bestTime: "", message: "", consent: false, website: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => first.current?.focus(), 60);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") closeRef.current(); };
    window.addEventListener("keydown", esc);
    return () => { document.body.style.overflow = ""; clearTimeout(t); window.removeEventListener("keydown", esc); };
  }, [open]);
  if (!open) return null;

  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));
  const toggleLang = (l: string) => set("languages", f.languages.includes(l) ? f.languages.filter((x: string) => x !== l) : [...f.languages, l]);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      const r = await fetch("/api/demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, source }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Couldn't send. Please email hello@ranaai.in.");
      setDone(true);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  const input = "w-full rounded-xl border border-white/10 bg-white/[.04] px-3.5 py-2.5 text-[14px] outline-none focus:border-signal/70 placeholder:text-ink-soft/60";
  const label = "text-[12px] font-semibold text-ink-soft block mb-1.5";

  return (
    <div className="fixed inset-0 z-[70] flex items-start sm:items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm overflow-y-auto" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="demo-title" className="card card-hi dialog-solid w-full max-w-[620px] my-6 p-6 sm:p-8 relative animate-rise" data-testid="demo-modal">
        <button onClick={onClose} className="absolute top-4 right-5 text-[28px] leading-none text-ink-soft hover:text-ink" aria-label="Close">×</button>
        {done ? (
          <div className="py-4" data-testid="demo-done">
            <div className="eyebrow">// REQUEST RECEIVED</div>
            <h2 id="demo-title" className="font-display text-[28px] font-semibold tracking-tight mt-2">Thanks, {f.name.split(" ")[0]}. We&apos;ll call you soon.</h2>
            <ol className="mt-5 flex flex-col gap-3 text-[14.5px]">
              {[["1", `We call you on ${f.phone} within one working day${f.bestTime ? ` — ${f.bestTime.toLowerCase()}` : ""}.`],
                ["2", "A 20-minute call: how your calls work today, which calls you miss, which leads go cold."],
                ["3", `We show an AI employee answering and calling for a business like yours${f.languages.length ? ` in ${f.languages.slice(0, 2).join(" and ")}` : ""}.`]].map(([n, t]) => (
                <li key={n} className="flex gap-3"><span className="font-mono text-signal">{n}</span><span>{t}</span></li>
              ))}
            </ol>
            {f.email && <p className="text-[13px] text-ink-soft mt-4">A confirmation is on its way to {f.email}.</p>}
            <div className="flex flex-wrap gap-3 mt-7">
              <Link href="/signup" className="btn-glow rounded-full px-6 py-3 text-[14px] font-semibold">Try it yourself now — free</Link>
              <button onClick={onClose} className="btn-ghost rounded-full px-6 py-3 text-[14px]">Back to the site</button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4" data-testid="demo-form">
            <div>
              <div className="eyebrow">// BOOK A DEMO</div>
              <h2 id="demo-title" className="font-display text-[26px] sm:text-[30px] font-semibold tracking-tight mt-2">See RANA handle your calls</h2>
              <p className="text-ink-soft text-[14px] mt-1">Tell us a little about your business. We call you back within one working day and show it working for your kind of calls, in your language.</p>
            </div>
            <input type="text" name="website" value={f.website} onChange={(e) => set("website", e.target.value)} className="hidden" tabIndex={-1} autoComplete="off" aria-hidden />
            <div className="grid sm:grid-cols-2 gap-3">
              <div><label className={label} htmlFor="d-name">Your name *</label><input id="d-name" ref={first} required value={f.name} onChange={(e) => set("name", e.target.value)} className={input} autoComplete="name" /></div>
              <div><label className={label} htmlFor="d-phone">Mobile number *</label><input id="d-phone" required inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="98xxxxxxxx" className={input} autoComplete="tel" /></div>
              <div><label className={label} htmlFor="d-company">Company *</label><input id="d-company" required value={f.company} onChange={(e) => set("company", e.target.value)} className={input} autoComplete="organization" /></div>
              <div><label className={label} htmlFor="d-email">Work email</label><input id="d-email" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="optional" className={input} autoComplete="email" /></div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div><label className={label} htmlFor="d-ind">Your business</label>
                <select id="d-ind" value={f.industry} onChange={(e) => set("industry", e.target.value)} className={input}><option value="">Choose…</option>{INDUSTRIES.map((x) => <option key={x}>{x}</option>)}</select></div>
              <div><label className={label} htmlFor="d-vol">Calls a month</label>
                <select id="d-vol" value={f.volume} onChange={(e) => set("volume", e.target.value)} className={input}><option value="">Choose…</option>{VOLUMES.map((x) => <option key={x}>{x}</option>)}</select></div>
            </div>
            <div>
              <span className={label}>What should RANA do?</span>
              <div className="grid grid-cols-3 gap-2" role="radiogroup">
                {[["answer", "Answer incoming calls"], ["call", "Call our leads"], ["both", "Both"]].map(([k, l]) => (
                  <button type="button" key={k} role="radio" aria-checked={f.wants === k} onClick={() => set("wants", k)} className={`rounded-xl border px-2 py-2.5 text-[13px] ${f.wants === k ? "border-signal/70 bg-signal/10 text-signal font-semibold" : "border-white/10 text-ink-soft hover:border-white/25"}`}>{l}</button>
                ))}
              </div>
            </div>
            <div>
              <span className={label}>Languages your customers speak</span>
              <div className="flex flex-wrap gap-1.5">
                {LANGS.map((l) => (
                  <button type="button" key={l} aria-pressed={f.languages.includes(l)} onClick={() => toggleLang(l)} className={`rounded-full border px-3 py-1 text-[12.5px] ${f.languages.includes(l) ? "border-signal/70 bg-signal/10 text-signal" : "border-white/10 text-ink-soft hover:border-white/25"}`}>{l}</button>
                ))}
              </div>
            </div>
            <div className="grid sm:grid-cols-[1fr_1.4fr] gap-3">
              <div><label className={label} htmlFor="d-time">Best time to call</label>
                <select id="d-time" value={f.bestTime} onChange={(e) => set("bestTime", e.target.value)} className={input}><option value="">Any time</option>{TIMES.map((x) => <option key={x}>{x}</option>)}</select></div>
              <div><label className={label} htmlFor="d-msg">Anything we should know?</label><input id="d-msg" value={f.message} onChange={(e) => set("message", e.target.value)} placeholder="e.g. we miss calls after 7 PM" className={input} /></div>
            </div>
            <label className="flex items-start gap-2.5 text-[12.5px] text-ink-soft">
              <input type="checkbox" required checked={f.consent} onChange={(e) => set("consent", e.target.checked)} className="mt-0.5" />
              <span>RANA AI may call or message me about this demo. We never share your number.</span>
            </label>
            {err && <div className="text-[13px] text-miss bg-miss/10 border border-miss/30 rounded-xl px-3 py-2">{err}</div>}
            <button type="submit" disabled={busy} className="btn-glow rounded-full py-3.5 text-[15px] font-semibold disabled:opacity-50">{busy ? "Sending…" : "Request my demo →"}</button>
            <p className="text-[12px] text-ink-soft text-center">Prefer email? <a href="mailto:hello@ranaai.in" className="text-signal">hello@ranaai.in</a></p>
          </form>
        )}
      </div>
    </div>
  );
}
