// Server-only parts of the Sales CRM: Google Sheet sync, settings, and the morning reminder email.
import { sb } from "./db";
import { parseText, findHeaderRow } from "./leadImport";
import { hqEmails } from "./hq";
import { sendEmail, emailHtml, esc, APP_URL } from "./notify";
import { importLeads, guessLeadColumns, rowsToLeads, sheetCsvUrl, view, industryLabel, DELAYED_AFTER_DAYS, type ImportSummary } from "./crm";

export async function crmSettings(): Promise<any> {
  const [s] = (await sb<any[]>(`/crm_settings?id=eq.1&limit=1`).catch(() => [])) || [];
  return s || { id: 1 };
}

/** Pull new rows from the linked Google Sheet into New. Rows already in the CRM (same phone/email) are skipped. */
export async function syncSheet(by = "sheet"): Promise<{ ok: boolean; error?: string; result?: ImportSummary }> {
  const s = await crmSettings();
  if (!s.sheet_url) return { ok: false, error: "No Google Sheet linked yet." };
  const csv = sheetCsvUrl(s.sheet_url);
  let out: { ok: boolean; error?: string; result?: ImportSummary };
  if (!csv) out = { ok: false, error: "That isn't a Google Sheets link." };
  else {
    try {
      const r = await fetch(csv, { redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(20000) });
      const text = await r.text();
      if (!r.ok || /<html/i.test(text.slice(0, 300))) out = { ok: false, error: "Couldn't read the sheet. In Google Sheets: Share → General access → \"Anyone with the link\" → Viewer." };
      else {
        const rows = parseText(text).filter((x) => x.some((c) => String(c || "").trim()));
        let h = findHeaderRow(rows); if (h < 0) h = 0;
        const header = rows[h] || []; const body = rows.slice(h + 1);
        const map = guessLeadColumns(header, body);
        if (!map.includes("phone") && !map.includes("email")) out = { ok: false, error: "The sheet needs a Phone (or Email) column." };
        else {
          const result = await importLeads(rowsToLeads(body, map), { source: "sheet", owner: s.sheet_owner || null, by, batch: `sheet:${new Date().toISOString().slice(0, 10)}` });
          out = { ok: true, result };
        }
      }
    } catch (e: any) { out = { ok: false, error: `Couldn't reach Google Sheets (${String(e?.message || e).slice(0, 80)}).` }; }
  }
  await sb(`/crm_settings?id=eq.1`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ sheet_last_sync: new Date().toISOString(), sheet_last_result: out.ok ? { ok: true, added: out.result!.added, duplicates: out.result!.duplicates, skipped: out.result!.skipped } : { ok: false, error: out.error } }) }).catch(() => {});
  return out;
}

/** Sync the sheet if it's linked and the last sync is older than `minutes`. Never throws. */
export async function maybeSyncSheet(minutes = 10) {
  try {
    const s = await crmSettings();
    if (!s.sheet_url) return null;
    if (s.sheet_last_sync && Date.now() - Date.parse(s.sheet_last_sync) < minutes * 60e3) return null;
    return await syncSheet();
  } catch { return null; }
}

/** HQ people who get the team summary: founders + Operations. */
async function managerEmails(): Promise<string[]> {
  const [hq] = (await sb<any[]>(`/clients?is_hq=eq.true&select=id&limit=1`).catch(() => [])) || [];
  const ops = hq ? (await sb<any[]>(`/users?client_id=eq.${hq.id}&is_active=eq.true&hq_role=in.(founder,ops)&select=email`).catch(() => [])) || [] : [];
  return Array.from(new Set([...hqEmails(), ...ops.map((u) => String(u.email || "").toLowerCase())].filter(Boolean)));
}

const line = (d: any) => `<b>${esc(d.business)}</b>${d.contact_name ? ` · ${esc(d.contact_name)}` : ""}${d.phone ? ` · ${esc(d.phone)}` : ""} — ${esc(industryLabel(d.industry))}${d.next_action ? `<br><span style="color:#6b716d">Next: ${esc(d.next_action)}</span>` : ""}`;

/** Morning email: each owner gets their overdue / today / delayed leads; founders + ops get the team picture. */
export async function crmDigest() {
  const rows = ((await sb<any[]>(`/crm_deals?stage=in.(new,contacted,prospect,demo_booked,demo_done,proposal)&limit=5000`).catch(() => [])) || []).map(view);
  const due = rows.filter((d) => d.follow === "overdue" || d.follow === "today" || d.delayed);
  const fresh = rows.filter((d) => d.stage === "new" && Date.now() - Date.parse(d.created_at) < 86400e3);
  const url = `${APP_URL()}/hq/crm`;
  const sent: any[] = [];
  const byOwner: Record<string, any[]> = {};
  for (const d of due) if (d.owner) (byOwner[d.owner] ||= []).push(d);
  for (const [to, list] of Object.entries(byOwner)) {
    const over = list.filter((d) => d.follow === "overdue"), today = list.filter((d) => d.follow === "today"), late = list.filter((d) => d.delayed && d.follow !== "overdue");
    const lines = [
      over.length ? `<b style="color:#b42318">Follow-up date passed (${over.length})</b><br>${over.slice(0, 25).map(line).join("<br>")}` : "",
      today.length ? `<b>Call today (${today.length})</b><br>${today.slice(0, 25).map(line).join("<br>")}` : "",
      late.length ? `<b style="color:#b54708">Prospects going cold (${late.length})</b> — no update for ${DELAYED_AFTER_DAYS}+ days or closing date passed<br>${late.slice(0, 25).map(line).join("<br>")}` : "",
    ].filter(Boolean);
    const r = await sendEmail({ to, subject: `Your leads today: ${over.length} overdue, ${today.length} due`, html: emailHtml({ title: "Your follow-ups for today", lines, button: { label: "Open Sales CRM", url } }), kind: "crm_digest" });
    sent.push({ to, ok: r.ok, count: list.length });
  }
  const managers = await managerEmails();
  if (managers.length && (due.length || fresh.length)) {
    const unowned = due.filter((d) => !d.owner);
    const perOwner = Object.entries(byOwner).map(([o, l]) => `${esc(o)}: ${l.filter((d) => d.follow === "overdue").length} overdue, ${l.filter((d) => d.delayed).length} going cold`);
    const lines = [
      `Open leads: <b>${rows.length}</b> · Waiting in New (not called yet): <b>${rows.filter((d) => d.stage === "new").length}</b> · Added in the last 24h: <b>${fresh.length}</b>`,
      `Overdue follow-ups: <b>${due.filter((d) => d.follow === "overdue").length}</b> · Due today: <b>${due.filter((d) => d.follow === "today").length}</b> · Prospects going cold: <b>${due.filter((d) => d.delayed).length}</b>`,
      perOwner.length ? `<b>By person</b><br>${perOwner.join("<br>")}` : "",
      unowned.length ? `<b>Nobody owns these (${unowned.length})</b><br>${unowned.slice(0, 15).map(line).join("<br>")}` : "",
    ].filter(Boolean);
    const r = await sendEmail({ to: managers, subject: `Sales CRM: ${due.filter((d) => d.follow === "overdue").length} overdue, ${due.filter((d) => d.delayed).length} going cold`, html: emailHtml({ title: "Sales team — today", lines, button: { label: "Open Sales CRM", url } }), kind: "crm_digest" });
    sent.push({ to: managers.join(","), ok: r.ok, team: true });
  }
  return { open: rows.length, due: due.length, sent };
}
