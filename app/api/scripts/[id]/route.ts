// @ts-nocheck
export const runtime = "nodejs";
import { getScriptById, updateScript, deleteScript } from "@/lib/supabase";
import { parseSession } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { forbidUnless } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { claimResource } from "@/lib/ownership";
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const script = await getScriptById(params.id);
  if (!script || script.client_id !== session.clientId) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ script });
}
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const denied = forbidUnless(session, "admin"); if (denied) return denied;
  const existing = await getScriptById(params.id);
  if (!existing || existing.client_id !== session.clientId) return Response.json({ error: "Not found" }, { status: 404 });
  const patch = await req.json();
  // Fields only the server sets. cartesia_agent_id especially: pointing it at someone else's agent would pull their calls.
  for (const k of ["id", "client_id", "status", "cartesia_agent_id", "published_at", "created_at"]) delete patch[k];
  const updated = await updateScript(params.id, patch);
  return Response.json({ script: updated });
}
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const denied = forbidUnless(session, "admin"); if (denied) return denied;
  const existing = await getScriptById(params.id);
  if (!existing || existing.client_id !== session.clientId) return Response.json({ error: "Not found" }, { status: 404 });
  if (existing.status === "active") return Response.json({ error: "Cannot delete the active script." }, { status: 400 });
  await deleteScript(params.id);
  await audit(session, "employee_deleted", { req, targetType: "employee", targetId: params.id, detail: { name: existing.name } });
  return Response.json({ ok: true });
}
