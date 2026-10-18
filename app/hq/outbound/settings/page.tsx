"use client";
import { useEffect, useState } from "react";
import OutboundShell, { ModeBadge, Modal, Notice, btn, primary, danger, field, runEngine, getJson } from "@/components/OutboundShell";

/** RANA HQ → Outbound → Settings: sender, caps, Priya, and the dry run / live switches (those go through the engine). */
const CAMPAIGN_FIELDS: [string, string, string][] = [
  ["sender_name", "Sender name", "Your name, RANA AI"], ["sender_email", "Sender email", "name@ranaai.in"],
  ["reply_to", "Reply-to", "name@ranaai.in"], ["booking_link", "Booking link", "https://…"],
];

export default function OutboundSettings() {
  const [d, setD] = useState<any>(null);
  const [s, setS] = useState<Record<string, string>>({});
  const [campId, setCampId] = useState<number | null>(null);
  const [c, setC] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [live, setLive] = useState<null | "email" | "whatsapp">(null);
  const [confirmText, setConfirmText] = useState("");
  const [testTo, setTestTo] = useState("");

  function pickCampaign(list: any[], id: number | null) {
    const cur = list.find((x) => x.id === id) || list[0] || null;
    setCampId(cur?.id ?? null);
    setC(Object.fromEntries(CAMPAIGN_FIELDS.map(([k]) => [k, cur?.[k] || ""])));
  }
  const load = () => getJson("/api/hq/outbound/settings").then((j) => { setD(j); setS(j.settings); pickCampaign(j.campaigns, campId); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  async function save() {
    setBusy("save"); setErr(""); setMsg("");
    try {
      const settings = Object.fromEntries((d.editable as string[]).map((k) => [k, s[k] ?? ""]));
      const r = await fetch("/api/hq/outbound/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings, campaign: { id: campId, ...c } }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error);
      if (j.campaign) setCampId(j.campaign.id);
      setMsg("Settings saved."); load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(""); }
  }
  async function engine(body: Record<string, unknown>, done: string) {
    setBusy(String(body.action) + (body.channel || "")); setErr(""); setMsg("");
    try { await runEngine(body); setMsg(done); setLive(null); setConfirmText(""); load(); return true; }
    catch (e: any) { setErr(e.message); return false; } finally { setBusy(""); }
  }

  const set = (k: string) => (e: any) => setS({ ...s, [k]: e.target.value });
  const toggle = (k: string, on: boolean) => setS({ ...s, [k]: on ? "on" : "off" });
  const edit = d?.canEdit;
  const emailLive = d?.settings?.send_mode === "resend", waLive = d?.settings?.wa_mode === "live";
  const agent = s.wa_agent_name || "Priya";

  return (
    <OutboundShell title="Outbound settings" sub="Everything LeadFlow uses to send. Saving here never starts sending — only Go live does."
      actions={edit && <button onClick={save} disabled={!d || !!busy} className={primary} data-testid="settings-save">{busy === "save" ? "Saving…" : "Save settings"}</button>}>
      <Notice err={err} msg={msg} onClear={() => { setErr(""); setMsg(""); }} />
      {!d ? <div className="text-[13px] text-ink-soft">{err ? "" : "Loading…"}</div> : (
        <div className="grid lg:grid-cols-2 gap-4 items-start">
          <Section title="Sending mode" testid="settings-modes">
            {([["email", "Email", emailLive], ["whatsapp", "WhatsApp", waLive]] as const).map(([ch, label, on]) => (
              <div key={ch} className="flex items-center gap-3 flex-wrap rounded-lg border border-line bg-paper px-3 py-2.5">
                <ModeBadge channel={label} live={on} />
                <div className="text-[12px] text-ink-soft flex-1 min-w-[160px]">{on ? "Real messages are going out." : "Messages are written to the outbox but not sent."}</div>
                {on ? (
                  edit && <button onClick={() => engine({ action: "dry_run", channel: ch }, `${label} is back in dry run.`)} disabled={!!busy} className={btn} data-testid={`dryrun-${ch}`}>{busy === `dry_run${ch}` ? "…" : "Back to dry run"}</button>
                ) : (
                  d.canGoLive ? <button onClick={() => { setLive(ch); setConfirmText(""); }} disabled={!!busy} className={danger} data-testid={`golive-${ch}`}>Go live</button>
                    : <span className="text-[11.5px] text-ink-soft">Only founders can go live</span>
                )}
              </div>
            ))}
            {edit && (
              <div className="flex flex-wrap items-end gap-2 pt-1">
                <button onClick={() => engine({ action: "test_email" }, `Test email sent to ${s.owner_email || "the owner email"}.`)} disabled={!!busy} className={btn} data-testid="test-email">{busy === "test_email" ? "Sending…" : "✉️ Send test email"}</button>
                <input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="+91… WhatsApp number" className="border border-line rounded-lg px-3 py-2 text-[13px] bg-paper w-[180px]" data-testid="test-wa-to" />
                <button onClick={() => engine({ action: "test_whatsapp", to: testTo }, "Test WhatsApp sent.")} disabled={!!busy || !testTo.trim()} className={btn} data-testid="test-wa">{busy === "test_whatsapp" ? "Sending…" : "💬 Test WhatsApp"}</button>
              </div>
            )}
          </Section>

          <Section title="Campaign sender" testid="settings-campaign">
            {d.campaigns.length > 1 && (
              <label className="text-[12px] font-semibold">Campaign<select value={campId ?? ""} onChange={(e) => pickCampaign(d.campaigns, Number(e.target.value))} className={field}>{d.campaigns.map((x: any) => <option key={x.id} value={x.id}>{x.name} ({x.status})</option>)}</select></label>
            )}
            {!d.campaigns.length && <div className="text-[12px] text-ink-soft">No campaign yet. Saving creates one, paused.</div>}
            {CAMPAIGN_FIELDS.map(([k, label, ph]) => (
              <label key={k} className="text-[12px] font-semibold">{label}<input value={c[k] || ""} onChange={(e) => setC({ ...c, [k]: e.target.value })} placeholder={ph} readOnly={!edit} className={field} data-testid={`camp-${k}`} /></label>
            ))}
          </Section>

          <Section title="Limits" testid="settings-limits">
            <div className="grid grid-cols-2 gap-3">
              <label className="text-[12px] font-semibold">Emails per day<input value={s.daily_cap || ""} onChange={set("daily_cap")} inputMode="numeric" readOnly={!edit} className={field} data-testid="set-daily_cap" /></label>
              <label className="text-[12px] font-semibold">WhatsApps per day<input value={s.wa_cap || ""} onChange={set("wa_cap")} inputMode="numeric" readOnly={!edit} className={field} data-testid="set-wa_cap" /></label>
            </div>
            <Toggle label="Warm-up ramp" hint="Start low and raise the email cap gradually after going live." on={s.ramp === "on"} onChange={(v) => toggle("ramp", v)} disabled={!edit} testid="set-ramp" />
            <label className="text-[12px] font-semibold">Owner email <span className="font-normal text-ink-soft">(test emails and reply alerts go here)</span><input value={s.owner_email || ""} onChange={set("owner_email")} readOnly={!edit} className={field} data-testid="set-owner_email" /></label>
            <label className="text-[12px] font-semibold">Lead master sheet<input value={s.sheet_url || ""} onChange={set("sheet_url")} placeholder="https://docs.google.com/spreadsheets/d/…" readOnly={!edit} className={field} data-testid="set-sheet_url" /></label>
          </Section>

          <Section title={`${agent} — WhatsApp agent`} testid="settings-agent">
            <Toggle label={`${agent} replies on WhatsApp`} hint="Off: every new WhatsApp message waits for you." on={s.wa_agent !== "off"} onChange={(v) => toggle("wa_agent", v)} disabled={!edit} testid="set-wa_agent" />
            <label className="text-[12px] font-semibold">Agent name<input value={s.wa_agent_name || ""} onChange={set("wa_agent_name")} placeholder="Priya" readOnly={!edit} className={field} data-testid="set-wa_agent_name" /></label>
            <label className="text-[12px] font-semibold">Payment link<input value={s.wa_payment_link || ""} onChange={set("wa_payment_link")} placeholder="https://…" readOnly={!edit} className={field} data-testid="set-wa_payment_link" /></label>
            <label className="text-[12px] font-semibold">Calendar booking URL<input value={s.cal_url || ""} onChange={set("cal_url")} placeholder="https://…" readOnly={!edit} className={field} data-testid="set-cal_url" /></label>
          </Section>
        </div>
      )}

      {live && (
        <Modal title={`Go live on ${live === "email" ? "email" : "WhatsApp"}?`} onClose={() => setLive(null)} testid="golive-modal">
          <div className="text-[13px] text-ink-soft">
            {live === "email"
              ? `Real emails will go to leads from ${c.sender_email || "the campaign sender"}, up to ${s.daily_cap || "the daily cap"} a day${s.ramp === "on" ? " (ramping up)" : ""}, Mon–Fri 10:00–18:00 IST.`
              : `Real WhatsApp messages will go to leads, up to ${s.wa_cap || "the daily cap"} a day${s.wa_agent !== "off" ? `, and ${agent} will answer replies` : ""}.`}
          </div>
          <label className="text-[12px] font-semibold">Type <span className="font-mono">GO LIVE</span> to confirm<input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoFocus className={field} data-testid="golive-confirm" /></label>
          <div className="flex justify-end gap-2">
            <button onClick={() => setLive(null)} className={btn}>Cancel</button>
            <button onClick={() => engine({ action: "go_live", channel: live, confirm: confirmText }, `${live === "email" ? "Email" : "WhatsApp"} is live.`)} disabled={confirmText !== "GO LIVE" || !!busy} className={danger} data-testid="golive-submit">{busy ? "Switching…" : "Go live"}</button>
          </div>
        </Modal>
      )}
    </OutboundShell>
  );
}

function Section({ title, children, testid }: { title: string; children: React.ReactNode; testid?: string }) {
  return <div className="border border-line rounded-xl bg-raised p-4 flex flex-col gap-3" data-testid={testid}><div className="text-[13px] font-semibold">{title}</div>{children}</div>;
}

function Toggle({ label, hint, on, onChange, disabled, testid }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void; disabled?: boolean; testid?: string }) {
  return (
    <button type="button" onClick={() => !disabled && onChange(!on)} disabled={disabled} className="flex items-center gap-3 text-left disabled:opacity-70" data-testid={testid}>
      <span className={`w-9 h-5 rounded-full p-[2px] flex shrink-0 ${on ? "bg-signal/40 justify-end" : "bg-line justify-start"}`}><span className={`w-4 h-4 rounded-full ${on ? "bg-signal" : "bg-ink-soft"}`} /></span>
      <span><span className="text-[13px] font-semibold block">{label}</span>{hint && <span className="text-[11.5px] text-ink-soft">{hint}</span>}</span>
    </button>
  );
}
