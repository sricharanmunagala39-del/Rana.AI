// Email to clients and to RANA HQ, sent through Resend (ranaai.in is verified there).
// Switches on when RESEND_API_KEY is set in Vercel; until then every message is logged as "not sent" so HQ can see it.
import { sb } from "./db";
import { hqEmails } from "./hq";

export const APP_URL = () => (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://ranaai.in").replace(/\/$/, "");
export const emailConfigured = () => !!process.env.RESEND_API_KEY;
const FROM = () => process.env.RANA_MAIL_FROM || "RANA AI <support@ranaai.in>";
const esc = (s: any) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

/** Simple, readable HTML: a heading, paragraphs, an optional button, a small footer. */
export function emailHtml(o: { title: string; lines: string[]; button?: { label: string; url: string }; foot?: string }) {
  return `<!doctype html><html><body style="margin:0;background:#f3f4f1;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#141a17">
<div style="max-width:560px;margin:0 auto;padding:28px 18px">
<div style="font-weight:700;font-size:18px;margin-bottom:18px">RANA AI</div>
<div style="background:#fff;border:1px solid #e3e5e0;border-radius:14px;padding:26px">
<div style="font-size:19px;font-weight:700;margin-bottom:12px">${esc(o.title)}</div>
${o.lines.map((l) => `<p style="font-size:14.5px;line-height:1.55;margin:0 0 12px">${l}</p>`).join("")}
${o.button ? `<a href="${esc(o.button.url)}" style="display:inline-block;margin-top:8px;background:#1e6b4f;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 18px;border-radius:9px">${esc(o.button.label)}</a>` : ""}
</div>
<div style="font-size:12px;color:#6b716d;margin-top:14px">${esc(o.foot || "RANA AI · support@ranaai.in")}</div>
</div></body></html>`;
}

export async function sendEmail(o: { to: string | string[]; subject: string; html: string; clientId?: string | null; kind: string }): Promise<{ ok: boolean; error?: string }> {
  const to = (Array.isArray(o.to) ? o.to : [o.to]).filter(Boolean);
  let ok = false, error: string | undefined;
  if (!to.length) error = "no recipient";
  else if (!emailConfigured()) error = "email not set up (RESEND_API_KEY missing)";
  else {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM(), to, subject: o.subject, html: o.html, reply_to: "support@ranaai.in" }),
        signal: AbortSignal.timeout(15000),
      });
      ok = r.ok;
      if (!r.ok) error = `Resend ${r.status}: ${(await r.text()).slice(0, 200)}`;
    } catch (e: any) { error = String(e?.message || e).slice(0, 200); }
  }
  await sb(`/notifications`, { method: "POST", prefer: "return=minimal", body: JSON.stringify({ client_id: o.clientId || null, kind: o.kind, to_email: to.join(", ").slice(0, 300), subject: o.subject.slice(0, 200), ok, error: error || null }) }).catch(() => {});
  return { ok, error };
}

