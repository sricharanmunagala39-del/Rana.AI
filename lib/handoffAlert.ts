// After a real call ends: if the caller needed a person (ready to pay, asked for someone by name, existing
// customer with a problem, complaint…), alert that person immediately and mark the lead for follow-up.
import { sb } from "./db";
import { detectHandoff, normalizeHandoff, scriptRefFrom, RULES, TEAM_LABELS } from "./handoff";
import { APP_URL, emailHtml, esc, ownerEmails, sendEmail } from "./notify";

export async function handoffAfterCall(client: any, saved: any, payload: any): Promise<any | null> {
  const vars = { ...(payload?.initial_agent_variables || {}), ...(payload?.agent_variables || {}) };
  let scriptId = scriptRefFrom(vars.rana_instructions);
  if (!scriptId && saved.campaign_id) {
    const c = (await sb<any[]>(`/campaigns?client_id=eq.${client.id}&or=(sarvam_campaign_id.eq.${encodeURIComponent(saved.campaign_id)},id.eq.${/^[0-9a-f-]{36}$/.test(saved.campaign_id) ? saved.campaign_id : "00000000-0000-0000-0000-000000000000"})&select=script_id&limit=1`).catch(() => [])) || [];
    scriptId = c[0]?.script_id || null;
  }
  if (!scriptId) return null;
  const s = (await sb<any[]>(`/scripts?id=eq.${scriptId}&client_id=eq.${client.id}&select=name,handoff`).catch(() => [])) || [];
  if (!s[0]) return null;
  const h = normalizeHandoff(s[0].handoff);
  const turns = (saved.transcript || []).flatMap((t: any) => [{ role: t.role, text: t.text || "" }, ...(t.indic_text ? [{ role: t.role, text: t.indic_text }] : [])]);
  const hit = detectHandoff(h, turns);
  if (!hit) return null;

  const rule = RULES.find((r) => r.key === hit.rule)!;
  const who = hit.to;
  const caller = saved.caller_name || "A caller";
  const phone = saved.caller_phone || "(number not shared)";
  const to = who?.email ? [who.email] : await ownerEmails(client.id, client.login_email);
  const r = await sendEmail({
    to, clientId: client.id, kind: "handoff",
    subject: `Call back now: ${caller} — ${rule.label.toLowerCase()}`,
    html: emailHtml({
      title: `${caller} needs ${who?.name || "a person"} — ${rule.label.toLowerCase()}`,
      lines: [
        `<b>Phone:</b> ${esc(phone)}`,
        `<b>They said:</b> “${esc(hit.quote)}”`,
        saved.summary ? `<b>Call summary:</b> ${esc(saved.summary)}` : "",
        `Handled by your AI employee <b>${esc(s[0].name)}</b>. ${who ? `Routed to ${esc(who.name || TEAM_LABELS[who.team])} (${esc(TEAM_LABELS[who.team])}).` : ""} The caller was told someone will call back within 10 minutes.`,
      ].filter(Boolean),
      button: { label: "Open the call", url: `${APP_URL()}/${saved.direction === "outbound" ? "outbound" : "inbound"}` },
    }),
  }).catch((e: any) => ({ ok: false, error: String(e?.message || e) }));

  const record = { rule: hit.rule, label: rule.label, to_name: who?.name || null, to_team: who?.team || null, to_phone: who?.phone || null, quote: hit.quote, emailed: !!r.ok, at: new Date().toISOString() };
  await sb(`/calls?id=eq.${saved.id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ handoff: record, follow_up: true }) }).catch(() => {});
  return record;
}
