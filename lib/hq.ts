// RANA HQ access. Founders = emails in RANA_HQ_EMAILS (can never be locked out from inside the app).
// HQ staff = users of the internal "RANA HQ" workspace with an hq_role, added by a founder on /hq/team.
import type { Session, HqRole } from "./auth";

export function hqEmails(): string[] {
  return String(process.env.RANA_HQ_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}
export function isHqEmail(email: string | null | undefined): boolean {
  return !!email && hqEmails().includes(String(email).toLowerCase());
}

export type HqPerm = "view" | "clients" | "open" | "billing" | "money" | "team" | "ai";
export const HQ_ROLES: Record<HqRole, { label: string; can: string; perms: HqPerm[] }> = {
  founder: { label: "Founder", can: "Everything", perms: ["view", "clients", "open", "billing", "money", "team", "ai"] },
  ops: { label: "Operations", can: "Create and manage clients, open workspaces, invoices", perms: ["view", "clients", "open", "billing", "ai"] },
  support: { label: "Support", can: "See clients, open workspaces read-only", perms: ["view", "open"] },
  finance: { label: "Finance", can: "Money page, invoices, mark payments", perms: ["view", "billing", "money"] },
};
export function hqCan(s: Session | null, perm: HqPerm = "view"): boolean {
  return !!s?.hqRole && !s.hqFrom && HQ_ROLES[s.hqRole].perms.includes(perm);
}
/** HQ session (not inside a client's workspace) whose role allows `perm`. */
export function requireHq(s: Session | null, perm: HqPerm = "view"): Response | null {
  if (!s) return Response.json({ error: "Not authenticated" }, { status: 401 });
  if (s.hqFrom) return Response.json({ error: "You're inside a client's workspace. Go back to HQ first." }, { status: 409 });
  if (!s.hqRole) return Response.json({ error: "RANA HQ only." }, { status: 403 });
  if (!HQ_ROLES[s.hqRole].perms.includes(perm)) return Response.json({ error: `Your HQ role (${HQ_ROLES[s.hqRole].label}) can't do this.` }, { status: 403 });
  return null;
}
