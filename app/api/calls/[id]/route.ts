export const runtime = "nodejs";
import { unauthorized, forbidUnless } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getCall, updateCall } from "@/lib/calls";
import { getSession } from "@/lib/session";

const LEADS = ["new", "cold", "warm", "hot", "ready_to_close", "not_interested", "no_answer"];

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  const call = await getCall(session.clientId, params.id);
  if (!call) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ call });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  const denied = forbidUnless(session, "agent"); if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const patch: any = {};
  if (body.lead_status && LEADS.includes(body.lead_status)) {
    patch.lead_status = body.lead_status;
    patch.lead_reason = "Set manually by your team.";
  }
  if (typeof body.follow_up === "boolean") patch.follow_up = body.follow_up;
  if (typeof body.notes === "string") patch.notes = body.notes;
  if (typeof body.caller_name === "string") patch.caller_name = body.caller_name.trim();
  if (!Object.keys(patch).length) return Response.json({ error: "Nothing to update" }, { status: 400 });
  const call = await updateCall(session.clientId, params.id, patch);
  if (!call) return Response.json({ error: "Not found" }, { status: 404 });
  await audit(session, "lead_updated", { req, targetType: "call", targetId: params.id, detail: { ...patch, notes: patch.notes != null ? "(edited)" : undefined } });
  return Response.json({ call });
}
