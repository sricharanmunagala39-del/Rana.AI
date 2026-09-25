// Time-based one-time codes (RFC 6238, the Google Authenticator / Microsoft Authenticator standard), no dependencies.
import crypto from "crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, value = 0; const out: number[] = [];
  for (const ch of clean) { value = (value << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
export function newSecret(): string { return base32Encode(crypto.randomBytes(20)); }

export function hotp(secret: string, counter: number): string {
  const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac("sha1", base32Decode(secret)).update(buf).digest();
  const o = h[h.length - 1] & 15;
  const code = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(code % 1_000_000).padStart(6, "0");
}
export function totp(secret: string, at = Date.now()): string { return hotp(secret, Math.floor(at / 30000)); }
/** Accepts the current code and one step either side (clock drift). */
export function verifyTotp(secret: string, code: string, at = Date.now()): boolean {
  const c = String(code || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return false;
  const step = Math.floor(at / 30000);
  return [-1, 0, 1].some((d) => { const want = hotp(secret, step + d); return crypto.timingSafeEqual(Buffer.from(want), Buffer.from(c)); });
}
export function otpauthUrl(secret: string, email: string): string {
  return `otpauth://totp/${encodeURIComponent(`RANA AI:${email}`)}?secret=${secret}&issuer=${encodeURIComponent("RANA AI")}&digits=6&period=30`;
}

// Short-lived signed ticket between "password OK" and "code OK".
const key = () => process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_KEY || "dev";
export function makeTicket(userId: string): string {
  const data = Buffer.from(JSON.stringify({ uid: userId, exp: Date.now() + 5 * 60_000 })).toString("base64url");
  return `${data}.${crypto.createHmac("sha256", key()).update("2fa:" + data).digest("hex")}`;
}
export function readTicket(t: string): string | null {
  const [data, sig] = String(t || "").split(".");
  if (!data || !sig) return null;
  const want = crypto.createHmac("sha256", key()).update("2fa:" + data).digest("hex");
  if (want.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return null;
  try { const p = JSON.parse(Buffer.from(data, "base64url").toString()); return p.exp > Date.now() ? p.uid : null; } catch { return null; }
}
