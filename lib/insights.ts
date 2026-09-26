// RANA HQ command centre: one pass over every client → metrics, health score (0–100), alerts, live strip, platform health.
// Everything here is read-only and computed from data RANA already stores.
import { sb, sbAll } from "./db";
import { PLANS, type PlanKey, usageOf, billedMinutes } from "./plans";
import { walletOf } from "./wallet";
import { sarvamBalance, costPerMin } from "./finance";
import { todayIST, r2 } from "./billing";

const DAY = 86400e3;
const IST = 5.5 * 3600e3;
export type Alert = { level: "red" | "orange" | "info"; kind: string; clientId?: string; client?: string; text: string; action?: { label: string; href?: string; op?: string } };

function sliceStats(calls: any[]) {
  const total = calls.length;
  const connected = calls.filter((c) => Number(c.duration_seconds) > 0).length;
  const minutes = billedMinutes(calls.map((c) => Number(c.duration_seconds) || 0));
  const hot = calls.filter((c) => ["hot", "warm", "interested"].includes(String(c.lead_status || "").toLowerCase())).length;
  const failed = calls.filter((c) => c.failure_reason || /fail|error/i.test(String(c.connectivity_status || ""))).length;
  return { total, connected, minutes, hot, failed, answerRate: total ? Math.round((connected / total) * 100) : null as number | null };
}

/** Health 0–100 with the reasons that pulled it down. */
export function healthScore(m: { status: string; plan: string; usage7: number; usagePrev7: number; answerRate7: number | null; daysSinceLogin: number | null; minutesLeftShare: number | null; overdue: boolean; walletEmpty: boolean; trialDaysLeft: number | null }) {
  let score = 100; const why: string[] = [];
  const hit = (n: number, reason: string) => { score -= n; why.push(reason); };
  if (m.status === "suspended") hit(40, "calling paused");
  if (m.overdue) hit(20, "invoice overdue");
  if (m.walletEmpty) hit(25, "balance used up");
  if (m.usage7 === 0) hit(25, "no calls in 7 days");
  else if (m.usagePrev7 > 20 && m.usage7 < m.usagePrev7 * 0.5) hit(15, `usage down ${Math.round((1 - m.usage7 / m.usagePrev7) * 100)}% week on week`);
  if (m.answerRate7 !== null && m.answerRate7 < 25 && m.usage7 > 10) hit(15, `answer rate ${m.answerRate7}%`);
  if (m.daysSinceLogin === null) hit(10, "owner never logged in");
  else if (m.daysSinceLogin > 14) hit(15, `no login for ${m.daysSinceLogin} days`);
  else if (m.daysSinceLogin > 7) hit(8, `no login for ${m.daysSinceLogin} days`);
  if (m.plan === "trial" && m.trialDaysLeft !== null && m.trialDaysLeft <= 3) hit(5, `trial ends in ${m.trialDaysLeft} day${m.trialDaysLeft === 1 ? "" : "s"}`);
  score = Math.max(0, Math.min(100, score));
  return { score, band: score >= 75 ? "good" : score >= 50 ? "watch" : "risk", why };
}

