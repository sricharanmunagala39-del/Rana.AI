"use client";
import { useEffect, useRef, useState } from "react";
import { utmTag } from "./utm";
import { art } from "./verticals";

/** "Free proof run": a business sends up to 200 old enquiries; RANA calls them free and sends back a report. */
export const PROOF_MAX = 200;
export type ProofLead = { name: string; phone: string; note: string };

/** Reads a CSV / pasted list: finds the phone column, keeps name and one note column, de-duplicates, max 200. */
export function parseLeads(text: string): { leads: ProofLead[]; skipped: number } {
  const rows = text.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
  if (!rows.length) return { leads: [], skipped: 0 };
  const delim = [",", ";", "\t", "|"].sort((a, b) => rows[0].split(b).length - rows[0].split(a).length)[0];
  const split = (l: string) => l.split(delim).map((c) => c.replace(/^"|"$/g, "").trim());
  const digits = (c: string) => c.replace(/\D/g, "");
  const isPhone = (c: string) => { const d = digits(c); return d.length >= 10 && d.length <= 13 && !/[a-z]/i.test(c.replace(/\+/g, "")); };
  const cells = rows.map(split);
  const width = Math.max(...cells.map((r) => r.length));
  let pc = 0, best = -1;
  for (let i = 0; i < width; i++) { const n = cells.filter((r) => r[i] && isPhone(r[i])).length; if (n > best) { best = n; pc = i; } }
  const head = cells[0].map((c) => c.toLowerCase());
  const hasHeader = !isPhone(cells[0][pc] || "");
  const nameCol = hasHeader ? head.findIndex((h) => /name/.test(h)) : pc === 0 ? 1 : 0;
  const noteCol = hasHeader ? head.findIndex((h) => /course|interest|project|note|remark|requirement|product|source/.test(h)) : -1;
  const seen = new Set<string>(); const leads: ProofLead[] = []; let skipped = 0;
  for (const r of hasHeader ? cells.slice(1) : cells) {
    const raw = r[pc] || ""; let d = digits(raw);
    if (d.length === 12 && d.startsWith("91")) d = d.slice(2); else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
    const phone = /^[6-9]\d{9}$/.test(d) ? `+91${d}` : raw.trim().startsWith("+") && d.length >= 8 ? `+${d}` : "";
    if (!phone || seen.has(phone)) { skipped++; continue; }
    if (leads.length >= PROOF_MAX) { skipped++; continue; }
    seen.add(phone);
    leads.push({ phone, name: nameCol >= 0 && nameCol !== pc ? (r[nameCol] || "").slice(0, 60) : "", note: noteCol >= 0 && noteCol !== pc ? (r[noteCol] || "").slice(0, 120) : "" });
  }
  return { leads, skipped };
}

