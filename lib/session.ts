// Live session check for API routes. The cookie proves who you were when you logged in; this also
// checks the person is still active and picks up their current role, so removing someone or changing
// their role takes effect on their next request instead of when their 7-day cookie runs out.
import { parseSession, type Session, type Role, type HqRole } from "./auth";
import { sb } from "./db";
import { isHqEmail } from "./hq";

type Live = { active: boolean; role: Role; name: string | null; clientId: string; hqRole: HqRole | null; isHqClient: boolean; at: number };
const cache = new Map<string, Live>();
const hqClients = new Map<string, { hq: boolean; at: number }>();
const TTL_MS = 20_000;

export function forgetUser(userId: string) { cache.delete(userId); }

async function isHqClient(id: string): Promise<boolean> {
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
      const rows = await sb<any[]>(`/users?id=eq.${s.userId}&select=is_active,role,name,client_id,hq_role&limit=1`);
      const u = rows?.[0];
      live = u
        ? { active: !!u.is_active, role: u.role, name: u.name ?? null, clientId: u.client_id, hqRole: u.hq_role ?? null, isHqClient: await isHqClient(u.client_id), at: Date.now() }
        : { active: false, role: "viewer", name: null, clientId: s.clientId, hqRole: null, isHqClient: false, at: Date.now() };
      cache.set(s.userId, live);
    } catch {
      return s; // database blip: fall back to the signed cookie rather than logging everyone out
    }
  }
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
