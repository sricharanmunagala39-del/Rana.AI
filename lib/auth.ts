// Session + password helpers. No external deps — uses Node's crypto (scrypt).
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from "crypto";

const SESSION_COOKIE = "rana_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type Session = { clientId: string; email: string; exp: number };

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

export function createSessionCookie(clientId: string, email: string): string {
  const payload: Session = { clientId, email, exp: Date.now() + SESSION_TTL_MS };
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
