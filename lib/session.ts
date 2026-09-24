// Live session check for API routes. The cookie proves who you were when you logged in; this also
// checks the person is still active and picks up their current role, so removing someone or changing
// their role takes effect on their next request instead of when their 7-day cookie runs out.
import { parseSession, type Session, type Role } from "./auth";
import { sb } from "./db";
import { isHqEmail } from "./hq";

type Live = { active: boolean; role: Role; name: string | null; clientId: string; at: number };
const cache = new Map<string, Live>();
const TTL_MS = 20_000;

export function forgetUser(userId: string) { cache.delete(userId); }

export async function getSession(req: Request): Promise<Session | null> {
  const s = parseSession(req);
  if (!s) return null;
  if (!s.userId) return s; // old shared client login — acts as owner until they sign in with a personal account
  let live = cache.get(s.userId);
  if (!live || Date.now() - live.at > TTL_MS) {
    try {
      const rows = await sb<any[]>(`/users?id=eq.${s.userId}&select=is_active,role,name,client_id&limit=1`);
      const u = rows?.[0];
      live = u
        ? { active: !!u.is_active, role: u.role, name: u.name ?? null, clientId: u.client_id, at: Date.now() }
        : { active: false, role: "viewer", name: null, clientId: s.clientId, at: Date.now() };
      cache.set(s.userId, live);
    } catch {
      return s; // database blip: fall back to the signed cookie rather than logging everyone out
    }
  }
  // RANA HQ inside a client's workspace: the person still belongs to HQ, and must still be on the HQ list.
  if (s.hqFrom) {
    if (!live.active || live.clientId !== s.hqFrom || !isHqEmail(s.email)) return null;
    return { ...s, role: "owner", name: live.name ?? s.name };
  }
  if (!live.active || live.clientId !== s.clientId) return null;
  return { ...s, role: live.role, name: live.name ?? s.name };
}