export default function ProofRunForm({ open, onClose, industry, win }: { open: boolean; onClose: () => void; industry?: string; win?: string }) {
  const [f, setF] = useState({ name: "", phone: "", email: "", company: "", city: "", message: "", consent: false, website: "" });
  const [leads, setLeads] = useState<ProofLead[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => first.current?.focus(), 60);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") closeRef.current(); };
    window.addEventListener("keydown", esc);
    return () => { document.body.style.overflow = ""; clearTimeout(t); window.removeEventListener("keydown", esc); };
  }, [open]);
  if (!open) return null;

  const set = (k: string, v: any) => setF((x) => ({ ...x, [k]: v }));
  const take = (text: string) => { const r = parseLeads(text); setLeads(r.leads); setSkipped(r.skipped); };
  async function onFile(file?: File | null) {
    if (!file) return; setErr("");
    if (!/\.(csv|txt)$/i.test(file.name)) { setErr("Please upload a .csv file (in Excel: File → Save as → CSV), or paste the numbers below."); return; }
    take(await file.text());
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      const r = await fetch("/api/proof-run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, industry: industry || "", leads, source: utmTag() ? `proof-run|${utmTag()}` : "proof-run" }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Couldn't send. Please email hello@ranaai.in.");
      setDone(true);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  const input = "w-full rounded-xl border border-white/10 bg-white/[.04] px-3.5 py-2.5 text-[14px] outline-none focus:border-signal/70 placeholder:text-ink-soft/60";
  const label = "text-[12px] font-semibold text-ink-soft block mb-1.5";
  return (
    <div className="fixed inset-0 z-[70] flex items-start sm:items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm overflow-y-auto" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="proof-title" className="card card-hi dialog-solid w-full max-w-[640px] my-6 p-6 sm:p-8 relative animate-rise" data-testid="proof-modal">
        <button onClick={onClose} className="absolute top-4 right-5 text-[28px] leading-none text-ink-soft hover:text-ink" aria-label="Close">×</button>
        {done ? (
          <div className="flex flex-col gap-3 py-4" data-testid="proof-done">
            <div className="eyebrow">// REQUEST RECEIVED</div>
            <h2 className="font-display text-[26px] font-semibold tracking-tight">We&apos;ll start your proof run.</h2>
            <p className="text-ink-soft text-[14.5px] leading-relaxed">We&apos;ll call you on <b className="text-ink">{f.phone}</b> within one working day to check the list and your script. Then RANA calls {leads.length ? `your ${leads.length} enquiries` : "your enquiries"} during permitted hours and we send you the report — who&apos;s still interested and who wants {win ? `${art(win)} ${win}` : "the next step"}. Free, no card.</p>
            {!leads.length && <p className="text-[13.5px] text-ink-soft">You can WhatsApp or email the list to <a className="text-signal" href="mailto:hello@ranaai.in">hello@ranaai.in</a> when you&apos;re ready.</p>}
            <button onClick={onClose} className="btn-glow rounded-full px-6 py-3 text-[14px] font-semibold self-start mt-2">Done</button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div>
              <div className="eyebrow">// FREE PROOF RUN</div>
              <h2 id="proof-title" className="font-display text-[26px] font-semibold tracking-tight mt-1">We call your old enquiries. Free.</h2>
              <p className="text-ink-soft text-[14px] leading-relaxed mt-2">Send up to {PROOF_MAX} enquiries your team never called back. RANA calls them in their language and you get a report of who&apos;s still interested{win ? ` and who wants ${art(win)} ${win}` : ""}. No card, no contract.</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div><label className={label} htmlFor="pr-name">Your name</label><input ref={first} id="pr-name" className={input} value={f.name} onChange={(e) => set("name", e.target.value)} required /></div>
              <div><label className={label} htmlFor="pr-company">Business name</label><input id="pr-company" className={input} value={f.company} onChange={(e) => set("company", e.target.value)} required /></div>
              <div><label className={label} htmlFor="pr-phone">Mobile number</label><input id="pr-phone" className={input} inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="98xxxxxxxx" required /></div>
              <div><label className={label} htmlFor="pr-email">Email (for the report)</label><input id="pr-email" type="email" className={input} value={f.email} onChange={(e) => set("email", e.target.value)} /></div>
              <div className="sm:col-span-2"><label className={label} htmlFor="pr-city">City</label><input id="pr-city" className={input} value={f.city} onChange={(e) => set("city", e.target.value)} placeholder="Hyderabad" /></div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[.02] p-4 flex flex-col gap-3">
              <div className="text-[13px] font-semibold">Your enquiry list <span className="text-ink-soft font-normal">(optional now — you can send it later)</span></div>
              <input type="file" accept=".csv,.txt,text/csv" onChange={(e) => onFile(e.target.files?.[0])} className="text-[13px] text-ink-soft file:mr-3 file:rounded-full file:border-0 file:bg-signal/15 file:text-signal file:px-3 file:py-1.5 file:font-semibold" data-testid="proof-file" aria-label="Upload CSV" />
              <textarea rows={3} className={input} placeholder={"Or paste numbers, one per line:\nPriya, 98765 43210, NEET long-term"} value={paste} onChange={(e) => { setPaste(e.target.value); take(e.target.value); }} aria-label="Paste numbers" />
              {(leads.length > 0 || skipped > 0) && <div className="text-[12.5px]" data-testid="proof-count"><b className="text-signal">{leads.length} numbers ready</b>{skipped ? <span className="text-ink-soft"> · {skipped} skipped (duplicates, invalid or over {PROOF_MAX})</span> : null}</div>}
            </div>
            <div><label className={label} htmlFor="pr-msg">Anything we should know? (courses, projects, what to ask)</label><textarea id="pr-msg" rows={2} className={input} value={f.message} onChange={(e) => set("message", e.target.value)} /></div>
            <input tabIndex={-1} autoComplete="off" className="hidden" value={f.website} onChange={(e) => set("website", e.target.value)} aria-hidden />
            <label className="flex gap-2.5 text-[12.5px] text-ink-soft leading-relaxed">
              <input type="checkbox" checked={f.consent} onChange={(e) => set("consent", e.target.checked)} className="mt-0.5 accent-[rgb(45,225,194)]" data-testid="proof-consent" />
              <span>These people enquired with my business or agreed to be contacted. RANA may call them for this proof run during permitted hours, and may call me about it. Anyone who says no won&apos;t be called again.</span>
            </label>
            {err && <div className="text-[13px] text-miss" role="alert">{err}</div>}
            <button disabled={busy} className="btn-glow rounded-full py-3 text-[14.5px] font-semibold disabled:opacity-60" data-testid="proof-submit">{busy ? "Sending…" : "Start my free proof run →"}</button>
          </form>
        )}
      </div>
    </div>
  );
}
