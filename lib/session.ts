// Live session check for API routes. The cookie proves who you were when you logged in; this also
// checks the person is still active and picks up their current role, so removing someone or changing
// their role takes effect on their next request instead of when their 7-day cookie runs out.
import { parseSession, SESSION_TTL_MS, type Session, type Role, type HqRole } from "./auth";
import { sb } from "./db";
import { isHqEmail } from "./hq";

type Live = { active: boolean; role: Role; name: string | null; clientId: string; hqRole: HqRole | null; isHqClient: boolean; pwAt: number; at: number };
const seen = new Map<string, number>();
const SEEN_EVERY_MS = 5 * 60_000;
const cache = new Map<string, Live>();
const hqClients = new Map<string, { hq: boolean; at: number }>();
const TTL_MS = 20_000;

export function forgetUser(userId: string) { cache.delete(userId); }

/** "Last active" for HQ's sign-in page: written at most every 5 minutes per person. Never blocks the request. */
function noteSeen(userId: string) {
  const last = seen.get(userId) || 0;
  if (Date.now() - last < SEEN_EVERY_MS) return;
  seen.set(userId, Date.now());
  sb(`/users?id=eq.${userId}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ last_seen_at: new Date().toISOString() }) }).catch(() => {});
}

export async function isHqClient(id: string): Promise<boolean> {
  const c = hqClients.get(id);
  if (c && Date.now() - c.at < 300_000) return c.hq;
  const r = await sb<any[]>(`/clients?id=eq.${id}&select=is_hq&limit=1`).catch(() => null);
  const hq = !!r?.[0]?.is_hq;
  if (r) hqClients.set(id, { hq, at: Date.now() });
  return hq;
}

export async function getSession(req: Request): Promise<Session | null> {
  const s = parseSession(req);
  if (!s) return null;
  if (!s.userId) return s; // old shared client login — acts as owner until they sign in with a personal account
  let live = cache.get(s.userId);
  if (!live || Date.now() - live.at > TTL_MS) {
    try {
      const rows = await sb<any[]>(`/users?id=eq.${s.userId}&select=is_active,role,name,client_id,hq_role,password_changed_at,last_seen_at&limit=1`);
      const u = rows?.[0];
      live = u
        ? { active: !!u.is_active, role: u.role, name: u.name ?? null, clientId: u.client_id, hqRole: u.hq_role ?? null, isHqClient: await isHqClient(u.client_id), pwAt: u.password_changed_at ? Date.parse(u.password_changed_at) : 0, at: Date.now() }
        : { active: false, role: "viewer", name: null, clientId: s.clientId, hqRole: null, isHqClient: false, pwAt: 0, at: Date.now() };
      if (u?.last_seen_at && !seen.has(s.userId)) seen.set(s.userId, Date.parse(u.last_seen_at));
      cache.set(s.userId, live);
    } catch {
      // Database blip: let people keep reading with the signed cookie, but never allow writes on stale roles.
      return req.method === "GET" || req.method === "HEAD" ? { ...s, role: "viewer" } : null;
    }
  }
  // Password changed after this cookie was issued (reset link, change, admin reset) → signed out here.
  const issued = s.iat ?? s.exp - SESSION_TTL_MS;
  if (live.pwAt && live.pwAt > issued + 5000) { cache.delete(s.userId); return null; }
  noteSeen(s.userId);
  // Founders (env list) are always HQ; other HQ staff need an hq_role on the HQ workspace.
  const hqRole: HqRole | undefined = live.isHqClient ? (isHqEmail(s.email) ? "founder" : live.hqRole ?? undefined) : undefined;
  // RANA HQ inside a client's workspace: still HQ staff, and within the time limit.
  if (s.hqFrom) {
    if (!live.active || live.clientId !== s.hqFrom || !hqRole) return null;
    if (s.hqExp && s.hqExp < Date.now()) return null;
    return { ...s, role: s.hqRO ? "viewer" : "owner", name: live.name ?? s.name };
  }
  if (!live.active || live.clientId !== s.clientId) return null;
  return { ...s, role: live.role, name: live.name ?? s.name, hqRole };
}
