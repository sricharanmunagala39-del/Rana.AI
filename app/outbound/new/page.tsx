// @ts-nocheck
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import LeadListImport from "@/components/LeadListImport";

type Script = { id: string; name: string; cartesia_agent_id: string | null; tested_at: string | null };
type PhoneNumber = { id: string; number: string; label: string | null; provider: string };

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
  const [approvedList, setApprovedList] = useState<any[] | null>(null);
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
      if (d?.sarvam?.ready && d.sarvam.number) setSarvamNumber({ id: "sarvam", number: d.sarvam.number, label: "RANA Indian number" } as any);
    }).catch(() => {});
  }, []);

  const ok = approvedList || [];
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
    !approvedList && "Add your list and press “Looks right” to approve it",
    approvedList && !ok.length && "Add at least one valid phone number",
    ok.length > 5000 && "Maximum 5,000 numbers per campaign",
    when === "later" && (!scheduledIso || Date.parse(scheduledIso) < Date.now() + 60000) && "Pick a start time in the future",
  ].filter(Boolean) as string[];


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
            <LeadListImport onApproved={setApprovedList} />
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