/** Send at most once per `key` per client (e.g. "trial_3d", "low_wallet:2026-09-25"). */
export async function sendOnce(client: any, key: string, msg: { to: string | string[]; subject: string; html: string; kind: string }) {
  const notified = client.notified || {};
  if (notified[key]) return { ok: false, skipped: true };
  const r = await sendEmail({ ...msg, clientId: client.id });
  // Remember it even if email isn't set up yet, so switching email on doesn't blast old alerts.
  const next = { ...notified, [key]: new Date().toISOString() };
  client.notified = next;
  await sb(`/clients?id=eq.${client.id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ notified: next }) }).catch(() => {});
  return r;
}

export async function ownerEmails(clientId: string, fallback?: string | null): Promise<string[]> {
  const rows = (await sb<any[]>(`/users?client_id=eq.${clientId}&is_active=eq.true&role=in.(owner,admin)&select=email`).catch(() => [])) || [];
  const list = rows.map((r) => r.email).filter(Boolean);
  return list.length ? list : fallback ? [fallback] : [];
}

export const hqInbox = () => hqEmails();

// ---- Templates ----
export const tpl = {
  welcome: (name: string, email: string, password: string, plan: string) => ({
    subject: `Your RANA AI login for ${name}`,
    html: emailHtml({
      title: `Welcome to RANA AI, ${name}`,
      lines: [
        `Your workspace is ready on the <b>${esc(plan)}</b> plan.`,
        `Sign in with <b>${esc(email)}</b> and this one-time password: <b style="font-family:monospace;font-size:15px">${esc(password)}</b>`,
        "You'll set your own password the first time you sign in. Then follow the setup checklist on your dashboard: add billing details, create your first AI employee and place a test call.",
      ],
      button: { label: "Sign in to RANA", url: `${APP_URL()}/login` },
    }),
  }),
  trialEnding: (name: string, daysLeft: number) => ({
    subject: `${name}: your RANA trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
    html: emailHtml({ title: "Your free trial is ending soon", lines: [`Your trial ends in <b>${daysLeft} day${daysLeft === 1 ? "" : "s"}</b>. Pick a plan to keep your AI employees calling — your scripts, leads and results stay exactly as they are.`], button: { label: "Choose a plan", url: `${APP_URL()}/billing` } }),
  }),
  trialMinutes: (name: string, used: number, total: number) => ({
    subject: `${name}: you've used ${Math.round((used / total) * 100)}% of your trial minutes`,
    html: emailHtml({ title: "Trial minutes running low", lines: [`You've used <b>${Math.round(used)} of ${total}</b> trial minutes. When they run out, calling pauses until you pick a plan.`], button: { label: "Choose a plan", url: `${APP_URL()}/billing` } }),
  }),
  walletLow: (name: string, balance: number, minutesLeft: number) => ({
    subject: `${name}: RANA calling balance is low (₹${Math.round(balance).toLocaleString("en-IN")})`,
    html: emailHtml({ title: "Recharge to keep calling", lines: [`Your plan minutes are used up and your prepaid balance is <b>₹${Math.round(balance).toLocaleString("en-IN")}</b> — about <b>${Math.round(minutesLeft)} minutes</b> of calling.`, "Recharge now so campaigns don't stop. You can also turn on auto-recharge on the Billing page."], button: { label: "Recharge", url: `${APP_URL()}/billing#recharge` } }),
  }),
  walletEmpty: (name: string) => ({
    subject: `${name}: calling paused — balance used up`,
    html: emailHtml({ title: "Calling is paused", lines: ["Your plan minutes and prepaid balance are used up, so new calls are paused. Your employees, leads and results are safe.", "Recharge and calling starts again straight away."], button: { label: "Recharge now", url: `${APP_URL()}/billing#recharge` } }),
  }),
  autoRecharge: (name: string, amount: number, url: string | null) => ({
    subject: `${name}: auto-recharge of ₹${Math.round(amount).toLocaleString("en-IN")} is ready to pay`,
    html: emailHtml({ title: "Your auto-recharge is ready", lines: [`Your balance dropped below your auto-recharge level, so we've prepared a recharge of <b>₹${Math.round(amount).toLocaleString("en-IN")}</b> + GST.`, "Pay by UPI, card or netbanking — it takes a few seconds."], button: url ? { label: "Pay now", url } : { label: "Open Billing", url: `${APP_URL()}/billing` } }),
  }),
  paymentReceived: (name: string, number: string, total: number, what: string) => ({
    subject: `Payment received — ${number}`,
    html: emailHtml({ title: "Thank you — payment received", lines: [`We've received <b>₹${total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</b> for ${esc(what)} (invoice ${esc(number)}).`, "Your GST invoice is on the Billing page."], button: { label: "View invoice", url: `${APP_URL()}/billing` } }),
  }),
  weekly: (name: string, s: { calls: number; connected: number; minutes: number; hot: number; best: string | null; answerRate: number }) => ({
    subject: `${name}: your week with RANA — ${s.connected} conversations, ${s.hot} hot leads`,
    html: emailHtml({
      title: "Your week with RANA",
      lines: [
        `<b>${s.calls}</b> calls placed · <b>${s.connected}</b> conversations (${s.answerRate}% answered) · <b>${Math.round(s.minutes)}</b> minutes`,
        `<b>${s.hot}</b> hot or interested leads are waiting for your team.`,
        s.best ? `Best performer this week: <b>${esc(s.best)}</b>.` : "",
      ].filter(Boolean),
      button: { label: "Open your leads", url: `${APP_URL()}/outbound` },
    }),
  }),
  hqDigest: (lines: string[]) => ({
    subject: `RANA HQ — ${lines.length} thing${lines.length === 1 ? "" : "s"} need you today`,
    html: emailHtml({ title: "Good morning. Here's what needs you today.", lines: lines.map((l) => `• ${l}`), button: { label: "Open RANA HQ", url: `${APP_URL()}/hq` } }),
  }),
};
