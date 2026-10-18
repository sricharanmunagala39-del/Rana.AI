export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { requireHq, hqCan } from "@/lib/hq";
import { sb } from "@/lib/db";
import { leadDetail, isId } from "@/lib/leadflow";

/** GET → one LeadFlow lead with its enrollments, messages sent, replies and activity timeline. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  const denied = requireHq(session, "view"); if (denied) return denied;
  if (!isId(params.id)) return Response.json({ error: "Not found" }, { status: 404 });
  const d = await leadDetail(Number(params.id));
  if (!d) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ...d, canAct: hqCan(session, "clients") });
}

/** PATCH { pSubject, pBody } → edit the personal first email (sent as step 1). Founders + Operations. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  const denied = requireHq(session, "clients"); if (denied) return denied;
  if (!isId(params.id)) return Response.json({ error: "Not found" }, { status: 404 });
  const b = await req.json().catch(() => ({} as any));
  const patch: Record<string, any> = {};
  if ("pSubject" in b) patch.p_subject = String(b.pSubject ?? "").slice(0, 300) || null;
  if ("pBody" in b) patch.p_body = String(b.pBody ?? "").slice(0, 10_000) || null;
  if (!Object.keys(patch).length) return Response.json({ error: "Nothing to change" }, { status: 400 });
  patch.updated_at = new Date().toISOString();
  const [lead] = (await sb<any[]>(`/leadflow_leads?id=eq.${params.id}`, { method: "PATCH", body: JSON.stringify(patch) })) || [];
  if (!lead) return Response.json({ error: "Not found" }, { status: 404 });
  await sb(`/leadflow_activities`, { method: "POST", prefer: "return=minimal", body: JSON.stringify({ lead_id: lead.id, kind: "edit", text: `Personal first email edited by ${session!.email}` }) }).catch(() => {});
  return Response.json({ ok: true, lead });
}
