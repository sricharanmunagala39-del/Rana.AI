export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { requireHq } from "@/lib/hq";
import { hotCallsNotInCrm, importHotCalls } from "@/lib/crm";

/** GET → hot / ready-to-close calls on RANA's own line whose number isn't in the CRM yet. */
export async function GET(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session, "view"); if (denied) return denied;
  const list = await hotCallsNotInCrm().catch(() => []);
  return Response.json({ count: list.length, calls: list.slice(0, 50).map((c) => ({ id: c.id, phone: c.phone, name: c.caller_name, status: c.lead_status, summary: String(c.summary || "").slice(0, 300), at: c.created_at })) });
}

/** POST → add them all to New (source: AI sales call). */
export async function POST(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session, "view"); if (denied) return denied;
  const added = await importHotCalls(session!.email);
  return Response.json({ ok: true, added });
}
