// Encrypts secrets we must store for a client (Slack webhook URLs, WhatsApp tokens, webhook signing keys) so a
// database leak alone doesn't expose them. AES-256-GCM with a key derived from SESSION_SECRET.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

function key(): Buffer {
  const s = process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_KEY;
  if (!s) throw new Error("SESSION_SECRET must be set");
  return createHash("sha256").update(`rana-integrations:${s}`).digest();
}

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${body.toString("base64url")}`;
}

export function open(sealed: string | null | undefined): string | null {
  if (!sealed) return null;
  try {
    const [v, iv, tag, body] = sealed.split(".");
    if (v !== "v1") return null;
    const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(body, "base64url")), d.final()]).toString("utf8");
  } catch { return null; }
}

/** "https://hooks.slack.com/services/T0/B0/xyz" → "hooks.slack.com/…xyz" style hint for the UI. */
export function hint(secret: string | null): string | null {
  if (!secret) return null;
  try { const u = new URL(secret); return `${u.host}/…${secret.slice(-4)}`; } catch { return `…${secret.slice(-4)}`; }
}
