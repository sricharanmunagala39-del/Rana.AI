export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { unauthorized, forbidUnless } from "@/lib/auth";
import { listAudit, AUDIT_LABEL } from "@/lib/audit";

/** GET ?before=<id> — the team's activity log, newest first. Admins and owners only. */
export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  const denied = forbidUnless(session, "admin"); if (denied) return denied;
  const before = Number(new URL(req.url).searchParams.get("before")) || undefined;
  const rows = await listAudit(session.clientId, { limit: 100, before });
  return Response.json({
    events: rows.map((r: any) => ({ ...r, label: (AUDIT_LABEL as any)[r.action] ?? r.action })),
    nextBefore: rows.length === 100 ? rows[rows.length - 1].id : null,
  });
}
