export const runtime = "nodejs";
import { parseSession, unauthorized } from "@/lib/auth";
import { getScriptById } from "@/lib/supabase";
import { deleteCartesiaPhoneNumber, assignPhoneNumberAgent } from "@/lib/cartesia";
import { getSession } from "@/lib/session";
import { forbidUnless } from "@/lib/auth";
import { ownsResource, releaseResource } from "@/lib/ownership";
import { audit } from "@/lib/audit";

const NOT_YOURS = () => Response.json({ error: "Phone number not found" }, { status: 404 });

/** PATCH { scriptId | null } — deploy an employee on this number for inbound calls (null = stop answering). */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  const denied = forbidUnless(session, "admin"); if (denied) return denied;
  if (!process.env.CARTESIA_API_KEY) return Response.json({ error: "CARTESIA_API_KEY is not set." }, { status: 500 });
  if (!(await ownsResource(session.clientId, "phone_number", params.id))) return NOT_YOURS();
  const { scriptId } = await req.json().catch(() => ({}));
  let agentId: string | null = null;
  if (scriptId) {
    const script = await getScriptById(scriptId);
    if (!script || script.client_id !== session.clientId) return Response.json({ error: "Employee not found" }, { status: 404 });
    if (!script.cartesia_agent_id) return Response.json({ error: `${script.name} isn't published yet.` }, { status: 400 });
    if (!(script as any).tested_at) return Response.json({ error: `${script.name} hasn't been signed off yet — test it on the Talk page first.` }, { status: 400 });
    agentId = script.cartesia_agent_id;
  }
  try {
    const updated = await assignPhoneNumberAgent(params.id, agentId);
    await audit(session, "number_assigned", { req, targetType: "phone_number", targetId: params.id, detail: { scriptId: scriptId ?? null } });
    return Response.json({ ok: true, number: { id: updated?.id ?? params.id, agentId: updated?.agent?.id ?? agentId } });
  } catch (err: any) {
    return Response.json({ error: err?.message || "Cartesia rejected the change" }, { status: 502 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  const denied = forbidUnless(session, "admin"); if (denied) return denied;
  if (!process.env.CARTESIA_API_KEY) {
    return Response.json({ error: "CARTESIA_API_KEY is not set." }, { status: 500 });
  }
  if (!(await ownsResource(session.clientId, "phone_number", params.id))) return NOT_YOURS();
  try {
    await deleteCartesiaPhoneNumber(params.id);
    await releaseResource(session.clientId, "phone_number", params.id);
    await audit(session, "number_released", { req, targetType: "phone_number", targetId: params.id });
    return Response.json({ ok: true });
  } catch (err: any) {
    return Response.json({ error: err?.message || "Failed to release this number" }, { status: 500 });
  }
}
