"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import OutboundShell, { Pill, Notice, btn, primary, field, runEngine, getJson, when } from "@/components/OutboundShell";

/** RANA HQ → Outbound → Replies awaiting approval: what the lead wrote, how the AI read it, and its draft answer. */
const CLASS_TONE: Record<string, string> = {
  interested: "bg-signal-tint text-signal", demo: "bg-signal-tint text-signal", question: "bg-violet-tint text-violet",
  not_interested: "bg-sunken text-ink-soft", unsubscribe: "bg-miss-tint text-miss", ooo: "bg-hot-tint text-hot", out_of_office: "bg-hot-tint text-hot",
};

export default function RepliesPage() {
  const [d, setD] = useState<any>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const load = () => getJson("/api/hq/outbound/replies").then((j) => { setD(j); setDrafts(Object.fromEntries(j.replies.map((r: any) => [r.id, r.draft || ""]))); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  async function act(r: any, approve: boolean) {
    if (!approve && !confirm("Dismiss this reply? Nothing will be sent.")) return;
    setBusy(r.id); setErr(""); setMsg("");
    try {
      await runEngine(approve ? { action: "approve_reply", reply_id: r.id, body: drafts[r.id] } : { action: "dismiss_reply", reply_id: r.id });
      setMsg(approve ? `Reply sent to ${r.lead?.name || "the lead"}.` : "Dismissed.");
      setD((x: any) => x && { ...x, replies: x.replies.filter((y: any) => y.id !== r.id) });
    } catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  }

  return (
    <OutboundShell title="Replies awaiting approval" sub="The engine pauses the sequence when someone replies and drafts an answer. Edit it, then approve to send.">
      <Notice err={err} msg={msg} onClear={() => { setErr(""); setMsg(""); }} />
      {!d ? <div className="text-[13px] text-ink-soft">{err ? "" : "Loading…"}</div> : !d.replies.length ? (
        <div className="border border-line rounded-xl bg-raised p-6 text-[13px] text-ink-soft text-center">Nothing waiting. New replies appear here for your approval.</div>
      ) : (
        <div className="flex flex-col gap-3">
          {d.replies.map((r: any) => (
            <div key={r.id} className="border border-line rounded-xl bg-raised p-4 flex flex-col gap-3" data-testid="reply-card">
              <div className="flex items-start gap-2 flex-wrap">
                <div className="min-w-0">
                  {r.lead ? <Link href={`/hq/outbound/leads/${r.lead.id}`} className="text-[14px] font-semibold hover:text-signal">{r.lead.name || "Unnamed lead"}</Link> : <span className="text-[14px] font-semibold">Unknown lead</span>}
                  <div className="text-[11.5px] text-ink-soft">{[r.lead?.company, r.channel === "whatsapp" ? "WhatsApp" : "Email", when(r.created_at)].filter(Boolean).join(" · ")}</div>
                </div>
                <div className="ml-auto flex gap-1">{r.classification && <Pill tone={CLASS_TONE[r.classification] || "bg-sunken text-ink-soft"}>{r.classification.replace(/_/g, " ")}</Pill>}</div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">They wrote</div>
                <div className="mt-1 rounded-lg bg-sunken border border-line px-3 py-2 text-[13px] whitespace-pre-wrap break-words max-h-[220px] overflow-y-auto">{r.body || "—"}</div>
                {r.summary && <div className="mt-1 text-[12px] text-ink-soft">AI summary: {r.summary}</div>}
              </div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Draft answer
                <textarea value={drafts[r.id] ?? ""} onChange={(e) => setDrafts({ ...drafts, [r.id]: e.target.value })} rows={6} readOnly={!d.canAct} className={`${field} normal-case tracking-normal text-[13px] resize-y`} data-testid="reply-draft" />
              </label>
              {d.canAct && (
                <div className="flex gap-2 justify-end">
                  <button onClick={() => act(r, false)} disabled={busy !== null} className={btn} data-testid="reply-dismiss">Dismiss</button>
                  <button onClick={() => act(r, true)} disabled={busy !== null || !(drafts[r.id] || "").trim()} className={primary} data-testid="reply-approve">{busy === r.id ? "Sending…" : "Approve & send"}</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </OutboundShell>
  );
}
