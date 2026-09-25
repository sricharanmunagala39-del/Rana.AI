// Personal logins. Each client (company) has any number of users, each with one role.
import { randomBytes } from "crypto";
import { sb } from "./db";
import { hashPassword, type Role } from "./auth";

export type UserRow = {
  id: string; client_id: string; email: string; name: string | null; password_hash: string; role: Role;
  is_active: boolean; must_change_password: boolean; invited_by: string | null; last_login_at: string | null; created_at: string;
};
export type PublicUser = Omit<UserRow, "password_hash">;

export function publicUser(u: UserRow): PublicUser {
  // Never send password hashes or two-step secrets to the browser.
  const { password_hash: _drop, totp_secret: _t, ...rest } = u as any;
  return rest;
}

export function normaliseEmail(e: string): string { return String(e || "").trim().toLowerCase(); }
export function validEmail(e: string): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e); }

/** Readable one-time password: 3 groups, no look-alike characters. */
export function tempPassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(12);
  let s = "";
  for (let i = 0; i < 12; i++) { s += alphabet[bytes[i] % alphabet.length]; if (i === 3 || i === 7) s += "-"; }
  return s;
}

export function passwordProblem(p: string): string | null {
  if (!p || p.length < 10) return "Use at least 10 characters.";
  if (!/[a-zA-Z]/.test(p) || !/\d/.test(p)) return "Mix letters and numbers.";
  return null;
}

export async function getUserByEmail(email: string): Promise<UserRow | null> {
  const r = await sb<UserRow[]>(`/users?email=eq.${encodeURIComponent(normaliseEmail(email))}&limit=1`);
  return r?.[0] ?? null;
}
export async function getUser(clientId: string, id: string): Promise<UserRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const r = await sb<UserRow[]>(`/users?id=eq.${id}&client_id=eq.${clientId}&limit=1`);
  return r?.[0] ?? null;
}
export async function listUsers(clientId: string): Promise<PublicUser[]> {
  const r = await sb<UserRow[]>(`/users?client_id=eq.${clientId}&order=created_at.asc`);
  return (r || []).map(publicUser);
}
export async function countActiveOwners(clientId: string): Promise<number> {
  const r = await sb<any[]>(`/users?client_id=eq.${clientId}&role=eq.owner&is_active=eq.true&select=id`);
  return r?.length ?? 0;
}
export async function createUser(data: { clientId: string; email: string; name?: string | null; password: string; role: Role; invitedBy?: string | null; mustChange?: boolean }): Promise<UserRow> {
  const r = await sb<UserRow[]>(`/users`, {
    method: "POST",
    body: JSON.stringify({
      client_id: data.clientId, email: normaliseEmail(data.email), name: data.name?.trim() || null,
      password_hash: hashPassword(data.password), role: data.role, invited_by: data.invitedBy ?? null,
      must_change_password: data.mustChange ?? true,
    }),
  });
  return r[0];
}
export async function updateUser(id: string, patch: Partial<UserRow>): Promise<UserRow | null> {
  const r = await sb<UserRow[]>(`/users?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(patch) });
  return r?.[0] ?? null;
}
