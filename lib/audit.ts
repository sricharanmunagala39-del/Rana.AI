// Append-only record of sensitive actions: who did what, to which thing, when, from where.
import type { Session } from "./auth";
import { sb } from "./db";

export type AuditAction =
  | "login" | "login_failed" | "password_changed" | "password_reset_requested" | "password_reset_done"
  | "user_invited" | "user_role_changed" | "user_deactivated" | "user_reactivated" | "user_password_reset"
  | "number_provisioned" | "number_imported" | "number_released" | "number_assigned" | "number_test_call"
  | "employee_published" | "employee_deleted"
  | "campaign_launched" | "campaign_cancelled" | "campaign_retried" | "campaign_exported"
  | "lead_updated" | "dnc_added" | "dnc_removed" | "calling_rules_changed"
  | "voice_cloned" | "voice_deleted"
  | "hq_client_created" | "hq_client_updated" | "hq_workspace_opened" | "hq_owner_password_reset"
  | "billing_details_changed" | "invoice_created" | "invoice_paid" | "invoice_voided";

export const AUDIT_LABEL: Record<AuditAction, string> = {
  login: "Signed in", login_failed: "Failed sign-in", password_changed: "Changed their password",
  password_reset_requested: "Asked for a password reset link", password_reset_done: "Reset their password with an email link",
  user_invited: "Invited a teammate", user_role_changed: "Changed a teammate's role",
  user_deactivated: "Removed a teammate's access", user_reactivated: "Restored a teammate's access",
  user_password_reset: "Reset a teammate's password",
  number_provisioned: "Added a phone number", number_imported: "Imported a Twilio number",
  number_released: "Released a phone number", number_assigned: "Changed who answers a number",
  number_test_call: "Placed a test call",
  employee_published: "Published an employee", employee_deleted: "Deleted an employee",
  campaign_launched: "Launched a campaign", campaign_cancelled: "Stopped a campaign",
  campaign_retried: "Re-dialled a campaign", campaign_exported: "Downloaded campaign results",
  lead_updated: "Changed a lead", dnc_added: "Added to do-not-call", dnc_removed: "Removed from do-not-call",
  calling_rules_changed: "Changed calling rules",
  voice_cloned: "Cloned a voice", voice_deleted: "Deleted a cloned voice",
  hq_client_created: "RANA created this workspace", hq_client_updated: "RANA changed the plan or limits",
  hq_workspace_opened: "RANA support opened this workspace", hq_owner_password_reset: "RANA reset the owner's password",
  billing_details_changed: "Changed billing details", invoice_created: "An invoice was issued",
  invoice_paid: "An invoice was paid", invoice_voided: "An invoice was cancelled",
};

function ipOf(req?: Request): string | null {
  if (!req) return null;
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || null;
}

/** Never throws: a failed audit write must not break the action it describes. */
export async function audit(
  who: Session | { clientId: string; email?: string | null; userId?: string | null },
  action: AuditAction,
  opts: { req?: Request; targetType?: string; targetId?: string | null; detail?: Record<string, unknown> } = {},
): Promise<void> {
  try {
    await sb(`/audit_log`, {
      method: "POST", prefer: "return=minimal",
      body: JSON.stringify({
        client_id: who.clientId,
        user_id: (who as any).userId ?? null,
        user_email: (who as any).email ?? null,
        action,
        target_type: opts.targetType ?? null,
        target_id: opts.targetId ?? null,
        detail: opts.detail ?? {},
        ip: ipOf(opts.req),
      }),
    });
  } catch (e: any) {
    console.error("[audit] write failed", action, e?.message);
  }
}

export async function listAudit(clientId: string, opts: { limit?: number; before?: number } = {}) {
  const limit = Math.min(200, Math.max(1, opts.limit ?? 100));
  const before = opts.before ? `&id=lt.${opts.before}` : "";
  return sb<any[]>(`/audit_log?client_id=eq.${clientId}${before}&order=id.desc&limit=${limit}`);
}
