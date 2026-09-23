export const runtime = "nodejs";
import { parseSession, unauthorized } from "@/lib/auth";
import { getCall, updateCall } from "@/lib/calls";

const LEADS = ["new", "cold", "warm", "hot", "ready_to_close", "not_interested", "no_answer"];

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = parseSession(req);
  if (!session) return unauthorized();
  const call = await getCall(session.clientId, params.id);
  if (!call) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ call });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = parseSession(req);
  if (!session) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const patch: any = {};
  if (body.lead_status && LEADS.includes(body.lead_status)) patch.lead_status = body.lead_status;
  if (typeof body.notes === "string") patch.notes = body.notes;
  if (typeof body.caller_name === "string") patch.caller_name = body.caller_name.trim();
  if (!Object.keys(patch).length) return Response.json({ error: "Nothing to update" }, { status: 400 });
  const call = await updateCall(session.clientId, params.id, patch);
  if (!call) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ call });
}
