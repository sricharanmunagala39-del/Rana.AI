"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";

const KINDS: { k: string; name: string; icon: string; blurb: string }[] = [
  { k: "slack", name: "Slack", icon: "💬", blurb: "Post hot leads into a Slack channel your sales team watches." },
  { k: "whatsapp", name: "WhatsApp", icon: "🟢", blurb: "Send hot leads to your team's WhatsApp numbers (your WhatsApp Business account)." },
  { k: "email", name: "Email", icon: "✉️", blurb: "Email each lead to up to 10 people." },
  { k: "webhook", name: "Webhook", icon: "🔗", blurb: "Send leads to Zapier, Make, Google Sheets, your CRM — anything with a webhook URL." },
];
const field = "w-full border border-line rounded-lg px-3 py-2 text-[13px] bg-sunken";
const when = (d: string | null) => (d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: true }) : "never");

/** Lead alerts: the client decides where leads go (Slack, WhatsApp, email, webhook), which leads, and what's in them. */
export default function IntegrationsPage() {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  const [form, setForm] = useState<any>(null); // new or editing
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [signing, setSigning] = useState<string | null>(null);
  const [role, setRole] = useState("viewer");

  const load = () => fetch("/api/integrations").then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setD(j); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); fetch("/api/auth/me").then((r) => r.json()).then((j) => setRole(j?.user?.role || "viewer")).catch(() => {}); }, []);
  const canEdit = ["owner", "admin"].includes(role);

  const start = (kind: string) => { setErr(""); setForm({ kind, name: "", rules: { ...d.defaults }, recipients: "", secret: "", phoneNumberId: "", template: "", templateLang: "en" }); };
  const edit = (i: any) => { setErr(""); setForm({ id: i.id, kind: i.kind, name: i.name, rules: i.config.rules, recipients: (i.config.recipients || []).join(", "), secret: "", secretHint: i.secretHint, phoneNumberId: i.config.phoneNumberId || "", template: i.config.template || "", templateLang: i.config.templateLang || "en" }); };
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const setRule = (k: string, v: any) => setForm((f: any) => ({ ...f, rules: { ...f.rules, [k]: v } }));

  async function save() {
    setBusy(true); setErr("");
    try {
      const body = { ...form, recipients: String(form.recipients || "").split(/[,\s;]+/).filter(Boolean) };
      const r = await fetch("/api/integrations", { method: form.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json(); if (!r.ok) { setErr(j.error); return; }
      if (j.signingSecret) setSigning(j.signingSecret);
      setForm(null); load();
    } finally { setBusy(false); }
  }
  async function test(id: string) {
    setMsg((m) => ({ ...m, [id]: "Sending a sample lead…" }));
    const r = await fetch("/api/integrations/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    const j = await r.json().catch(() => ({}));
    setMsg((m) => ({ ...m, [id]: r.ok ? "✓ Sample lead sent — check it arrived." : `✗ ${j.error || "Failed"}` })); load();
  }
  async function enable(i: any) { await fetch("/api/integrations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: i.id, enabled: !i.enabled }) }); load(); }
  async function remove(i: any) { if (!window.confirm(`Remove “${i.name}”? Leads will stop going there.`)) return; await fetch(`/api/integrations?id=${i.id}`, { method: "DELETE" }); load(); }

  const leadLabel = (k: string) => d?.leadChoices.find((x: any) => x.key === k)?.label || k;
  const kindOf = (k: string) => KINDS.find((x) => x.k === k)!;

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar active="alerts" />
      <div className="flex-1 p-6 md:p-10 min-w-0">
        <div className="max-w-[980px] flex flex-col gap-5">
          <div>
            <div className="text-[20px] font-display font-semibold">Lead alerts</div>
            <div className="text-[13px] text-ink-soft mt-0.5">The moment a call ends, send the leads you choose to where your team works. You decide the channel, which leads, which calls and what the message contains.</div>
          </div>
          {err && !form && <div className="text-[13px] text-miss">{err}</div>}
          {signing && (
            <div className="border border-signal/40 bg-signal/10 rounded-xl p-4 text-[13px]" data-testid="signing-secret">
              <b>Webhook signing secret</b> — copy it now; it won&apos;t be shown again. Every request carries <code>X-Rana-Signature: sha256=…</code> (HMAC-SHA256 of the body with this secret).
              <div className="font-mono text-[12.5px] bg-sunken rounded-md px-2 py-1.5 mt-2 break-all select-all">{signing}</div>
              <button onClick={() => setSigning(null)} className="text-[12.5px] font-semibold text-signal mt-2">I&apos;ve saved it</button>
            </div>
          )}

          {!d ? <div className="text-[13px] text-ink-soft">Loading…</div> : (<>
            {d.integrations.length > 0 && (
              <div className="flex flex-col gap-3" data-testid="alert-list">
                {d.integrations.map((i: any) => {
                  const k = kindOf(i.kind);
                  return (
                    <div key={i.id} className={`border border-line rounded-xl bg-raised p-4 flex flex-col gap-2 ${i.enabled ? "" : "opacity-60"}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[18px]">{k.icon}</span>
                        <div className="font-semibold text-[14.5px]">{i.name}</div>
                        <span className="text-[11px] text-ink-soft border border-line rounded-full px-2 py-0.5">{k.name}</span>
                        {!i.enabled && <span className="text-[11px] text-ink-soft">paused</span>}
                        <span className="flex-1" />
                        {canEdit && <>
                          <button onClick={() => test(i.id)} className="text-[12.5px] font-semibold text-signal">Send test</button>
                          <button onClick={() => edit(i)} className="text-[12.5px] font-semibold">Edit</button>
                          <button onClick={() => enable(i)} className="text-[12.5px] text-ink-soft">{i.enabled ? "Pause" : "Resume"}</button>
                          <button onClick={() => remove(i)} className="text-[12.5px] text-miss">Remove</button>
                        </>}
                      </div>
                      <div className="text-[12.5px] text-ink-soft">
                        Sends: <b className="text-ink">{i.config.rules.leads.map(leadLabel).join(", ")}</b> · {i.config.rules.directions.length === 2 ? "incoming + outgoing" : i.config.rules.directions[0] === "outbound" ? "outgoing only" : "incoming only"} · {i.config.rules.campaigns === "all" ? "all campaigns" : `${i.config.rules.campaigns.length} campaign(s)`}
                        {i.config.recipients?.length ? ` · to ${i.config.recipients.join(", ")}` : i.secretHint ? ` · ${i.secretHint}` : ""}
                      </div>
                      <div className="text-[12px] text-ink-soft">
                        {i.sentCount ? `${i.sentCount} sent · last ${when(i.lastSentAt)}` : "Nothing sent yet"}
                        {i.lastError && (!i.lastSentAt || i.lastErrorAt > i.lastSentAt) && <span className="text-miss"> · last error {when(i.lastErrorAt)}: {i.lastError}</span>}
                      </div>
                      {msg[i.id] && <div className={`text-[12.5px] ${msg[i.id].startsWith("✗") ? "text-miss" : "text-signal"}`}>{msg[i.id]}</div>}
                    </div>
                  );
                })}
              </div>
            )}

            {canEdit ? (
              <div>
                <div className="text-[13.5px] font-semibold mb-2">{d.integrations.length ? "Add another channel" : "Where should leads go?"}</div>
                <div className="grid sm:grid-cols-2 gap-2.5">
                  {KINDS.map((k) => (
                    <button key={k.k} onClick={() => start(k.k)} className="text-left border border-line rounded-xl bg-raised p-4 hover:border-signal/50" data-testid={`add-${k.k}`}>
                      <div className="text-[14.5px] font-semibold">{k.icon} {k.name}</div>
                      <div className="text-[12.5px] text-ink-soft mt-1">{k.blurb}</div>
                    </button>
                  ))}
                </div>
              </div>
            ) : <div className="text-[12.5px] text-ink-soft">Only owners and admins can change lead alerts.</div>}

            {d.log.length > 0 && (
              <div className="border border-line rounded-xl bg-raised p-4">
                <div className="text-[13.5px] font-semibold mb-2">Recent deliveries</div>
                {d.log.slice(0, 12).map((l: any, n: number) => {
                  const i = d.integrations.find((x: any) => x.id === l.integration_id);
                  return <div key={n} className="text-[12.5px] py-1 border-t border-line/60 flex gap-3"><span className="text-ink-soft w-[130px] shrink-0">{when(l.created_at)}</span><span className="w-[150px] shrink-0 truncate">{i?.name || "—"}{l.kind === "test" ? " (test)" : ""}</span><span className={l.ok ? "text-signal" : l.ok === false ? "text-miss" : "text-ink-soft"}>{l.ok ? "Delivered" : l.ok === false ? `Failed: ${l.error || ""}` : "Sending…"}</span></div>;
                })}
              </div>
            )}
          </>)}
        </div>
      </div>

      {form && d && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto" onMouseDown={(e) => { if (e.target === e.currentTarget) setForm(null); }}>
          <div className="w-full max-w-[640px] bg-raised rounded-2xl border border-line p-6 my-6 flex flex-col gap-4" role="dialog" aria-modal="true" data-testid="alert-form">
            <div className="text-[18px] font-display font-semibold">{form.id ? "Edit" : "Add"} {kindOf(form.kind).name} alert</div>
            <label className="text-[12px] font-semibold text-ink-soft">Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={`e.g. Sales team ${kindOf(form.kind).name}`} className={`${field} mt-1`} /></label>

            {form.kind === "slack" && (
              <label className="text-[12px] font-semibold text-ink-soft">Slack Incoming Webhook URL
                <input value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} placeholder={form.secretHint ? `Saved (${form.secretHint}) — paste a new one to replace` : "https://hooks.slack.com/services/…"} className={`${field} mt-1 font-mono`} />
                <span className="font-normal block mt-1">In Slack: Apps → <b>Incoming Webhooks</b> → Add to Slack → pick the channel → copy the Webhook URL.</span>
              </label>
            )}
            {form.kind === "email" && (
              <label className="text-[12px] font-semibold text-ink-soft">Send to (up to 10 emails)<input value={form.recipients} onChange={(e) => setForm({ ...form, recipients: e.target.value })} placeholder="sales@yourcompany.com, manager@yourcompany.com" className={`${field} mt-1`} /></label>
            )}
            {form.kind === "webhook" && (
              <label className="text-[12px] font-semibold text-ink-soft">Webhook URL (https)
                <input value={form.recipients} onChange={(e) => setForm({ ...form, recipients: e.target.value })} placeholder="https://hooks.zapier.com/hooks/catch/…" className={`${field} mt-1 font-mono`} />
                <span className="font-normal block mt-1">RANA POSTs JSON <code>{`{ event: "rana.lead", title, lead: {…} }`}</code> for each lead. Works with Zapier, Make, n8n, Google Apps Script and most CRMs.</span>
              </label>
            )}
            {form.kind === "whatsapp" && (<>
              <div className="text-[12px] text-ink-soft bg-sunken rounded-lg p-3">Uses your own <b>WhatsApp Business (Meta Cloud API)</b> number. In Meta Business → WhatsApp → API setup, copy the <b>Phone number ID</b> and a <b>permanent access token</b>. For messages to start a chat, WhatsApp requires an <b>approved template</b> — its {"{{1}}, {{2}}…"} are filled with the details below, in order.</div>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="text-[12px] font-semibold text-ink-soft">Send to (numbers with country code)<input value={form.recipients} onChange={(e) => setForm({ ...form, recipients: e.target.value })} placeholder="919876543210, 919812345678" className={`${field} mt-1`} /></label>
                <label className="text-[12px] font-semibold text-ink-soft">Phone number ID<input value={form.phoneNumberId} onChange={(e) => setForm({ ...form, phoneNumberId: e.target.value })} placeholder="1234567890…" className={`${field} mt-1 font-mono`} /></label>
                <label className="text-[12px] font-semibold text-ink-soft">Template name<input value={form.template} onChange={(e) => setForm({ ...form, template: e.target.value })} placeholder="hot_lead_alert" className={`${field} mt-1 font-mono`} /></label>
                <label className="text-[12px] font-semibold text-ink-soft">Template language<input value={form.templateLang} onChange={(e) => setForm({ ...form, templateLang: e.target.value })} placeholder="en" className={`${field} mt-1 font-mono`} /></label>
              </div>
              <label className="text-[12px] font-semibold text-ink-soft">Access token<input type="password" value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} placeholder={form.secretHint ? "Saved — paste a new token to replace" : "EAAG…"} className={`${field} mt-1 font-mono`} autoComplete="off" /></label>
            </>)}

            <div className="border-t border-line pt-3">
              <div className="text-[12px] font-semibold text-ink-soft mb-1.5">Which leads?</div>
              <div className="flex flex-wrap gap-1.5">{d.leadChoices.map((l: any) => <button key={l.key} type="button" onClick={() => setRule("leads", toggle(form.rules.leads, l.key))} aria-pressed={form.rules.leads.includes(l.key)} className={`rounded-full border px-3 py-1 text-[12.5px] ${form.rules.leads.includes(l.key) ? "bg-signal/15 border-signal/50 text-signal font-semibold" : "border-line text-ink-soft"}`}>{l.label}</button>)}</div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <div className="text-[12px] font-semibold text-ink-soft mb-1.5">Which calls?</div>
                {[["outbound", "Outgoing (campaigns)"], ["inbound", "Incoming"]].map(([k, l]) => <label key={k} className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={form.rules.directions.includes(k)} onChange={() => setRule("directions", toggle(form.rules.directions, k))} />{l}</label>)}
              </div>
              <div>
                <div className="text-[12px] font-semibold text-ink-soft mb-1.5">Which campaigns?</div>
                <select value={form.rules.campaigns === "all" ? "all" : "some"} onChange={(e) => setRule("campaigns", e.target.value === "all" ? "all" : [])} className={field}><option value="all">All campaigns</option><option value="some">Only the ones I pick</option></select>
                {form.rules.campaigns !== "all" && <div className="max-h-[120px] overflow-y-auto mt-1.5 flex flex-col gap-1">{d.campaigns.length ? d.campaigns.map((c: any) => <label key={c.id} className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" checked={form.rules.campaigns.includes(c.id)} onChange={() => setRule("campaigns", toggle(form.rules.campaigns, c.id))} />{c.name}</label>) : <span className="text-[12px] text-ink-soft">No campaigns yet.</span>}</div>}
              </div>
            </div>
            <div>
              <div className="text-[12px] font-semibold text-ink-soft mb-1.5">What goes in the message? {form.kind === "whatsapp" && form.template ? <span className="font-normal">(in this order → {"{{1}}, {{2}}…"})</span> : null}</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">{d.fields.map((x: any) => <label key={x.key} className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" checked={form.rules.fields.includes(x.key)} onChange={() => setRule("fields", toggle(form.rules.fields, x.key))} />{x.label}</label>)}</div>
            </div>
            {err && <div className="text-[13px] text-miss">{err}</div>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setForm(null)} className="border border-line rounded-lg px-4 py-2 text-[13px]">Cancel</button>
              <button onClick={save} disabled={busy} className="bg-signal text-on-accent rounded-lg px-4 py-2 text-[13px] font-semibold disabled:opacity-50" data-testid="alert-save">{busy ? "Saving…" : form.id ? "Save changes" : "Add alert"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
