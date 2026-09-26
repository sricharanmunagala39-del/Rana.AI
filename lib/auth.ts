// Session + password helpers. No external deps — uses Node's crypto (scrypt).
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from "crypto";

const SESSION_COOKIE = "rana_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type Role = "owner" | "admin" | "manager" | "agent" | "viewer";
export const ROLES: Role[] = ["owner", "admin", "manager", "agent", "viewer"];
const RANK: Record<Role, number> = { owner: 5, admin: 4, manager: 3, agent: 2, viewer: 1 };
export const ROLE_INFO: Record<Role, { label: string; can: string }> = {
  owner: { label: "Owner", can: "Everything, including team and billing" },
  admin: { label: "Admin", can: "Employees, phone numbers, calling rules and team" },
  manager: { label: "Manager", can: "Launch and stop campaigns, work leads, export" },
  agent: { label: "Sales rep", can: "Work leads: mark outcomes, follow-ups and notes" },
  viewer: { label: "Viewer", can: "Read-only dashboards and results" },
};

/** userId is absent on sessions from the old shared client login; those act as the owner. */
export type HqRole = "founder" | "ops" | "support" | "finance";
/** hqFrom/hqRO/hqExp/hqReason: RANA HQ staff inside a client's workspace (read-only and time-limited when set). hqRole: set by getSession for HQ staff. */
export type Session = { clientId: string; email: string; exp: number; iat?: number; userId?: string; role?: Role; name?: string; hqFrom?: string; hqRO?: boolean; hqExp?: number; hqReason?: string; hqRole?: HqRole };

export function roleOf(s: Session): Role { return s.role && RANK[s.role] ? s.role : "owner"; }
export function hasRole(s: Session, min: Role): boolean { return RANK[roleOf(s)] >= RANK[min]; }
export function outranks(a: Role, b: Role): boolean { return RANK[a] >= RANK[b]; }

/** Returns a 403 response when the session's role is below `min`, else null. */
export function forbidUnless(s: Session, min: Role): Response | null {
  if (hasRole(s, min)) return null;
  return Response.json({ error: `Your role (${ROLE_INFO[roleOf(s)].label}) can't do this. Ask an ${ROLE_INFO[min].label.toLowerCase()} on your team.` }, { status: 403 });
}

/** Cookie signing secret. Set SESSION_SECRET in Vercel; falls back to the Supabase service key so nothing breaks unsigned. */
function secret(): string {
  const s = process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_KEY;
  if (!s) throw new Error("SESSION_SECRET (or SUPABASE_SERVICE_KEY) must be set");
  return s;
}
function sign(data: string): string {
  return createHmac("sha256", secret()).update(data).digest("hex");
}

export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(plain, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function isHashed(stored: string): boolean {
  return typeof stored === "string" && stored.startsWith("scrypt$");
}

/** Verifies against a scrypt hash. Legacy plaintext values still compare (so old accounts keep working)
 *  and the caller is expected to upgrade them via hashPassword() on success. */
export function verifyPassword(plain: string, stored: string): boolean {
  if (!stored) return false;
  if (!isHashed(stored)) {
    const a = Buffer.from(plain); const b = Buffer.from(stored);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  const [, salt, hash] = stored.split("$");
  const derived = scryptSync(plain, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export function createSessionCookie(clientId: string, email: string, user?: { userId: string; role: Role; name?: string | null; hqFrom?: string; hqRO?: boolean; hqExp?: number; hqReason?: string }): string {
  const now = Date.now();
  const payload: Session = { clientId, email, iat: now, exp: now + SESSION_TTL_MS, ...(user ? { userId: user.userId, role: user.role, name: user.name ?? undefined, ...(user.hqFrom ? { hqFrom: user.hqFrom, hqRO: !!user.hqRO, hqExp: user.hqExp, hqReason: user.hqReason } : {}) } : {}) };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const value = `${data}.${sign(data)}`;
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}${secure}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function parseSession(req: Request): Session | null {
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  if (!match) return null;
  try {
    const [data, sig] = match[1].split(".");
    if (!data || !sig) return null;
    const expected = Buffer.from(sign(data), "hex");
    const given = Buffer.from(sig, "hex");
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    const payload = JSON.parse(Buffer.from(data, "base64url").toString()) as Session;
    if (!payload?.clientId || payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}

export function requireSession(req: Request): Session {
  const s = parseSession(req);
  if (!s) throw new AuthError();
  return s;
}

export class AuthError extends Error {
  status = 401;
  constructor() { super("Not authenticated"); }
}

export function unauthorized() {
  return Response.json({ error: "Not authenticated" }, { status: 401 });
}
