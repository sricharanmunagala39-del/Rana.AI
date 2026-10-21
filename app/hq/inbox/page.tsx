"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";

/** RANA HQ → Inbox: Instagram + Facebook Messenger DMs and comments, keyword auto-replies, AI replies, leads into the CRM. */
const field = "mt-1 w-full border border-line rounded-lg px-3 py-2 text-[13px] font-normal bg-paper";
const btn = "border border-line rounded-lg px-3 py-2 text-[13px] font-semibold bg-raised hover:border-signal/60 disabled:opacity-50";
const primary = "bg-signal text-on-accent rounded-lg px-4 py-2 text-[13px] font-semibold disabled:opacity-50";
const when = (d: string | null) => (d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "");
const ago = (d: string | null) => { if (!d) return ""; const s = (Date.now() - Date.parse(d)) / 1000; return s < 3600 ? `${Math.max(1, Math.round(s / 60))}m` : s < 86400 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`; };
const PLAT: Record<string, [string, string]> = { instagram: ["📸", "Instagram"], messenger: ["💭", "Messenger"], facebook: ["📘", "Facebook"] };
const MODE: Record<string, [string, string]> = { agent: ["Auto", "text-signal border-signal/50"], human: ["Team", "text-hot border-hot/50"], closed: ["Closed", "text-ink-soft border-line"] };
const BY: Record<string, string> = { user: "", agent: "AI", rule: "Auto-reply", human: "Team", private_reply: "Comment → DM", page: "From the app" };
const who = (t: any) => (t.username ? `@${t.username}` : t.name || `${PLAT[t.platform]?.[1] || ""} user`);

export default function HqInboxPage() {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"chats" | "comments" | "rules" | "setup">("chats");
  const [filter, setFilter] = useState("all");
  const [sel, setSel] = useState<string | null>(null);
  const [conv, setConv] = useState<any>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");

  const load = () => fetch(`/api/hq/inbox?filter=${filter}`, { cache: "no-store" }).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setD(j); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); const iv = setInterval(load, 20000); return () => clearInterval(iv); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = new URLSearchParams(window.location.search).get("t"); if (t) setSel(t); }, []);
  const openConv = (id: string) => fetch(`/api/hq/inbox/${id}`, { cache: "no-store" }).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setConv(j); }).catch((e) => setErr(e.message));
  useEffect(() => { if (sel) openConv(sel); else setConv(null); }, [sel]);
  useEffect(() => { if (!sel) return; const iv = setInterval(() => openConv(sel), 15000); return () => clearInterval(iv); }, [sel]);

  async function call(url: string, method: string, body?: any) {
    setBusy(true); setErr("");
    try { const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); const j = await r.json(); if (!r.ok) throw new Error(j.error); return j; }
    catch (e: any) { setErr(e.message); return null; } finally { setBusy(false); }
  }
  async function send() { if (!sel || !text.trim()) return; if (await call(`/api/hq/inbox/${sel}`, "POST", { text })) { setText(""); openConv(sel); load(); } }
  async function setMode(mode: string) { if (sel && (await call(`/api/hq/inbox/${sel}`, "PATCH", { mode, needsHuman: false }))) { openConv(sel); load(); } }

  const threads = useMemo(() => { const t = q.trim().toLowerCase(); return (d?.threads || []).filter((x: any) => !t || [x.username, x.name, x.last_text, x.lead?.phone, x.lead?.business].some((v) => String(v || "").toLowerCase().includes(t))); }, [d, q]);
  const cfg = d?.config;
  const connected = cfg?.pageToken && cfg?.appSecret && cfg?.verifyToken;

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar active="hq-inbox" />
      <div className="flex-1 p-6 md:p-8 min-w-0">
        <div className="w-full max-w-[1400px] flex flex-col gap-5">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-signal"><Link href="/hq">RANA HQ</Link> · Inbox</div>
              <div className="text-[22px] font-display font-semibold">Instagram &amp; Facebook inbox</div>
              <div className="text-[13px] text-ink-soft mt-0.5">DMs and comments in one place. Keyword auto-replies and AI answer first; leads go straight into the Sales CRM.</div>
            </div>
            {d && (
              <div className="flex flex-wrap items-center gap-2 text-[12.5px]" data-testid="inbox-status">
                <span className={`rounded-full border px-2.5 py-1 font-semibold ${connected ? "border-signal/50 text-signal" : "border-hot/50 text-hot"}`}>{connected ? "● Connected to Meta" : "○ Not connected yet"}</span>
                <span className={`rounded-full border px-2.5 py-1 font-semibold ${d.settings.autoReply ? "border-signal/50 text-signal" : "border-line text-ink-soft"}`}>Auto-replies {d.settings.autoReply ? "ON" : "OFF"}</span>
              </div>
            )}
          </div>
          {err && <div className="text-[13px] text-miss" data-testid="inbox-error">{err} <button onClick={() => setErr("")} className="ml-2 opacity-70">×</button></div>}
          {d && !connected && tab !== "setup" && (
            <div className="border border-hot/50 bg-hot-tint rounded-xl px-4 py-3 text-[13px] flex flex-wrap items-center justify-between gap-2">
              <span>Instagram and Facebook aren&apos;t connected yet, so nothing arrives here. It takes about 15 minutes in the Meta app.</span>
              <button onClick={() => setTab("setup")} className={primary}>See the setup steps</button>
            </div>
          )}

          <div className="flex flex-wrap rounded-lg border border-line overflow-hidden text-[12.5px] font-semibold self-start max-w-full">
            {([["chats", `Conversations${d?.attention ? ` (${d.attention})` : ""}`], ["comments", "Comments"], ["rules", "Auto-reply rules"], ["setup", "Setup"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className={`px-3 py-2 ${tab === k ? "bg-ink text-paper" : "bg-raised"}`} data-testid={`inbox-tab-${k}`}>{l}</button>
            ))}
          </div>

          {!d ? <div className="text-[13px] text-ink-soft">Loading…</div> : tab === "chats" ? (
            <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)] min-h-[560px]">
              <div className="border border-line rounded-xl bg-raised flex flex-col min-w-0 overflow-hidden" data-testid="inbox-threads">
                <div className="p-3 flex flex-col gap-2 border-b border-line">
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, message, phone…" className="border border-line rounded-lg px-3 py-2 text-[13px] bg-paper" />
                  <div className="flex flex-wrap gap-1.5">
                    {[["all", "All"], ["human", "Needs a person"], ["instagram", "Instagram"], ["messenger", "Messenger"]].map(([k, l]) => (
                      <button key={k} onClick={() => setFilter(k)} className={`rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold ${filter === k ? "bg-ink text-paper border-ink" : "border-line text-ink-soft"}`}>{l}</button>
                    ))}
                  </div>
                </div>
                <div className="overflow-y-auto max-h-[640px]">
                  {threads.map((t: any) => (
                    <button key={t.id} onClick={() => setSel(t.id)} className={`w-full text-left px-3 py-2.5 border-b border-line flex gap-2.5 ${sel === t.id ? "bg-signal/10" : "hover:bg-paper"}`} data-testid="inbox-thread">
                      <span className="text-[16px] leading-none mt-0.5">{PLAT[t.platform]?.[0]}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5"><span className="text-[13px] font-semibold truncate">{who(t)}</span>{t.crm_deal_id && <span className="text-[10px] font-semibold text-signal border border-signal/40 rounded px-1">CRM</span>}<span className="ml-auto text-[11px] text-ink-soft shrink-0">{ago(t.last_message_at)}</span></span>
                        <span className="block text-[12px] text-ink-soft truncate">{t.last_text || "—"}</span>
                        <span className="flex gap-1.5 mt-0.5">
                          <span className={`text-[10.5px] border rounded-full px-1.5 font-semibold ${MODE[t.mode]?.[1]}`}>{MODE[t.mode]?.[0]}</span>
                          {t.needs_human && <span className="text-[10.5px] rounded-full px-1.5 font-semibold bg-hot text-white">needs a person</span>}
                          {t.unread > 0 && <span className="text-[10.5px] rounded-full px-1.5 font-semibold bg-miss text-white">{t.unread} new</span>}
                        </span>
                      </span>
                    </button>
                  ))}
                  {!threads.length && <div className="p-4 text-[12.5px] text-ink-soft">No conversations yet. Once Meta is connected, every Instagram and Messenger DM lands here.</div>}
                </div>
              </div>
              <div className="border border-line rounded-xl bg-raised flex flex-col min-w-0" data-testid="inbox-conv">
                {!conv ? <div className="p-6 text-[13px] text-ink-soft">Pick a conversation.</div> : (
                  <>
                    <div className="p-4 border-b border-line flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[15px] font-semibold">{PLAT[conv.thread.platform]?.[0]} {who(conv.thread)}</div>
                        <div className="text-[12px] text-ink-soft">
                          {[conv.thread.name && conv.thread.username ? conv.thread.name : null, conv.thread.lead?.business, conv.thread.lead?.phone, conv.thread.lead?.email, conv.thread.lead?.city].filter(Boolean).join(" · ") || "No details yet"}
                        </div>
                        {conv.deal ? <Link href={`/hq/crm?deal=${conv.deal.id}`} className="text-[12px] text-signal font-semibold">◆ In the CRM: {conv.deal.business} ({conv.deal.stage})</Link>
                          : <AddToCrm thread={conv.thread} busy={busy} onAdd={async (b: any) => { if (await call(`/api/hq/inbox/${conv.thread.id}`, "PATCH", { createLead: true, ...b })) { openConv(conv.thread.id); load(); } }} />}
                      </div>
                      <div className="flex rounded-lg border border-line overflow-hidden text-[12px] font-semibold" data-testid="inbox-mode">
                        {(["agent", "human", "closed"] as const).map((m) => <button key={m} disabled={busy} onClick={() => setMode(m)} className={`px-2.5 py-1.5 ${conv.thread.mode === m ? "bg-ink text-paper" : "bg-raised"}`} title={m === "agent" ? "Auto-replies and AI answer" : m === "human" ? "Only the team replies" : "No replies"}>{m === "agent" ? "Auto" : m === "human" ? "Team" : "Close"}</button>)}
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2 max-h-[520px]">
                      {conv.messages.map((m: any) => (
                        <div key={m.id} className={`max-w-[80%] rounded-2xl px-3 py-2 text-[13px] ${m.direction === "in" ? "self-start bg-paper border border-line" : "self-end bg-signal/15 border border-signal/30"}`} data-testid="inbox-msg">
                          <div className="whitespace-pre-wrap break-words">{m.text || (m.attachments ? "📎 attachment" : "")}</div>
                          <div className="text-[10.5px] text-ink-soft mt-0.5">{when(m.created_at)}{BY[m.sent_by] ? ` · ${BY[m.sent_by]}` : ""}{m.status === "failed" ? <span className="text-miss"> · not sent: {m.error}</span> : null}</div>
                        </div>
                      ))}
                    </div>
                    <div className="p-3 border-t border-line flex flex-col gap-2">
                      {!conv.canReply && <div className="text-[12px] text-ink-soft">{d.config.pageToken ? "Meta allows replies only within 24 hours of their last message. You can reply when they message again." : "Connect Meta (Setup tab) to reply from here."}</div>}
                      <div className="flex gap-2">
                        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} disabled={!conv.canReply} className={`${field} mt-0`} placeholder={conv.canReply ? "Type a reply… (the AI pauses in this chat once you reply)" : ""} data-testid="inbox-reply" />
                        <button onClick={send} disabled={busy || !conv.canReply || !text.trim()} className={primary} data-testid="inbox-send">Send</button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : tab === "comments" ? (
            <div className="border border-line rounded-xl bg-raised overflow-x-auto" data-testid="inbox-comments">
              <table className="w-full text-[13px] min-w-[760px]">
                <thead><tr className="text-left text-[11px] uppercase tracking-wide text-ink-soft border-b border-line"><th className="px-4 py-2">Comment</th><th className="px-3 py-2">From</th><th className="px-3 py-2">Auto DM</th><th className="px-3 py-2">Public reply</th><th className="px-3 py-2">When</th></tr></thead>
                <tbody>
                  {d.comments.map((c: any) => (
                    <tr key={c.id} className="border-b border-line last:border-0 align-top">
                      <td className="px-4 py-2.5">{PLAT[c.platform]?.[0]} {c.text}</td>
                      <td className="px-3 py-2.5">{c.from_name || c.from_id}</td>
                      <td className={`px-3 py-2.5 ${c.private_reply_status === "failed" ? "text-miss" : c.private_reply_status === "sent" ? "text-signal" : "text-ink-soft"}`} title={c.private_reply_error || ""}>{c.private_reply_status || (c.rule_id ? "—" : "no rule matched")}</td>
                      <td className="px-3 py-2.5 text-ink-soft">{c.public_reply_status || "—"}</td>
                      <td className="px-3 py-2.5 text-ink-soft">{when(c.created_at)}</td>
                    </tr>
                  ))}
                  {!d.comments.length && <tr><td colSpan={5} className="px-4 py-6 text-ink-soft">No comments yet. Comments on RANA AI&apos;s Instagram and Facebook posts show here, with what the auto-reply did.</td></tr>}
                </tbody>
              </table>
            </div>
          ) : tab === "rules" ? (
            <Rules settings={d.settings} onSaved={load} />
          ) : (
            <Setup d={d} onSaved={load} />
          )}
        </div>
      </div>
    </div>
  );
}

function AddToCrm({ thread, busy, onAdd }: any) {
  const [open, setOpen] = useState(false);
  const [b, setB] = useState({ business: thread.lead?.business || thread.name || "", phone: thread.lead?.phone || "" });
  if (!open) return <button onClick={() => setOpen(true)} className="text-[12px] text-signal font-semibold" data-testid="inbox-add-crm">+ Add to Sales CRM</button>;
  return (
    <div className="flex flex-wrap gap-2 mt-1 items-end">
      <input value={b.business} onChange={(e) => setB({ ...b, business: e.target.value })} placeholder="Business name" className="border border-line rounded-lg px-2.5 py-1.5 text-[12.5px] bg-paper" />
      <input value={b.phone} onChange={(e) => setB({ ...b, phone: e.target.value })} placeholder="Phone (optional)" inputMode="tel" className="border border-line rounded-lg px-2.5 py-1.5 text-[12.5px] bg-paper w-[150px]" />
      <button disabled={busy || !b.business.trim()} onClick={() => onAdd(b)} className="bg-signal text-on-accent rounded-lg px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-50">Add</button>
      <button onClick={() => setOpen(false)} className="text-[12px] text-ink-soft">Cancel</button>
    </div>
  );
}

const EMPTY = { name: "", trigger: "dm_keyword", keywords: "", match: "contains", platforms: ["instagram", "messenger"], postIds: "", reply: "", publicReply: "", createLead: false, handoff: false, priority: 50 };
function Rules({ settings, onSaved }: any) {
  const [rules, setRules] = useState<any[] | null>(null);
  const [edit, setEdit] = useState<any>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => fetch("/api/hq/inbox/rules", { cache: "no-store" }).then((r) => r.json()).then((j) => setRules(j.rules || [])).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  async function req(method: string, body?: any, url = "/api/hq/inbox/rules") {
    setBusy(true); setErr("");
    try { const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); const j = await r.json(); if (!r.ok) throw new Error(j.error); return j; }
    catch (e: any) { setErr(e.message); return null; } finally { setBusy(false); }
  }
  async function save() {
    const body = { ...edit, keywords: String(edit.keywords || ""), postIds: String(edit.postIds || "") };
    if (await req(edit.id ? "PATCH" : "POST", body)) { setEdit(null); load(); }
  }
  const T: Record<string, string> = { dm_keyword: "DM contains a keyword", comment_keyword: "Comment contains a keyword → DM them", welcome: "First message from someone new" };
  return (
    <div className="flex flex-col gap-4" data-testid="inbox-rules">
      <div className="border border-line rounded-xl bg-raised p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-[13px]">
          <b>Auto-replies are {settings.autoReply ? "ON" : "OFF"}.</b> <span className="text-ink-soft">Rules answer first; when no rule matches, the AI answers{settings.aiReplies ? "" : " (AI is off)"}. Max {settings.maxPerDay} automatic replies per chat per day.</span>
        </div>
        <div className="flex gap-2">
          <button disabled={busy} onClick={async () => { if (await req("PUT", { aiReplies: !settings.aiReplies }, "/api/hq/inbox/settings")) onSaved(); }} className={btn}>{settings.aiReplies ? "Turn AI replies off" : "Turn AI replies on"}</button>
          <button disabled={busy} onClick={async () => { if (await req("PUT", { autoReply: !settings.autoReply }, "/api/hq/inbox/settings")) onSaved(); }} className={settings.autoReply ? btn : primary} data-testid="inbox-autoreply-toggle">{settings.autoReply ? "Switch auto-replies OFF" : "Switch auto-replies ON"}</button>
        </div>
      </div>
      {err && <div className="text-[12.5px] text-miss">{err}</div>}
      <div className="flex justify-end"><button onClick={() => setEdit({ ...EMPTY })} className={primary} data-testid="inbox-rule-add">+ New rule</button></div>
      {edit && (
        <div className="border border-signal/50 rounded-xl bg-raised p-4 flex flex-col gap-3" data-testid="inbox-rule-form">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-[12px] font-semibold">Name<input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className={field} placeholder="e.g. Comment DEMO → DM" /></label>
            <label className="text-[12px] font-semibold">When<select value={edit.trigger} onChange={(e) => setEdit({ ...edit, trigger: e.target.value })} className={field}>{Object.entries(T).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            {edit.trigger !== "welcome" && <label className="text-[12px] font-semibold">Keywords <span className="font-normal text-ink-soft">(comma-separated, any language)</span><input value={edit.keywords} onChange={(e) => setEdit({ ...edit, keywords: e.target.value })} className={field} placeholder="demo, price, details" /></label>}
            {edit.trigger !== "welcome" && <label className="text-[12px] font-semibold">Match<select value={edit.match} onChange={(e) => setEdit({ ...edit, match: e.target.value })} className={field}><option value="contains">Message contains the word</option><option value="exact">Message is exactly the word</option></select></label>}
            {edit.trigger === "comment_keyword" && <label className="text-[12px] font-semibold md:col-span-2">Only on these posts <span className="font-normal text-ink-soft">(post / media ids, comma-separated; empty = all posts)</span><input value={edit.postIds} onChange={(e) => setEdit({ ...edit, postIds: e.target.value })} className={field} /></label>}
          </div>
          <label className="text-[12px] font-semibold">{edit.trigger === "comment_keyword" ? "DM sent to the commenter" : "Reply"}<textarea value={edit.reply} onChange={(e) => setEdit({ ...edit, reply: e.target.value })} rows={3} className={field} /></label>
          {edit.trigger === "comment_keyword" && <label className="text-[12px] font-semibold">Public reply under the comment <span className="font-normal text-ink-soft">(optional, e.g. &quot;Sent you a DM 📩&quot;)</span><input value={edit.publicReply || ""} onChange={(e) => setEdit({ ...edit, publicReply: e.target.value })} className={field} /></label>}
          <div className="flex flex-wrap gap-4 text-[12.5px]">
            {["instagram", "messenger", "facebook"].map((p) => <label key={p} className="flex items-center gap-1.5"><input type="checkbox" checked={(edit.platforms || []).includes(p)} onChange={(e) => setEdit({ ...edit, platforms: e.target.checked ? [...(edit.platforms || []), p] : (edit.platforms || []).filter((x: string) => x !== p) })} />{PLAT[p][1]}{p === "facebook" ? " comments" : ""}</label>)}
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!edit.createLead} onChange={(e) => setEdit({ ...edit, createLead: e.target.checked })} />Add to Sales CRM</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!edit.handoff} onChange={(e) => setEdit({ ...edit, handoff: e.target.checked })} />Then hand the chat to the team</label>
            <label className="flex items-center gap-1.5">Priority<input type="number" value={edit.priority} onChange={(e) => setEdit({ ...edit, priority: e.target.value })} className="border border-line rounded px-2 py-1 w-[70px] bg-paper" /></label>
          </div>
          <div className="flex justify-end gap-2"><button onClick={() => setEdit(null)} className={btn}>Cancel</button><button onClick={save} disabled={busy} className={primary} data-testid="inbox-rule-save">Save rule</button></div>
        </div>
      )}
      {!rules ? <div className="text-[13px] text-ink-soft">Loading…</div> : (
        <div className="grid gap-3 md:grid-cols-2">
          {rules.map((r) => (
            <div key={r.id} className={`border rounded-xl bg-raised p-4 flex flex-col gap-2 ${r.enabled ? "border-line" : "border-line opacity-60"}`} data-testid="inbox-rule">
              <div className="flex items-start justify-between gap-2">
                <div><div className="text-[13.5px] font-semibold">{r.name}</div><div className="text-[11.5px] text-ink-soft">{T[r.trigger]}{r.keywords?.length ? `: ${r.keywords.join(", ")}` : ""} · used {r.hits}×</div></div>
                <label className="flex items-center gap-1.5 text-[12px]"><input type="checkbox" checked={r.enabled} onChange={async (e) => { if (await req("PATCH", { id: r.id, enabled: e.target.checked })) load(); }} />On</label>
              </div>
              <div className="text-[12.5px] whitespace-pre-wrap bg-paper border border-line rounded-lg p-2">{r.reply}</div>
              <div className="flex gap-3 text-[12px]">
                <button onClick={() => setEdit({ id: r.id, name: r.name, trigger: r.trigger, keywords: (r.keywords || []).join(", "), match: r.match, platforms: r.platforms, postIds: (r.post_ids || []).join(", "), reply: r.reply, publicReply: r.public_reply || "", createLead: r.create_lead, handoff: r.handoff, priority: r.priority })} className="text-signal font-semibold">Edit</button>
                <button onClick={async () => { if (window.confirm?.(`Delete the rule "${r.name}"?`) !== false && (await req("DELETE", undefined, `/api/hq/inbox/rules?id=${r.id}`))) load(); }} className="text-miss font-semibold">Delete</button>
              </div>
            </div>
          ))}
          {!rules.length && <div className="text-[12.5px] text-ink-soft">No rules yet.</div>}
        </div>
      )}
    </div>
  );
}

function Setup({ d, onSaved }: any) {
  const [check, setCheck] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [emails, setEmails] = useState((d.settings.alertEmails || []).join(", "));
  const [msg, setMsg] = useState("");
  const c = d.config;
  const Item = ({ ok, label }: any) => <div className="flex items-center gap-2 text-[12.5px]"><span className={ok ? "text-signal" : "text-miss"}>{ok ? "✓" : "✗"}</span><code className="font-mono">{label}</code></div>;
  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="inbox-setup">
      <div className="border border-line rounded-xl bg-raised p-4 flex flex-col gap-3">
        <div className="text-[14px] font-semibold">1 · Settings in Vercel</div>
        <div className="text-[12.5px] text-ink-soft">Project → Settings → Environment Variables. Add these, then redeploy.</div>
        <Item ok={c.appSecret} label="META_APP_SECRET" /><Item ok={c.verifyToken} label="META_VERIFY_TOKEN" /><Item ok={c.pageToken} label="META_PAGE_ACCESS_TOKEN" /><Item ok={c.pageId} label="META_PAGE_ID" />
        <div className="flex items-center gap-2 text-[12.5px]"><span className={c.appId ? "text-signal" : "text-hot"}>{c.appId ? "✓" : "!"}</span><code className="font-mono">META_APP_ID</code><span className="text-ink-soft">(recommended: lets a reply typed in the Instagram/Facebook app pause the bot)</span></div>
        <div className="flex items-center gap-2 text-[12.5px]"><span className={c.igUserId ? "text-signal" : "text-ink-soft"}>{c.igUserId ? "✓" : "○"}</span><code className="font-mono">META_IG_USER_ID</code><span className="text-ink-soft">(optional; shown by Check connection)</span></div>
        <div className="text-[14px] font-semibold mt-2">2 · Webhook in the Meta app</div>
        <div className="text-[12.5px] text-ink-soft">developers.facebook.com → your app → Webhooks. Use this address and the same verify token. Subscribe <b>Instagram</b>: messages, comments · <b>Page</b>: messages, feed.</div>
        <div className="flex gap-2"><input readOnly value={d.webhookUrl} className={`${field} mt-0 font-mono text-[11.5px]`} /><button onClick={() => { navigator.clipboard?.writeText(d.webhookUrl).then(() => setCopied(true), () => {}); }} className={btn}>{copied ? "Copied" : "Copy"}</button></div>
        <div className="text-[14px] font-semibold mt-2">3 · Check</div>
        <button disabled={busy} onClick={async () => { setBusy(true); try { const r = await fetch("/api/hq/inbox/settings", { cache: "no-store" }); setCheck(await r.json()); } finally { setBusy(false); } }} className={`${btn} self-start`} data-testid="inbox-check">Check connection</button>
        {check && (check.error ? <div className="text-[12.5px] text-miss">{check.error}</div> : <div className="text-[12.5px]">Page: <b>{check.page?.name}</b> ({check.page?.id}) · Instagram: {check.instagram ? <b>@{check.instagram.username} ({check.instagram.id})</b> : <span className="text-miss">not linked to this Page</span>}</div>)}
      </div>
      <div className="border border-line rounded-xl bg-raised p-4 flex flex-col gap-3">
        <div className="text-[14px] font-semibold">Who gets alerts</div>
        <div className="text-[12.5px] text-ink-soft">Hot leads and chats that need a person are emailed here. Empty = the founders&apos; emails.</div>
        <input value={emails} onChange={(e) => setEmails(e.target.value)} className={field} placeholder="sricharan.munagala@ranaai.in, syed.razvi@ranaai.in" />
        <button disabled={busy} onClick={async () => { setBusy(true); setMsg(""); try { const r = await fetch("/api/hq/inbox/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ alertEmails: emails }) }); const j = await r.json(); setMsg(r.ok ? "Saved." : j.error); if (r.ok) onSaved(); } finally { setBusy(false); } }} className={`${primary} self-start`}>Save</button>
        {msg && <div className="text-[12.5px]">{msg}</div>}
        <div className="text-[14px] font-semibold mt-2">Meta&apos;s rules (same for every tool)</div>
        <ul className="text-[12.5px] text-ink-soft list-disc pl-5 flex flex-col gap-1">
          <li>Replies only within 24 hours of the person&apos;s last message.</li>
          <li>One private DM per comment, within 7 days of the comment.</li>
          <li>No cold DMs to people who never messaged.</li>
          <li>Until Meta approves the app (App Review → Advanced Access), only people with a role on the app get replies.</li>
        </ul>
      </div>
    </div>
  );
}
