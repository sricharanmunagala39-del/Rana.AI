// @ts-nocheck
"use client";
// Call transfer / human handoff: who is on the team, and when the AI hands a caller to them.

import { useEffect, useState } from "react";
import { Card } from "./Editors";
import { EMPTY_HANDOFF, RULES, TEAM_LABELS, normalizeHandoff, cleanPhone } from "@/lib/handoff";

const field = "border border-line rounded-lg px-2.5 py-1.5 text-[13px] bg-paper outline-none focus:border-signal w-full";

export default function HandoffPanel({ value, onChange }: any) {
  const h = value ? { ...EMPTY_HANDOFF, ...value, rules: value.rules?.length ? value.rules : EMPTY_HANDOFF.rules.map((r) => ({ ...r })) } : { ...EMPTY_HANDOFF, rules: EMPTY_HANDOFF.rules.map((r) => ({ ...r })) };
  const [live, setLive] = useState<boolean | null>(null);
  useEffect(() => { fetch("/api/sarvam/status").then((r) => r.json()).then((d) => setLive(!!d.liveTransfer)).catch(() => setLive(false)); }, []);
  const set = (patch: any) => onChange({ ...h, ...patch });
  const setContact = (i: number, k: string, v: string) => set({ contacts: h.contacts.map((c: any, j: number) => (j === i ? { ...c, [k]: v } : c)) });
  const addContact = () => set({ enabled: true, contacts: [...h.contacts, { key: `p${Date.now().toString(36)}`, name: "", team: h.contacts.length ? "support" : "sales", phone: "", email: "", aka: "" }] });
  const setRule = (key: string, patch: any) => set({ rules: h.rules.map((r: any) => (r.key === key ? { ...r, ...patch } : r)) });
  const clean = normalizeHandoff({ ...h, enabled: true });
  const badPhone = (p: string) => p.trim() && !cleanPhone(p);

  return (
    <div className="flex flex-col gap-4" data-testid="handoff-panel">
      <Card title="Hand the call to a person" hint="Your AI handles the conversation — but when a caller is ready to pay, asks for someone by name, or is an existing customer with a problem, a person should take over.">
        <label className="flex items-center gap-2.5 text-[13.5px] font-semibold cursor-pointer">
          <input type="checkbox" checked={!!h.enabled} onChange={(e) => (e.target.checked && !h.contacts.length ? addContact() : set({ enabled: e.target.checked }))} className="accent-signal w-4 h-4" data-testid="handoff-on" />
          Hand callers to my team when a person is needed
        </label>
        <div className="text-[12px] text-ink-soft mt-2 leading-relaxed">
          {live
            ? <>The AI says one line (“let me connect you”) and <b>transfers the call live</b> to the person for “Ready to join or pay”. For everyone else it promises a call back within 10 minutes — and RANA emails that person straight away with the caller's number and what they said.</>
            : <>The AI says one line (“let me get the right person for you”), promises a call back within 10 minutes, and RANA <b>emails that person the moment the call ends</b> with the caller's number and exactly what they said. The call is also marked for follow-up. <span className="text-ink">Live transfer during the call is being switched on by RANA</span> — your settings here will be used for it automatically.</>}
        </div>
      </Card>

      {h.enabled && (
        <>
          <Card title="Your team" hint="Who can take calls. Add anyone a caller might ask for by name." badge={h.contacts.length || null}>
            <div className="flex flex-col gap-2.5" data-testid="handoff-team">
              {h.contacts.map((c: any, i: number) => (
                <div key={c.key} className="grid grid-cols-12 gap-2 items-start border border-line rounded-lg p-2.5 bg-paper/50">
                  <input value={c.name} onChange={(e) => setContact(i, "name", e.target.value)} placeholder="Name, e.g. Charan" className={`${field} col-span-6 md:col-span-3`} data-testid={`hc-name-${i}`} />
                  <select value={c.team} onChange={(e) => setContact(i, "team", e.target.value)} className={`${field} col-span-6 md:col-span-3`}>
                    {Object.entries(TEAM_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                  <div className="col-span-6 md:col-span-3">
                    <input value={c.phone} onChange={(e) => setContact(i, "phone", e.target.value)} placeholder="Phone, e.g. 98480 12345" className={`${field} ${badPhone(c.phone) ? "border-miss" : ""}`} data-testid={`hc-phone-${i}`} />
                    {badPhone(c.phone) && <div className="text-[11px] text-miss mt-0.5">Check this number</div>}
                  </div>
                  <input value={c.email} onChange={(e) => setContact(i, "email", e.target.value)} placeholder="Email for alerts" className={`${field} col-span-6 md:col-span-3`} data-testid={`hc-email-${i}`} />
                  <input value={c.aka} onChange={(e) => setContact(i, "aka", e.target.value)} placeholder="Callers may also say… e.g. Charan sir, admissions head" className={`${field} col-span-10 md:col-span-11`} />
                  <button type="button" onClick={() => set({ contacts: h.contacts.filter((_: any, j: number) => j !== i) })} className="col-span-2 md:col-span-1 text-[12px] text-ink-soft hover:text-miss py-1.5">Remove</button>
                </div>
              ))}
              <button type="button" onClick={addContact} className="self-start text-[12.5px] font-semibold text-signal" data-testid="hc-add">+ Add person</button>
              {h.contacts.some((c: any) => !c.email) && <div className="text-[11.5px] text-ink-soft">No email? Alerts for that person go to your workspace owner instead.</div>}
            </div>
          </Card>

          <Card title="When to hand over" hint="Tick the situations where a person should take over, and who it goes to.">
            <div className="flex flex-col gap-2" data-testid="handoff-rules">
              {RULES.map((r) => {
                const rule = h.rules.find((x: any) => x.key === r.key) || { on: false, to: "" };
                const auto = clean.contacts.find((c) => c.team === r.team) || clean.contacts[0];
                return (
                  <div key={r.key} className={`flex flex-wrap items-center gap-x-3 gap-y-1 border rounded-lg px-3 py-2 ${rule.on ? "border-signal/40 bg-signal-tint/30" : "border-line"}`}>
                    <label className="flex items-start gap-2 flex-1 min-w-[240px] cursor-pointer">
                      <input type="checkbox" checked={!!rule.on} onChange={(e) => setRule(r.key, { on: e.target.checked })} className="accent-signal mt-0.5" data-testid={`rule-${r.key}`} />
                      <span><span className="text-[13px] font-semibold">{r.label}</span><span className="block text-[11.5px] text-ink-soft">{r.example}</span></span>
                    </label>
                    {rule.on && r.key !== "asks_person" && (
                      <label className="text-[12px] text-ink-soft flex items-center gap-1.5">Goes to
                        <select value={rule.to || ""} onChange={(e) => setRule(r.key, { to: e.target.value })} className="border border-line rounded-md px-2 py-1 text-[12.5px] bg-paper text-ink">
                          <option value="">{auto ? `${auto.name || "—"} (${TEAM_LABELS[auto.team]})` : "First person"}</option>
                          {h.contacts.map((c: any) => <option key={c.key} value={c.key}>{c.name || "(no name)"} — {TEAM_LABELS[c.team]}</option>)}
                        </select>
                      </label>
                    )}
                    {rule.on && r.key === "asks_person" && <span className="text-[12px] text-ink-soft">Goes to whoever they ask for</span>}
                  </div>
                );
              })}
            </div>
          </Card>

          <Card title="What the AI says, and when your team is available">
            <div className="grid md:grid-cols-2 gap-3">
              <label className="text-[12px] text-ink-soft flex flex-col gap-1">Line before handing over (optional)
                <input value={h.say} onChange={(e) => set({ say: e.target.value })} placeholder="Sure sir, let me connect you to our admissions team." className={field} />
              </label>
              <label className="text-[12px] text-ink-soft flex flex-col gap-1">Team hours (optional)
                <input value={h.hours} onChange={(e) => set({ hours: e.target.value })} placeholder="Mon–Sat, 10am–7pm" className={field} />
              </label>
            </div>
            <div className="text-[11.5px] text-ink-soft mt-2">The AI speaks this in the caller's language. Try it on the Review step → Practice conversation.</div>
          </Card>
        </>
      )}
    </div>
  );
}