export async function hqOverview(now = new Date()) {
  const since14 = new Date(now.getTime() - 14 * DAY).toISOString();
  const startToday = new Date(Date.parse(todayIST(now) + "T00:00:00Z") - IST).toISOString();
  const [clients, users, calls, openInv, paidMonth, campaigns, crons, rzpEvents, mailFails, diag] = await Promise.all([
    sb<any[]>(`/clients?is_hq=eq.false&order=created_at.desc&select=*`),
    sb<any[]>(`/users?select=client_id,email,role,last_login_at,is_active`),
    // Real calls only — free Talk-page practice (source "manual") isn't activity, minutes or cost.
    sbAll<any>(`/calls?created_at=gte.${encodeURIComponent(since14)}&or=(source.is.null,source.neq.manual)&select=client_id,created_at,duration_seconds,connectivity_status,failure_reason,lead_status,source&order=created_at.asc,id.asc`),
    sb<any[]>(`/invoices?status=eq.issued&select=client_id,total,due_date,number,kind`),
    sb<any[]>(`/invoices?status=eq.paid&paid_at=gte.${encodeURIComponent(new Date(Date.parse(todayIST(now).slice(0, 7) + "-01T00:00:00Z") - IST).toISOString())}&select=total,subtotal`),
    sb<any[]>(`/campaigns?status=in.(running,scheduled)&select=client_id,name,status,last_error,last_synced_at,started_at`),
    sb<any[]>(`/cron_runs?order=ran_at.desc&limit=20`).catch(() => []),
    sb<any[]>(`/razorpay_events?order=received_at.desc&limit=30&select=event,result,received_at`).catch(() => []),
    sb<any[]>(`/notifications?ok=eq.false&created_at=gte.${encodeURIComponent(new Date(now.getTime() - DAY).toISOString())}&select=kind,error&limit=50`).catch(() => []),
    sb<any[]>(`/rana_diagnostics?order=created_at.desc&limit=1&select=created_at,result`).catch(() => []),
  ]);
  const newDemos = (await sb<any[]>(`/demo_requests?status=eq.new&select=id,company,created_at&order=created_at.asc`).catch(() => [])) || [];
  const today = todayIST(now);
  const alerts: Alert[] = [];
  const rows = await Promise.all((clients || []).map(async (c) => {
    const mine = (calls || []).filter((x) => x.client_id === c.id);
    const last7 = mine.filter((x) => Date.parse(x.created_at) >= now.getTime() - 7 * DAY);
    const prev7 = mine.filter((x) => Date.parse(x.created_at) < now.getTime() - 7 * DAY);
    const s7 = sliceStats(last7), sp = sliceStats(prev7), sToday = sliceStats(mine.filter((x) => x.created_at >= startToday));
    const trend = Array.from({ length: 14 }, (_, i) => {
      const d0 = Date.parse(todayIST(new Date(now.getTime() - (13 - i) * DAY)) + "T00:00:00Z") - IST;
      return billedMinutes(mine.filter((x) => { const t = Date.parse(x.created_at); return t >= d0 && t < d0 + DAY; }).map((x) => Number(x.duration_seconds) || 0));
    });
    const team = (users || []).filter((u) => u.client_id === c.id);
    const lastLogin = team.map((u) => u.last_login_at).filter(Boolean).sort().pop() || null;
    const daysSinceLogin = lastLogin ? Math.floor((now.getTime() - Date.parse(lastLogin)) / DAY) : null;
    const u = await usageOf(c, now).catch(() => null);
    const w = c.wallet_enabled && c.plan !== "trial" ? await walletOf(c, u).catch(() => null) : null;
    const inv = (openInv || []).filter((i) => i.client_id === c.id);
    const overdue = inv.some((i) => i.kind !== "recharge" && i.due_date && i.due_date < today);
    const minutesLeftShare = u ? (u.minutesIncluded ? Math.max(0, u.minutesIncluded - u.minutesUsed) / u.minutesIncluded : null) : null;
    const h = healthScore({ status: c.status, plan: c.plan, usage7: s7.minutes, usagePrev7: sp.minutes, answerRate7: s7.answerRate, daysSinceLogin, minutesLeftShare, overdue, walletEmpty: !!w?.empty, trialDaysLeft: u?.trialDaysLeft ?? null });
    const plan = PLANS[c.plan as PlanKey];
    const costMonth = u ? r2(u.minutesUsed * costPerMin()) : 0;

    // ---- Alerts for this client ----
    const A = (level: Alert["level"], kind: string, text: string, action?: Alert["action"]) => alerts.push({ level, kind, clientId: c.id, client: c.name, text, action });
    if (c.status === "pending") A("orange", "signup", `${c.name} signed up and is waiting for approval.`, { label: "Approve", op: "approve" });
    if (c.status === "suspended") A("red", "paused", `Calling is paused${c.suspended_reason === "billing" ? " (overdue invoice)" : ""}.`);
    if (w?.empty) A("red", "wallet_empty", "Balance used up — calls are blocked until they recharge.");
    else if (w?.low) A("orange", "wallet_low", `Balance low: ₹${Math.round(w.balance).toLocaleString("en-IN")} (≈${w.walletMinutesLeft} min).`);
    if (overdue) A("red", "overdue", `Overdue invoice ${inv.find((i) => i.due_date < today)?.number}.`);
    if (c.plan === "trial" && u?.trialDaysLeft !== null && u?.trialDaysLeft !== undefined && u.trialDaysLeft <= 3 && c.status === "active") A("orange", "trial_ending", `Trial ends in ${u.trialDaysLeft} day${u.trialDaysLeft === 1 ? "" : "s"} — ${Math.round(u.minutesUsed)} of ${u.minutesIncluded} min used.`, { label: "Call them" });
    if (u && c.plan !== "trial" && u.minutesIncluded && u.minutesUsed / u.minutesIncluded >= 0.9 && !w) A("info", "upsell", `Used ${Math.round((u.minutesUsed / u.minutesIncluded) * 100)}% of ${plan?.name} minutes — offer a bigger plan.`);
    if (s7.total >= 20 && s7.answerRate !== null && sp.answerRate !== null && sp.total >= 20 && s7.answerRate < sp.answerRate - 20) A("red", "answer_drop", `Answer rate fell from ${sp.answerRate}% to ${s7.answerRate}% this week — check the number isn't flagged as spam and the calling hours.`);
    if (sp.minutes > 30 && s7.minutes < sp.minutes * 0.4) A("orange", "usage_drop", `Usage down ${Math.round((1 - s7.minutes / sp.minutes) * 100)}% week on week — churn risk.`);
    if (plan?.pricePerMonth && u && u.minutesUsed > 0 && costMonth > plan.pricePerMonth * 0.7 && !w) A("orange", "margin", `Sarvam cost ≈ ₹${Math.round(costMonth).toLocaleString("en-IN")} this period vs ₹${plan.pricePerMonth.toLocaleString("en-IN")} plan — margin under 30%.`);
    if (daysSinceLogin !== null && daysSinceLogin > 10 && c.status === "active") A("info", "inactive", `Nobody has logged in for ${daysSinceLogin} days.`);
    if (daysSinceLogin === null && Date.now() - Date.parse(c.created_at) > 3 * DAY) A("info", "never_logged_in", "Owner has never logged in — resend the login.");

    return {
      id: c.id, name: c.name, plan: c.plan, planName: plan?.name || c.plan, status: c.status, industry: c.industry, createdAt: c.created_at,
      lastLogin, daysSinceLogin, today: sToday, week: s7, prevWeek: sp, trend,
      usage: u ? { used: u.minutesUsed, included: u.minutesIncluded, trialDaysLeft: u.trialDaysLeft } : null,
      wallet: w ? { balance: w.balance, minutesLeft: w.walletMinutesLeft, low: w.low, empty: w.empty, auto: !!w.autoRecharge } : null,
      outstanding: r2(inv.reduce((a, i) => a + Number(i.total), 0)), overdue,
      health: h, mrr: c.plan !== "trial" && c.status === "active" ? plan?.pricePerMonth || 0 : 0,
    };
  }));

  // ---- Business-wide ----
  const sarvam = await sarvamBalance(now).catch(() => null);
  const live = await import("./sarvamHealth").then((m) => m.sarvamStatus()).catch(() => null);
  if (live && !live.ok) alerts.unshift({ level: "red", kind: "sarvam_down", text: `STOPPED: ${live.reason || "Sarvam is refusing requests"}${live.since ? ` since ${new Date(live.since).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}` : ""}. Client calls, Talk page, voice previews and AI tools are stopped until it's fixed.`, action: { label: "Top up Sarvam", href: "https://indus.sarvam.ai/billing" } });
  if (sarvam?.lowWarning) alerts.push({ level: "red", kind: "sarvam", text: `Sarvam credits low: ≈₹${Math.round(sarvam.balance || 0).toLocaleString("en-IN")} left${sarvam.daysLeft !== null ? `, about ${sarvam.daysLeft} days` : ""}. Top up ₹${sarvam.suggestTopUp.toLocaleString("en-IN")} + GST.`, action: { label: "Money page", href: "/hq/money" } });
  else if (sarvam && !sarvam.tracked) alerts.push({ level: "info", kind: "sarvam_untracked", text: "Enter your Sarvam balance on the Money page so RANA can warn you before it runs out.", action: { label: "Money page", href: "/hq/money" } });
  if (newDemos.length) {
    const oldestH = Math.floor((now.getTime() - Date.parse(newDemos[0].created_at)) / 3600e3);
    alerts.unshift({ level: oldestH >= 24 ? "red" : "orange", kind: "demo", text: `${newDemos.length} new demo request${newDemos.length > 1 ? "s" : ""} from the website (${newDemos.slice(0, 3).map((d) => d.company).join(", ")}${newDemos.length > 3 ? "…" : ""})${oldestH >= 1 ? ` — oldest waiting ${oldestH} h` : ""}. Call them back.`, action: { label: "Demo requests", href: "/hq/demos" } });
  }
  const lastCron = (job: string) => (crons || []).find((r) => r.job === job) || null;
  for (const job of ["billing", "sync-calls"]) {
    const r = lastCron(job);
    if (r && !r.ok) alerts.push({ level: "red", kind: "cron", text: `Daily ${job} job failed at ${new Date(r.ran_at).toLocaleString("en-IN")}.` });
    if (r && now.getTime() - Date.parse(r.ran_at) > 2 * DAY) alerts.push({ level: "orange", kind: "cron", text: `Daily ${job} job hasn't run for ${Math.floor((now.getTime() - Date.parse(r.ran_at)) / DAY)} days.` });
  }
  const rzpErr = (rzpEvents || []).filter((e) => String(e.result || "").startsWith("error") || e.result === "underpaid" || e.result === "link mismatch");
  if (rzpErr.length) alerts.push({ level: "red", kind: "payments", text: `${rzpErr.length} Razorpay payment notice${rzpErr.length === 1 ? "" : "s"} couldn't be matched — check the Money page.` });
  // Business numbers waiting on HQ (find one / attach in Sarvam / fix a failed purchase / unpaid rent).
  const numTasks = (await sb<any[]>(`/phone_numbers?status=in.(requested,provisioning,failed,lapsed)&select=status,client_id`).catch(() => [])) || [];
  const nt = (s: string) => numTasks.filter((x) => x.status === s).length;
  if (nt("requested")) alerts.push({ level: "orange", kind: "numbers", text: `${nt("requested")} client${nt("requested") === 1 ? " wants" : "s want"} a business number — find one and offer it.`, action: { label: "Phone numbers", href: "/hq/numbers" } });
  if (nt("provisioning") || nt("failed")) alerts.push({ level: nt("failed") ? "red" : "orange", kind: "numbers", text: `${nt("provisioning") + nt("failed")} paid number${nt("provisioning") + nt("failed") === 1 ? "" : "s"} to switch on (attach in Sarvam → Mark live)${nt("failed") ? ` — ${nt("failed")} failed to buy automatically` : ""}.`, action: { label: "Phone numbers", href: "/hq/numbers" } });
  if (nt("lapsed")) alerts.push({ level: "orange", kind: "numbers", text: `${nt("lapsed")} number${nt("lapsed") === 1 ? "" : "s"} with unpaid rent — chase or release.`, action: { label: "Phone numbers", href: "/hq/numbers" } });
  const stuck = (campaigns || []).filter((k) => k.last_error);
  for (const k of stuck.slice(0, 5)) alerts.push({ level: "orange", kind: "campaign", clientId: k.client_id, client: rows.find((r) => r.id === k.client_id)?.name, text: `Campaign "${k.name}" reports: ${String(k.last_error).slice(0, 120)}` });

  const all14 = calls || [];
  const todayAll = sliceStats(all14.filter((x) => x.created_at >= startToday));
  const hourAgo = new Date(now.getTime() - 3600e3).toISOString();
  const lastHour = sliceStats(all14.filter((x) => x.created_at >= hourAgo));
  const order = { red: 0, orange: 1, info: 2 } as const;
  alerts.sort((a, b) => order[a.level] - order[b.level]);

  const paying = rows.filter((r) => r.plan !== "trial" && r.status === "active");
  const trials = rows.filter((r) => r.plan === "trial");
  const created30 = rows.filter((r) => now.getTime() - Date.parse(r.createdAt) < 30 * DAY);
  return {
    generatedAt: now.toISOString(),
    alerts,
    live: { runningCampaigns: (campaigns || []).filter((k) => k.status === "running").length, scheduledCampaigns: (campaigns || []).filter((k) => k.status === "scheduled").length, callsToday: todayAll.total, connectedToday: todayAll.connected, minutesToday: todayAll.minutes, answerRateToday: todayAll.answerRate, hotToday: todayAll.hot, callsLastHour: lastHour.total, failedLastHour: lastHour.failed },
    money: { mrr: paying.reduce((a, r) => a + r.mrr, 0), collectedMonth: r2((paidMonth || []).reduce((a, i) => a + Number(i.total), 0)), outstanding: r2(rows.reduce((a, r) => a + r.outstanding, 0)), overdueClients: rows.filter((r) => r.overdue).length, sarvam: sarvam ? { balance: sarvam.balance, daysLeft: sarvam.daysLeft, tracked: sarvam.tracked, perDay: sarvam.perDay, forecast30: r2(sarvam.perDay * 30) } : null },
    growth: { clients: rows.length, paying: paying.length, trials: trials.length, pending: rows.filter((r) => r.status === "pending").length, new30: created30.length, trialConversion: rows.length ? Math.round((paying.length / Math.max(1, paying.length + trials.length)) * 100) : 0, atRisk: rows.filter((r) => r.health.band === "risk").length },
    platform: {
      crons: ["billing", "sync-calls"].map((j) => ({ job: j, last: lastCron(j) })),
      razorpay: { recent: (rzpEvents || []).slice(0, 8), problems: rzpErr.length },
      emailFailures24h: (mailFails || []).length, emailConfigured: !!process.env.RESEND_API_KEY,
      sarvamCheck: diag?.[0] ? { at: diag[0].created_at, ok: !!diag[0].result?.followsInstructions } : null,
      failedLastHour: lastHour.failed, callsLastHour: lastHour.total,
    },
    clients: rows.sort((a, b) => a.health.score - b.health.score),
  };
}
