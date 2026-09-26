"use client";
import { useEffect, useState } from "react";
import StatusPill from "@/components/StatusPill";
import type { CallRow, LeadStatus } from "@/lib/calls";
import { LEAD_LABEL, LEAD_TONE, LEAD_ORDER, fmtDuration, fmtPhone, fmtClock, fmtDate } from "@/lib/format";

export default function CallDrawer({ call, onClose, onUpdated }: { call: CallRow | null; onClose: () => void; onUpdated: (c: CallRow) => void }) {
  const [notes, setNotes] = useState(call?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => { setNotes(call?.notes ?? ""); }, [call?.id]);
  if (!call) return null;

  async function patch(body: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch(`/api/calls/${call!.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (res.ok) onUpdated(data.call);
    } finally { setSaving(false); }
  }

  function copyCallId() {
    if (!call?.interaction_id) return;
    navigator.clipboard.writeText(call.interaction_id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => {});
  }

  const vars = Object.entries(call.agent_variables || {}).filter(([, v]) => typeof v !== "object");

  return (
    <div className="fixed inset-0 z-40 flex" onClick={onClose}>
      <div className="flex-1 bg-black/60" />
      <aside className="w-[460px] max-w-full bg-raised border-l border-line h-full overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b border-line flex items-start justify-between gap-3">
          <div>
            <div className="font-display text-[19px] font-semibold">{call.caller_name || "Unknown caller"}</div>
            <div className="text-[13px] text-ink-soft">{fmtPhone(call.caller_phone)} · {call.direction === "inbound" ? "Inbound" : "Outbound"} · {fmtDate(call.created_at)} {fmtClock(call.created_at)}</div>
            {call.interaction_id && (
              <button onClick={copyCallId}
                className="mt-1.5 flex items-center gap-1.5 text-[11px] font-mono text-ink-soft hover:text-ink hover:border-ink border border-line rounded-md px-2 py-1">
                <span className="truncate max-w-[260px]">{call.interaction_id}</span>
                <span className="text-signal font-sans font-semibold shrink-0">{copied ? "Copied ✓" : "Copy call ID"}</span>
              </button>
            )}
          </div>
          <button onClick={onClose} className="text-ink-soft hover:text-ink text-lg leading-none">×</button>
        </div>

        <div className="p-6 flex flex-col gap-6">
          <div className="grid grid-cols-3 gap-3 text-[12.5px]">
            <div className="border border-line rounded-lg p-3"><div className="text-ink-soft">Duration</div><div className="font-semibold text-[15px]">{fmtDuration(call.duration_seconds)}</div></div>
            <div className="border border-line rounded-lg p-3"><div className="text-ink-soft">Connected</div><div className="font-semibold text-[15px] capitalize">{call.connectivity_status?.replace("_", " ") || (call.duration_seconds > 0 ? "Yes" : "No")}</div></div>
            <div className="border border-line rounded-lg p-3"><div className="text-ink-soft">Lead</div><div className="mt-1"><StatusPill label={LEAD_LABEL[call.lead_status]} tone={LEAD_TONE[call.lead_status]} /></div></div>
          </div>

          <div>
            <div className="text-[12.5px] font-semibold text-ink-soft mb-2">Set lead status</div>
            <div className="flex flex-wrap gap-1.5">
              {LEAD_ORDER.map((s: LeadStatus) => (
                <button key={s} disabled={saving} onClick={() => patch({ lead_status: s })}
                  className={`text-xs font-semibold px-2.5 py-1.5 rounded-md border ${call.lead_status === s ? "bg-ink text-paper border-ink" : "border-line text-ink-soft hover:border-ink"}`}>
                  {LEAD_LABEL[s]}
                </button>
              ))}
            </div>
          </div>

          {call.handoff && (
            <div className="border border-hot/40 rounded-lg px-3 py-2.5 bg-hot-tint" data-testid="handoff-banner">
              <div className="text-[11.5px] font-semibold text-warm uppercase tracking-wide">Needs a person — {call.handoff.label}</div>
              <div className="text-[13px] mt-1 leading-relaxed">“{call.handoff.quote}”</div>
              <div className="text-[12px] text-ink-soft mt-1">{call.handoff.to_name ? `Routed to ${call.handoff.to_name}${call.handoff.to_phone ? ` · ${call.handoff.to_phone}` : ""}` : "Routed to your team"}{call.handoff.emailed ? " · alert emailed" : ""}</div>
            </div>
          )}

          {call.lead_reason && (
            <div className="border border-line rounded-lg px-3 py-2.5 bg-paper">
              <div className="text-[11.5px] font-semibold text-ink-soft uppercase tracking-wide">Why RANA labelled it {LEAD_LABEL[call.lead_status]}</div>
              <div className="text-[13px] mt-1 leading-relaxed">{call.lead_reason}</div>
            </div>
          )}

          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={Boolean(call.follow_up)} disabled={saving} onChange={(e) => patch({ follow_up: e.target.checked })} className="accent-signal" />
            Needs a follow-up call from sales
          </label>

          {call.summary && (
            <div>
              <div className="text-[12.5px] font-semibold text-ink-soft mb-1.5">Summary</div>
              <p className="text-[13.5px] leading-relaxed m-0">{call.summary}</p>
            </div>
          )}

          {vars.length > 0 && (
            <div>
              <div className="text-[12.5px] font-semibold text-ink-soft mb-1.5">Captured details</div>
              <div className="border border-line rounded-lg divide-y divide-line text-[13px]">
                {vars.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 px-3 py-2"><span className="text-ink-soft">{k.replace(/_/g, " ")}</span><span className="font-medium text-right">{String(v)}</span></div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="text-[12.5px] font-semibold text-ink-soft mb-1.5">Recording</div>
            {call.recording_url ? (
              <div className="flex flex-col gap-2">
                <audio controls src={call.recording_url} className="w-full h-9" />
                <a href={call.recording_url} download target="_blank" rel="noreferrer"
                  className="text-[12.5px] font-semibold text-signal self-start">Download recording</a>
              </div>
            ) : (
              <div className="text-[13px] text-ink-soft">
                {call.duration_seconds > 0 ? "Recording not available for this call." : "No recording — the call did not connect."}
              </div>
            )}
          </div>

          <div>
            <div className="text-[12.5px] font-semibold text-ink-soft mb-1.5">Notes for sales team</div>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="e.g. Call back after 6pm, wants EMI options"
              className="w-full border border-line rounded-lg px-3 py-2 text-[13.5px] bg-paper outline-none focus:border-signal" />
            <button disabled={saving || notes === (call.notes ?? "")} onClick={() => patch({ notes })}
              className="mt-2 text-[12.5px] font-semibold px-3 py-1.5 rounded-md bg-signal text-on-accent disabled:opacity-40">Save notes</button>
          </div>

          <div>
            <div className="text-[12.5px] font-semibold text-ink-soft mb-2">Transcript</div>
            {call.transcript?.length ? (
              <div className="flex flex-col gap-2">
                {call.transcript.map((t, i) => (
                  <div key={i} className={`max-w-[88%] rounded-lg px-3 py-2 text-[13px] leading-relaxed ${t.role === "agent" ? "bg-signal-tint self-start" : "bg-paper self-end"}`}>
                    <div className="text-[10.5px] uppercase tracking-wide text-ink-soft mb-0.5">{t.role === "agent" ? "Agent" : "Caller"}</div>
                    {t.indic_text && <div className="mb-0.5">{t.indic_text}</div>}
                    <div className={t.indic_text ? "text-ink-soft" : ""}>{t.text}</div>
                  </div>
                ))}
              </div>
            ) : <div className="text-[13px] text-ink-soft">No transcript — the call did not connect.</div>}
          </div>
        </div>
      </aside>
    </div>
  );
}
