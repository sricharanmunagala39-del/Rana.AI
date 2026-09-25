// Daily client lifecycle run (inside the billing cron): trial reminders, low-balance / empty emails, auto-recharge,
// weekly client reports (Mondays), and a morning digest to RANA HQ. Every email is sent at most once per key.
import { sb } from "./db";
import { usageOf } from "./plans";
import { walletOf } from "./wallet";
import { maybeAutoRecharge } from "./autoRecharge";
import { sendOnce, sendEmail, ownerEmails, tpl, hqInbox } from "./notify";
import { todayIST } from "./billing";

const DAY = 86400e3;

export async function recordCron(job: string, ok: boolean, detail: any) {
  await sb(`/cron_runs`, { method: "POST", prefer: "return=minimal", body: JSON.stringify({ job, ok, detail }) }).catch(() => {});
}

function weekKey(now: Date) {
  const d = new Date(Date.parse(todayIST(now) + "T00:00:00Z"));
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(d.getTime() - day * DAY).toISOString().slice(0, 10);
}

export async function runLifecycle(now = new Date()) {
  const log: any[] = [];
  const clients = (await sb<any[]>(`/clients?is_hq=eq.false&status=in.(active,suspended)&select=*`)) || [];
  const isMonday = new Date(Date.parse(todayIST(now) + "T00:00:00Z")).getUTCDay() === 1;
  for (const c of clients) {
    try {
      const to = await ownerEmails(c.id, c.billing_email || c.login_email);
      const u = await usageOf(c, now);
      if (c.plan === "trial" && c.status === "active") {
        if (u.trialDaysLeft !== null && u.trialDaysLeft <= 3 && u.trialDaysLeft >= 0) {
          const m = tpl.trialEnding(c.name, u.trialDaysLeft);
          const r = await sendOnce(c, "trial_3d", { to, ...m, kind: "trial_ending" }); if (!("skipped" in r)) log.push({ client: c.name, sent: "trial_ending" });
        }
        if (u.minutesIncluded && u.minutesUsed / u.minutesIncluded >= 0.8) {
          const m = tpl.trialMinutes(c.name, u.minutesUsed, u.minutesIncluded);
          const r = await sendOnce(c, "trial_80", { to, ...m, kind: "trial_minutes" }); if (!("skipped" in r)) log.push({ client: c.name, sent: "trial_minutes" });
        }
      }
      if (c.wallet_enabled && c.plan !== "trial") {
        const w = await walletOf(c, u);
        const day = todayIST(now);
        if (w.empty) { const m = tpl.walletEmpty(c.name); const r = await sendOnce(c, `wallet_empty:${day}`, { to, ...m, kind: "wallet_empty" }); if (!("skipped" in r)) log.push({ client: c.name, sent: "wallet_empty" }); }
        else if (w.low) { const m = tpl.walletLow(c.name, w.balance, w.walletMinutesLeft); const r = await sendOnce(c, `wallet_low:${u.periodStart.slice(0, 10)}`, { to, ...m, kind: "wallet_low" }); if (!("skipped" in r)) log.push({ client: c.name, sent: "wallet_low" }); }
        const auto = await maybeAutoRecharge(c, w).catch(() => null);
        if (auto) log.push({ client: c.name, did: "auto_recharge", number: auto.number });
      }
      if (isMonday && c.status === "active") {
        const since = new Date(now.getTime() - 7 * DAY).toISOString();
        const calls = (await sb<any[]>(`/calls?client_id=eq.${c.id}&created_at=gte.${encodeURIComponent(since)}&or=(source.is.null,source.neq.manual)&select=duration_seconds,lead_status,caller_name,agent_variables&limit=20000`).catch(() => [])) || [];
        if (calls.length) {
          const connected = calls.filter((x) => Number(x.duration_seconds) > 0);
          const minutes = connected.reduce((a, x) => a + Math.ceil(Number(x.duration_seconds) / 30) / 2, 0);
          const hot = calls.filter((x) => ["hot", "warm", "interested"].includes(String(x.lead_status || "").toLowerCase())).length;
          const byEmp: Record<string, number> = {};
          for (const x of connected) { const n = x.agent_variables?.employee_name || x.agent_variables?.agent_name; if (n) byEmp[n] = (byEmp[n] || 0) + 1; }
          const best = Object.entries(byEmp).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
          const m = tpl.weekly(c.name, { calls: calls.length, connected: connected.length, minutes, hot, best, answerRate: Math.round((connected.length / calls.length) * 100) });
          const r = await sendOnce(c, `weekly:${weekKey(now)}`, { to, ...m, kind: "weekly_report" }); if (!("skipped" in r)) log.push({ client: c.name, sent: "weekly" });
        }
      }
    } catch (e: any) { log.push({ client: c.name, error: String(e?.message || e).slice(0, 200) }); }
  }
  // Morning digest to HQ (red + orange alerts only).
  try {
    const { hqOverview } = await import("./insights");
    const o = await hqOverview(now);
    const lines = o.alerts.filter((a) => a.level !== "info").map((a) => `${a.client ? `<b>${a.client}</b>: ` : ""}${a.text}`);
    if (lines.length) {
      const m = tpl.hqDigest(lines.slice(0, 20));
      const key = `hq_digest:${todayIST(now)}`;
      const seen = await sb<any[]>(`/notifications?kind=eq.hq_digest&created_at=gte.${encodeURIComponent(new Date(now.getTime() - 20 * 3600e3).toISOString())}&select=id&limit=1`).catch(() => []);
      if (!seen?.length) { await sendEmail({ to: hqInbox(), subject: m.subject, html: m.html, kind: "hq_digest" }); log.push({ sent: "hq_digest", key, alerts: lines.length }); }
    }
  } catch (e: any) { log.push({ digestError: String(e?.message || e).slice(0, 200) }); }
  return log;
}
