// "Forgot password?" — the person gets a one-time link by email and sets a new password themselves.
// Links last 30 minutes, work once, and only their SHA-256 is stored. Setting the new password signs the
// person out on every other device. Answers never reveal whether an email has an account.
import { createHash, randomBytes } from "crypto";
import { sb } from "./db";
import { hashPassword } from "./auth";
import { getUserByEmail, createUser, normaliseEmail, validEmail, passwordProblem, tempPassword, type UserRow } from "./users";
import { getClientByEmail, getClientById } from "./supabase";
import { sendEmail, emailHtml, APP_URL } from "./notify";
import { audit } from "./audit";
import { forgetUser } from "./session";

export const RESET_TTL_MIN = 30;
const MAX_LINKS_PER_HOUR = 3;
const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

/** Finds the person for this email. A company whose owner never signed in yet gets their personal owner login now. */
async function findPerson(email: string): Promise<UserRow | null> {
  const user = await getUserByEmail(email);
  if (user) return user;
  const client = await getClientByEmail(email);
  if (!client || !client.is_active) return null;
  return createUser({ clientId: client.id, email, name: client.name, password: tempPassword() + tempPassword(), role: "owner", mustChange: false });
}

/** Always resolves the same way for the caller; sends a link only when the account exists and is active. */
export async function requestReset(rawEmail: string, ip: string | null): Promise<void> {
  const email = normaliseEmail(rawEmail);
  if (!validEmail(email)) return;
  const user = await findPerson(email).catch(() => null);
  if (!user || !user.is_active) return;
  const client = await getClientById(user.client_id);
  if (!client || !client.is_active) return;

  const since = new Date(Date.now() - 3600e3).toISOString();
  const recent = (await sb<any[]>(`/password_resets?user_id=eq.${user.id}&created_at=gte.${encodeURIComponent(since)}&select=id`).catch(() => [])) || [];
  if (recent.length >= MAX_LINKS_PER_HOUR) return;

  const token = randomBytes(32).toString("base64url");
  await sb(`/password_resets`, {
    method: "POST", prefer: "return=minimal",
    body: JSON.stringify({ user_id: user.id, token_hash: hashToken(token), expires_at: new Date(Date.now() + RESET_TTL_MIN * 60e3).toISOString(), ip }),
  });
  const url = `${APP_URL()}/reset-password?token=${token}`;
  await sendEmail({
    to: user.email, clientId: user.client_id, kind: "password_reset",
    subject: "Reset your RANA AI password",
    html: emailHtml({
      title: "Reset your password",
      lines: [
        `Someone (hopefully you) asked to reset the password for <b>${user.email.replace(/[<>&]/g, "")}</b> on RANA AI.`,
        `Press the button to choose a new password. The link works once and expires in <b>${RESET_TTL_MIN} minutes</b>.`,
        "Didn't ask for this? Ignore this email — your password stays the same.",
      ],
      button: { label: "Choose a new password", url },
    }),
  });
  await audit({ clientId: user.client_id, email: user.email, userId: user.id }, "password_reset_requested", { detail: { ip } });
}

async function validRow(token: string) {
  if (!/^[A-Za-z0-9_-]{30,80}$/.test(String(token || ""))) return null;
  const rows = (await sb<any[]>(`/password_resets?token_hash=eq.${hashToken(token)}&select=id,user_id,expires_at,used_at&limit=1`).catch(() => [])) || [];
  const r = rows[0];
  if (!r || r.used_at || Date.parse(r.expires_at) < Date.now()) return null;
  return r;
}

/** For the reset page: is this link still good? Returns a masked email to show. */
export async function checkReset(token: string): Promise<{ ok: boolean; email?: string }> {
  const r = await validRow(token);
  if (!r) return { ok: false };
  const u = (await sb<any[]>(`/users?id=eq.${r.user_id}&select=email,is_active&limit=1`).catch(() => []))?.[0];
  if (!u?.is_active) return { ok: false };
  const [name, domain] = String(u.email).split("@");
  return { ok: true, email: `${name.slice(0, 2)}${"•".repeat(Math.max(1, Math.min(6, name.length - 2)))}@${domain}` };
}

export type ResetResult = { ok: true; email: string } | { ok: false; error: string; expired?: boolean };

/** Sets the new password. The link is spent even if the person then fails 2-step login. */
export async function completeReset(token: string, password: string, req?: Request): Promise<ResetResult> {
  const r = await validRow(token);
  if (!r) return { ok: false, expired: true, error: "This reset link has expired or was already used. Ask for a new one." };
  const problem = passwordProblem(String(password || ""));
  if (problem) return { ok: false, error: problem };
  // Spend the link first (only if still unused), so two tabs can't both use it.
  const spent = await sb<any[]>(`/password_resets?id=eq.${r.id}&used_at=is.null`, { method: "PATCH", body: JSON.stringify({ used_at: new Date().toISOString() }) }).catch(() => null);
  if (!spent?.length) return { ok: false, expired: true, error: "This reset link was already used. Ask for a new one." };
  const users = await sb<any[]>(`/users?id=eq.${r.user_id}&is_active=eq.true`, { method: "PATCH", body: JSON.stringify({ password_hash: hashPassword(password), must_change_password: false }) });
  const u = users?.[0];
  if (!u) return { ok: false, error: "This account can't be reset. Contact support@ranaai.in." };
  // Any other outstanding links for this person stop working too.
  await sb(`/password_resets?user_id=eq.${u.id}&used_at=is.null`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ used_at: new Date().toISOString() }) }).catch(() => {});
  forgetUser(u.id);
  await audit({ clientId: u.client_id, email: u.email, userId: u.id }, "password_reset_done", { req });
  await sendEmail({
    to: u.email, clientId: u.client_id, kind: "password_reset_done",
    subject: "Your RANA AI password was changed",
    html: emailHtml({
      title: "Your password was changed",
      lines: [
        "Your RANA AI password was just changed using a reset link, and every other device was signed out.",
        "If this wasn't you, reply to this email or write to <b>support@ranaai.in</b> straight away.",
      ],
      button: { label: "Sign in", url: `${APP_URL()}/login` },
    }),
  }).catch(() => {});
  return { ok: true, email: u.email };
}
