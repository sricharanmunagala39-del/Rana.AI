// @ts-nocheck
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";

type Script = { id: string; name: string; cartesia_agent_id: string | null; tested_at: string | null };
type PhoneNumber = { id: string; number: string; label: string | null; provider: string };
type Contact = { name: string; phone: string; variables: Record<string, string>; valid: boolean; dup: boolean };

/* ── list parsing: paste or CSV, header optional ── */
function splitLine(line: string): string[] {
  const out: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if ((ch === "," || ch === "\t" || ch === ";") && !q) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}
function normalisePhone(raw: string): string | null {
  const s = String(raw || "").replace(/[^\d+]/g, "");
  let out: string;
  if (s.startsWith("+")) out = s; else if (s.startsWith("00")) out = "+" + s.slice(2);
  else if (s.length === 11 && s.startsWith("0")) out = "+91" + s.slice(1);
  else if (s.length === 10) out = "+91" + s;
  else if (s.length === 12 && s.startsWith("91")) out = "+" + s; else return null;
  return /^\+[1-9]\d{9,14}$/.test(out) ? out : null;
}
function parseList(text: string): { contacts: Contact[]; columns: string[] } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { contacts: [], columns: [] };
  let rows = lines.map(splitLine);
  const first = rows[0].map((h) => h.toLowerCase());
  const hasHeader = first.some((h) => /phone|mobile|number|contact|name/.test(h)) && !first.some((h) => normalisePhone(h));
  let header = hasHeader ? rows[0].map((h) => h.trim()) : [];
  if (hasHeader) rows = rows.slice(1);
  const width = Math.max(...rows.map((r) => r.length));
  if (!hasHeader) header = Array.from({ length: width }, (_, i) => `col${i + 1}`);
  // Phone column: named, otherwise the column with the most phone-like values.
  let pi = header.findIndex((h) => /phone|mobile|number|contact/i.test(h));
  if (pi < 0) {
    let best = -1;
    for (let i = 0; i < width; i++) { const n = rows.filter((r) => normalisePhone(r[i] || "")).length; if (n > best) { best = n; pi = i; } }
  }
  let ni = header.findIndex((h) => /^(full ?)?name$|student|doctor|customer|lead/i.test(h));
  if (ni < 0 && !hasHeader) ni = [0, 1].find((i) => i !== pi && rows.some((r) => r[i] && !normalisePhone(r[i]))) ?? -1;
  const varCols = header.map((h, i) => ({ h, i })).filter(({ i }) => i !== pi && i !== ni && hasHeader);
  const seen = new Set<string>();
  const contacts = rows.map((r) => {
    const phone = normalisePhone(r[pi] || "");
    const dup = !!phone && seen.has(phone);
    if (phone) seen.add(phone);
    const variables: Record<string, string> = {};
    for (const { h, i } of varCols) if (r[i]) variables[h.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")] = r[i];
    return { name: ni >= 0 ? r[ni] || "" : "", phone: phone || r[pi] || "", variables, valid: !!phone, dup };
  });
  return { contacts, columns: varCols.map(({ h }) => h.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")) };
}

const SAMPLE = `name,phone,college,year
Dr Priya Reddy,98480 12345,Osmania Medical College,2024
Dr Rahul Varma,+91 90000 54321,Gandhi Medical College,2023`;

// Defined at module level so inputs inside keep focus while typing.
function Section({ n, title, children }: any) {
  return (
    <section className="bg-raised border border-line rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2 text-[14.5px] font-semibold"><span className="w-6 h-6 rounded-full bg-signal text-on-accent text-[12px] flex items-center justify-center">{n}</span>{title}</div>
      {children}
    </section>
  );
}
const input = "border border-line rounded-lg px-3 py-2 text-[13px] bg-paper outline-none focus:border-signal";

export default function NewCampaignPage() {
  const router = useRouter();
  const [scripts, setScripts] = useState<Script[]>([]);
  const [cartesiaNumbers, setNumbers] = useState<PhoneNumber[]>([]);
  const [sarvamNumber, setSarvamNumber] = useState<PhoneNumber | null>(null);
  const [name, setName] = useState("");
  const [scriptId, setScriptId] = useState("");
  const [fromId, setFromId] = useState("");
  const [raw, setRaw] = useState("");
  const [when, setWhen] = useState<"now" | "later">("now");
  const [consent, setConsent] = useState<string>("");
  const [at, setAt] = useState("");
  const [concurrency, setConcurrency] = useState(5);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState("");
  const [nextOpen, setNextOpen] = useState<string | null>(null);
  const [hours, setHours] = useState<{ summary: string; openNow: boolean; enforce: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/scripts").then((r) => r.json()).then((d) => {
      const list = (d.scripts || []).filter((s: Script) => s.cartesia_agent_id);
      setScripts(list);
      const pre = new URLSearchParams(window.location.search).get("employee");
      const pick = list.find((s: Script) => s.id === pre) || list.find((s: Script) => s.tested_at);
      if (pick) setScriptId(pick.id);
    }).catch(() => {});
    fetch("/api/settings/calling").then((r) => r.json()).then((d) => d?.summary && setHours({ summary: d.summary, openNow: d.openNow, enforce: d.rules?.enforce !== false })).catch(() => {});
    fetch("/api/admin/cartesia-phone-numbers").then((r) => r.json()).then((d) => {
      setNumbers(d.numbers || []);
      if (d.numbers?.length === 1) setFromId(d.numbers[0].id);
    }).catch(() => {});
    fetch("/api/sarvam/status").then((r) => r.json()).then((d) => {
      if (d?.sarvam?.ready && d.sarvam.number) setSarvamNumber({ id: "sarvam", number: d.sarvam.number, label: "Sarvam · Indian number" } as any);
    }).catch(() => {});
  }, []);

  const parsed = useMemo(() => parseList(raw), [raw]);
  const ok = parsed.contacts.filter((c) => c.valid && !c.dup);
  const bad = parsed.contacts.filter((c) => !c.valid);
  const dups = parsed.contacts.filter((c) => c.dup);
  const script = scripts.find((s) => s.id === scriptId);
  // Employees on the Sarvam engine call from the Sarvam Indian number; Cartesia employees from Cartesia/Twilio numbers.
  const onSarvam = !!script && String(script.cartesia_agent_id || "").startsWith("sarvam:");
  const numbers: PhoneNumber[] = onSarvam ? (sarvamNumber ? [sarvamNumber] : []) : cartesiaNumbers;
  useEffect(() => {
    if (onSarvam && sarvamNumber) setFromId("sarvam");
    else if (!onSarvam && fromId === "sarvam") setFromId(cartesiaNumbers.length === 1 ? cartesiaNumbers[0].id : "");
  }, [onSarvam, sarvamNumber]);
  const from = numbers.find((n) => n.id === fromId);
  const scheduledIso = when === "later" && at ? new Date(`${at}:00+05:30`).toISOString() : null;
  const problems = [
    !consent && "Choose who you're calling (below)",
    !name.trim() && "Name the campaign",
    !script && "Choose an employee",
    script && !script.tested_at && `${script.name} hasn't been signed off on the Talk page yet`,
    !from && "Choose the number to call from",
    !ok.length && "Add at least one valid phone number",
    ok.length > 5000 && "Maximum 5,000 numbers per campaign",
    when === "later" && (!scheduledIso || Date.parse(scheduledIso) < Date.now() + 60000) && "Pick a start time in the future",
  ].filter(Boolean) as string[];

  async function onFile(f: File | undefined) {
    if (!f) return;
    setRaw(await f.text());
  }

  async function launch() {
    if (problems.length) return;
    setLaunching(true); setError(""); setNextOpen(null);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), scriptId, fromNumberId: fromId, scheduledAt: scheduledIso, concurrency, consent: { basis: consent },
          contacts: ok.map((c) => ({ name: c.name, phone: c.phone, variables: c.variables })) }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "outside_calling_window" && data.nextOpen) setNextOpen(data.nextOpen);
        throw new Error(data.error || "Launch failed");
      }
      router.push(`/outbound/${data.campaign.id}`);
    } catch (e: any) { setError(e.message); setLaunching(false); }
  }

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar active="outbound" />
      <div className="flex-1 min-w-0 px-6 py-8 lg:px-10">
        <div className="max-w-[860px] flex flex-col gap-4">
          <div>
            <Link href="/outbound" className="text-[12.5px] text-ink-soft hover:text-ink">← Campaigns</Link>
            <div className="text-[22px] font-display font-semibold mt-1">New calling campaign</div>
            <div className="text-[13px] text-ink-soft">Your employee dials every number on the list, has the conversation, and labels each lead. Results appear live on the campaign page and dashboard.</div>
          </div>

          <Section n={1} title="Who calls, and from which number">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder='Campaign name, e.g. "NEET PG Oct batch — Hyderabad reactivation"' className={input} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-[12px] text-ink-soft">Employee
                <select value={scriptId} onChange={(e) => setScriptId(e.target.value)} className={input}>
                  <option value="">Choose…</option>
                  {scripts.map((s) => <option key={s.id} value={s.id}>{s.name}{s.tested_at ? "" : " (not signed off)"}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[12px] text-ink-soft">Call from
                <select value={fromId} onChange={(e) => setFromId(e.target.value)} className={input}>
                  <option value="">Choose…</option>
                  {numbers.map((n) => <option key={n.id} value={n.id}>{n.number}{n.label ? ` — ${n.label}` : ""}</option>)}
                </select>
              </label>
            </div>
            {script && !script.tested_at && <div className="text-[12px] text-miss">{script.name} must be tested first. <Link href={`/talk?scriptId=${script.id}`} className="font-semibold underline">Talk & sign off →</Link></div>}
            {scripts.length === 0 && <div className="text-[12px] text-ink-soft">No published employees yet — <Link href="/employees" className="text-signal font-semibold">publish one</Link> first.</div>}
            {numbers.length === 0 && <div className="text-[12px] text-ink-soft">No phone numbers yet — add one on <Link href="/phone-numbers" className="text-signal font-semibold">Phone Numbers</Link>.</div>}
          </Section>

          <Section n={2} title="Who to call">
            <div className="text-[12.5px] text-ink-soft">Paste from Excel/Sheets or upload a CSV. One person per line. A <span className="font-semibold">phone</span> column is required; <span className="font-semibold">name</span> and any other columns (college, year, course…) are passed to the employee so it can use them in the conversation.</div>
            <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={7} placeholder={SAMPLE} className={`${input} font-mono text-[12px]`} />
            <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
              <label className="border border-line rounded-lg px-3 py-1.5 font-semibold cursor-pointer hover:bg-paper">Upload CSV<input type="file" accept=".csv,.txt,.tsv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} /></label>
              <button onClick={() => setRaw(SAMPLE)} className="text-ink-soft hover:text-ink">Use sample</button>
              {parsed.contacts.length > 0 && (
                <span className="text-ink-soft"><span className="font-semibold text-signal">{ok.length} ready</span>{bad.length ? ` · ${bad.length} invalid` : ""}{dups.length ? ` · ${dups.length} duplicates removed` : ""}</span>
              )}
            </div>
            {parsed.columns.length > 0 && <div className="text-[12px] text-ink-soft">Extra details the employee can use: {parsed.columns.map((c) => <span key={c} className="font-mono bg-paper border border-line rounded px-1.5 py-0.5 mr-1">{`{{${c}}}`}</span>)}</div>}
            {parsed.contacts.length > 0 && (
              <div className="border border-line rounded-lg overflow-hidden">
                <table className="w-full text-[12.5px]">
                  <thead className="bg-paper text-ink-soft text-left"><tr><th className="px-3 py-1.5 font-medium">Name</th><th className="px-3 py-1.5 font-medium">Phone</th><th className="px-3 py-1.5 font-medium">Details</th><th className="px-3 py-1.5 font-medium"></th></tr></thead>
                  <tbody>
                    {parsed.contacts.slice(0, 6).map((c, i) => (
                      <tr key={i} className="border-t border-line">
                        <td className="px-3 py-1.5">{c.name || "—"}</td><td className="px-3 py-1.5 font-mono">{c.phone}</td>
                        <td className="px-3 py-1.5 text-ink-soft truncate max-w-[260px]">{Object.values(c.variables).join(" · ") || "—"}</td>
                        <td className="px-3 py-1.5 text-right">{!c.valid ? <span className="text-miss">invalid</span> : c.dup ? <span className="text-ink-soft">duplicate</span> : <span className="text-signal">✓</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsed.contacts.length > 6 && <div className="px-3 py-1.5 text-[11.5px] text-ink-soft border-t border-line">+ {parsed.contacts.length - 6} more</div>}
              </div>
            )}
          </Section>

          <Section n={3} title="When">
            <div className="flex flex-wrap gap-2">
              {[{ k: "now", l: "Start now" }, { k: "later", l: "Schedule" }].map((o) => (
                <button key={o.k} onClick={() => setWhen(o.k as any)} className={`text-[12.5px] font-semibold px-3.5 py-1.5 rounded-lg border ${when === o.k ? "bg-ink text-paper border-ink" : "border-line text-ink-soft"}`}>{o.l}</button>
              ))}
              {when === "later" && <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className={input} />}
            </div>
            <label className="flex items-center gap-3 text-[12.5px] text-ink-soft">
              Calls at the same time
              <input type="number" min={1} max={50} value={concurrency} onChange={(e) => setConcurrency(Number(e.target.value) || 1)} className={`${input} w-20`} />
              <span>— keep this at or below how many leads your sales team can follow up quickly.</span>
            </label>
            <div className="text-[11.5px] text-ink-soft">
              Times are India time. Call only people who&apos;ve agreed to hear from you.{" "}
              {hours && (hours.enforce
                ? <>Your calling hours: <span className="font-semibold">{hours.summary}</span>{when === "now" && !hours.openNow ? <span className="text-miss font-semibold"> — closed right now, so schedule this for later</span> : ""}. Numbers on your do-not-call list are skipped automatically. <a href="/settings?tab=calling" className="text-signal font-semibold">Change</a></>
                : <>Calling hours aren&apos;t enforced. <a href="/settings?tab=calling" className="text-signal font-semibold">Set them</a></>)}
            </div>
          </Section>

          <section className="bg-raised border border-line rounded-2xl p-5 flex flex-col gap-3">
            <div className="text-[14.5px] font-semibold">Review</div>
            <div className="text-[13px] leading-relaxed">
              <span className="font-semibold">{script?.name || "—"}</span> will call <span className="font-semibold">{ok.length.toLocaleString("en-IN")}</span> people
              from <span className="font-semibold">{from?.number || "—"}</span>, {when === "now" ? "starting now" : scheduledIso ? `starting ${new Date(scheduledIso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}` : "at the time you pick"},
              up to {concurrency} at a time.
            </div>
            <div className="flex flex-col gap-2 border border-line rounded-lg p-3 bg-paper" data-testid="campaign-consent">
              <div className="text-[12.5px] font-semibold">Who are you calling?</div>
              {[
                ["enquiries", "People who enquired with us (form, ad, missed call, walk-in) and expect a call"],
                ["customers", "Our existing students / customers (reminders, fee dues, follow-ups)"],
              ].map(([k, t]) => (
                <label key={k} className="flex items-start gap-2 text-[12.5px] cursor-pointer">
                  <input type="radio" name="consent" checked={consent === k} onChange={() => setConsent(k)} className="mt-0.5 accent-signal" data-testid={`consent-${k}`} />
                  <span>{t}</span>
                </label>
              ))}
              <div className="text-[11.5px] text-ink-soft">Cold lists of people who never enquired can't be called from a normal number — TRAI requires a 140-series number for that. Ask RANA if you need one.</div>
            </div>
            {problems.length > 0 && <ul className="text-[12.5px] text-ink-soft list-disc pl-5">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
            {error && (
              <div className="text-[12.5px] text-miss bg-miss-tint rounded-lg px-3 py-2 flex items-center gap-3 flex-wrap">
                <span className="flex-1">{error}</span>
                {nextOpen && (
                  <button type="button" className="bg-ink text-paper rounded-md px-3 py-1.5 text-[12px] font-semibold"
                    onClick={() => {
                      // The picker works in IST, like the rest of the wizard.
                      const ist = new Date(Date.parse(nextOpen) + 330 * 60000).toISOString().slice(0, 16);
                      setWhen("later"); setAt(ist); setError(""); setNextOpen(null);
                    }}>
                    Schedule for {new Date(nextOpen).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}
                  </button>
                )}
              </div>
            )}
            <div>
              <button onClick={launch} disabled={launching || problems.length > 0} className="bg-signal text-on-accent rounded-lg px-5 py-2.5 text-[13.5px] font-semibold disabled:opacity-40">
                {launching ? "Launching…" : when === "now" ? `Launch — call ${ok.length} people` : "Schedule campaign"}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
