export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { requireHq } from "@/lib/hq";
import { sb, sbAll } from "@/lib/db";

const ACTIONS = ["login", "login_failed", "password_changed", "password_reset_requested", "password_reset_done", "user_password_reset", "hq_owner_password_reset"];
const istDay = (t: string | number) => new Date(new Date(t).getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);

/**
 * GET ?days=1|7|30 — RANA HQ → Sign-ins: who signs in to RANA, how often, from where, failed attempts and
 * password resets, across every client. "Active now" = used RANA in the last 15 minutes.
 */
export async function GET(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session, "view"); if (denied) return denied;
  const days = [1, 7, 30, 90].includes(Number(new URL(req.url).searchParams.get("days"))) ? Number(new URL(req.url).searchParams.get("days")) : 7;
  const since = days === 1 ? new Date(new Date(istDay(Date.now()) + "T00:00:00+05:30")) : new Date(Date.now() - days * 86400e3);

  const [events, users, clients] = await Promise.all([
    sbAll<any>(`/audit_log?action=in.(${ACTIONS.join(",")})&created_at=gte.${encodeURIComponent(since.toISOString())}&select=id,client_id,user_id,user_email,action,ip,detail,created_at&order=created_at.desc`, 20000).catch(() => []),
    sb<any[]>(`/users?select=id,client_id,email,name,role,is_active,last_login_at,last_seen_at,totp_enabled,hq_role,created_at&order=created_at.asc`).catch(() => []),
    sb<any[]>(`/clients?select=id,name,is_hq,plan,is_active`).catch(() => []),
  ]);
  const company = new Map((clients || []).map((c: any) => [c.id, c]));
  const now = Date.now();
  const activeCutoff = now - 15 * 60e3;

  const byUser = new Map<string, any>();
  for (const u of users || []) {
    const c: any = company.get(u.client_id) || {};
    byUser.set(u.id, {
      id: u.id, name: u.name, email: u.email, role: u.role, active: u.is_active, twoStep: !!u.totp_enabled,
      company: c.name || "—", companyId: u.client_id, isHq: !!c.is_hq, plan: c.plan || null,
      lastLogin: u.last_login_at, lastSeen: u.last_seen_at, activeNow: !!u.last_seen_at && Date.parse(u.last_seen_at) > activeCutoff,
      signIns: 0, failed: 0, resets: 0, lastIp: null as string | null, ips: new Set<string>(),
    });
  }
  const unknownFails = new Map<string, { email: string; n: number; last: string; ips: Set<string> }>();
  const perDay = new Map<string, { day: string; signIns: number; failed: number; people: Set<string> }>();
  const dayRow = (t: string) => { const d = istDay(t); if (!perDay.has(d)) perDay.set(d, { day: d, signIns: 0, failed: 0, people: new Set() }); return perDay.get(d)!; };

  for (const e of events) {
    const u = e.user_id ? byUser.get(e.user_id) : null;
    if (e.action === "login") {
      const d = dayRow(e.created_at); d.signIns++; d.people.add(e.user_id || e.user_email);
      if (u) { u.signIns++; if (!u.lastIp && e.ip) u.lastIp = e.ip; if (e.ip) u.ips.add(e.ip); }
    } else if (e.action === "login_failed") {
      dayRow(e.created_at).failed++;
      if (u) u.failed++;
      else {
        const k = String(e.user_email || "?");
        const f = unknownFails.get(k) || { email: k, n: 0, last: e.created_at, ips: new Set<string>() };
        f.n++; if (e.ip) f.ips.add(e.ip); unknownFails.set(k, f);
      }
    } else if (u && (e.action === "password_reset_done" || e.action === "password_changed")) u.resets++;
  }

  const people = Array.from(byUser.values())
    .map((u) => ({ ...u, ips: u.ips.size }))
    .sort((a, b) => (Date.parse(b.lastSeen || b.lastLogin || 0) || 0) - (Date.parse(a.lastSeen || a.lastLogin || 0) || 0));
  const signIns = events.filter((e: any) => e.action === "login");
  const failed = events.filter((e: any) => e.action === "login_failed");
  // Many failures on one account in the window = someone guessing, or a person who needs a reset link.
  const watch = people.filter((p) => p.failed >= 5).map((p) => ({ email: p.email, company: p.company, failed: p.failed }))
    .concat(Array.from(unknownFails.values()).filter((f) => f.n >= 3).map((f) => ({ email: f.email, company: "No such account", failed: f.n })));

  const days_ = Array.from(perDay.values()).sort((a, b) => a.day.localeCompare(b.day)).map((d) => ({ day: d.day, signIns: d.signIns, failed: d.failed, people: d.people.size }));
  const recent = events.slice(0, 60).map((e: any) => {
    const u = e.user_id ? byUser.get(e.user_id) : null;
    return { at: e.created_at, action: e.action, email: e.user_email, name: u?.name || null, company: (company.get(e.client_id) as any)?.name || "—", ip: e.ip, twoStep: !!e.detail?.twoStep };
  });

  return Response.json({
    days,
    totals: {
      signIns: signIns.length,
      people: new Set(signIns.map((e: any) => e.user_id || e.user_email)).size,
      failed: failed.length,
      resets: events.filter((e: any) => e.action === "password_reset_done").length,
      resetLinks: events.filter((e: any) => e.action === "password_reset_requested").length,
      activeNow: people.filter((p) => p.activeNow).length,
      accounts: people.filter((p) => p.active).length,
      twoStep: people.filter((p) => p.active && p.twoStep).length,
      neverSignedIn: people.filter((p) => p.active && !p.lastLogin).length,
    },
    perDay: days_, people, watch, recent,
  });
}
