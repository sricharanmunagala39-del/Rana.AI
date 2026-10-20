"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import OutboundShell, { EnrollmentPill, Pill, Notice, primary, field, getJson, when } from "@/components/OutboundShell";

/** RANA HQ → Outbound → one lead: details, the personal first email, enrollments, messages and the activity timeline. */
const FIELDS: [string, string][] = [
  ["company", "Company"], ["email", "Email"], ["phone", "Phone"], ["wa_number", "WhatsApp"], ["city", "City"], ["country", "Country"],
  ["industry", "Industry"], ["source", "Source"], ["status", "Status"], ["email_status", "Email status"],
];

export default function LeadPage({ params }: { params: { id: string } }) {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => getJson(`/api/hq/outbound/leads/${params.id}`).then((j) => { setD(j); setSubject(j.lead.p_subject || ""); setBody(j.lead.p_body || ""); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [params.id]);

  async function save() {
    setBusy(true); setErr(""); setMsg("");
    try {
      const r = await fetch(`/api/hq/outbound/leads/${params.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pSubject: subject, pBody: body }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error);
      setMsg("Personal first email saved."); load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  const l = d?.lead;
  const dirty = l && (subject !== (l.p_subject || "") || body !== (l.p_body || ""));
  const firstSent = d?.outbox?.some((o: any) => o.step_no === 1 && o.status === "sent");
  // One timeline: activities, messages that went out, and replies that came in.
  const timeline = d ? [
    ...d.activities.map((a: any) => ({ at: a.created_at, icon: "•", text: a.text, tag: a.kind })),
    ...d.outbox.map((o: any) => ({ at: o.created_at, icon: o.channel === "whatsapp" ? "💬" : o.channel === "owner" ? "🔔" : "✉️", text: `${o.step_no === 0 ? "WhatsApp intro" : o.step_no ? `Step ${o.step_no}` : o.channel === "owner" ? "Owner alert" : "Message"}${o.subject ? `: ${o.subject}` : ""}`, tag: o.status + (o.event ? ` · ${o.event}` : ""), bad: o.status === "failed" || o.status === "undelivered" || o.event === "failed" || o.event === "bounced" })),
    ...d.replies.map((r: any) => ({ at: r.created_at, icon: "↩", text: `Replied${r.summary ? `: ${r.summary}` : r.body ? `: ${String(r.body).slice(0, 140)}` : ""}`, tag: [r.classification, r.status].filter(Boolean).join(" · ") })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)) : [];

  return (
    <OutboundShell title={l ? l.name || "Unnamed lead" : "Lead"} sub={l ? [l.company, l.city].filter(Boolean).join(" · ") : undefined}
      actions={l?.crm_deal_id && <Link href={`/hq/crm?deal=${l.crm_deal_id}`} className="border border-line rounded-lg px-3 py-2 text-[13px] font-semibold bg-raised hover:border-signal/60" data-testid="lead-crm-link">◆ Open CRM deal</Link>}>
      <Notice err={err} msg={msg} onClear={() => { setErr(""); setMsg(""); }} />
      {!d ? <div className="text-[13px] text-ink-soft">{err ? "" : "Loading…"}</div> : (
        <div className="grid lg:grid-cols-[1fr_380px] gap-4 items-start">
          <div className="flex flex-col gap-4 min-w-0">
            <div className="border border-line rounded-xl bg-raised p-4" data-testid="lead-fields">
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
                {FIELDS.map(([k, label]) => (
                  <div key={k} className="min-w-0"><div className="text-[11px] text-ink-soft">{label}</div><div className="truncate">{k === "email_status" && l.unsubscribed ? <Pill tone="bg-miss-tint text-miss">Unsubscribed</Pill> : l[k] || "—"}</div></div>
                ))}
              </div>
              {(l.why_rana || l.notes || l.wa_line) && (
                <div className="mt-3 pt-3 border-t border-line flex flex-col gap-2 text-[13px]">
                  {l.why_rana && <div><div className="text-[11px] text-ink-soft">Why RANA</div><div className="whitespace-pre-wrap">{l.why_rana}</div></div>}
                  {l.wa_line && <div><div className="text-[11px] text-ink-soft">WhatsApp opener</div><div className="whitespace-pre-wrap">{l.wa_line}</div></div>}
                  {l.notes && <div><div className="text-[11px] text-ink-soft">Notes</div><div className="whitespace-pre-wrap">{l.notes}</div></div>}
                </div>
              )}
              {l.wa_number && <Link href={`/hq/outbound/whatsapp?n=${encodeURIComponent(l.wa_number)}`} className="inline-block mt-3 text-[12.5px] text-signal font-semibold">Open WhatsApp chat →</Link>}
            </div>

            <div className="border border-line rounded-xl bg-raised p-4 flex flex-col gap-2" data-testid="lead-first-email">
              <div className="text-[13px] font-semibold">Personal first email</div>
              <div className="text-[12px] text-ink-soft">{firstSent ? "Already sent — edits only matter if the sequence is restarted." : "Sent as step 1 in place of the campaign's template."}</div>
              <label className="text-[12px] font-semibold">Subject<input value={subject} onChange={(e) => setSubject(e.target.value)} readOnly={!d.canAct} className={field} data-testid="lead-p-subject" /></label>
              <label className="text-[12px] font-semibold">Body<textarea value={body} onChange={(e) => setBody(e.target.value)} readOnly={!d.canAct} rows={10} className={`${field} resize-y`} data-testid="lead-p-body" /></label>
              {d.canAct && <div className="flex justify-end"><button onClick={save} disabled={busy || !dirty} className={primary} data-testid="lead-save">{busy ? "Saving…" : "Save"}</button></div>}
            </div>
          </div>

          <div className="flex flex-col gap-4 min-w-0">
            <div className="border border-line rounded-xl bg-raised p-4 flex flex-col gap-2">
              <div className="text-[13px] font-semibold">Sequence</div>
              {!d.enrollments.length ? <div className="text-[12.5px] text-ink-soft">Not enrolled.</div> : d.enrollments.map((e: any) => (
                <div key={e.id} className="flex items-center gap-2 text-[12.5px]">
                  <EnrollmentPill status={e.status} />
                  <span className="truncate">{e.campaign || "Campaign"}</span>
                  <span className="ml-auto text-ink-soft whitespace-nowrap">{e.current_step != null ? `step ${e.current_step}` : ""}{e.status === "active" && e.next_send_at ? ` · next ${when(e.next_send_at)}` : ""}</span>
                </div>
              ))}
            </div>
            <div className="border border-line rounded-xl bg-raised p-4 flex flex-col gap-2" data-testid="lead-timeline">
              <div className="text-[13px] font-semibold">Activity</div>
              {!timeline.length ? <div className="text-[12.5px] text-ink-soft">Nothing yet.</div> : (
                <ol className="flex flex-col gap-2.5">
                  {timeline.slice(0, 200).map((x, i) => (
                    <li key={i} className="flex gap-2 text-[12.5px]">
                      <span className="w-4 text-center shrink-0">{x.icon}</span>
                      <div className="min-w-0">
                        <div className="break-words">{x.text}</div>
                        <div className={`text-[11px] ${(x as any).bad ? "text-miss" : "text-ink-soft"}`}>{when(x.at)}{x.tag ? ` · ${x.tag}` : ""}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      )}
    </OutboundShell>
  );
}
