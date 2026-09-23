// @ts-nocheck
export const runtime = "nodejs";
import { getScriptById, updateScript, deleteScript } from "@/lib/supabase";
import { parseSession } from "../../auth/me/route";
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = parseSession(req);
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const script = await getScriptById(params.id);
  if (!script || script.client_id !== session.clientId) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ script });
}
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = parseSession(req);
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const existing = await getScriptById(params.id);
  if (!existing || existing.client_id !== session.clientId) return Response.json({ error: "Not found" }, { status: 404 });
  const patch = await req.json();
  delete patch.client_id;
  delete patch.status;
  const updated = await updateScript(params.id, patch);
  return Response.json({ script: updated });
}
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = parseSession(req);
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const existing = await getScriptById(params.id);
  if (!existing || existing.client_id !== session.clientId) return Response.json({ error: "Not found" }, { status: 404 });
  if (existing.status === "active") return Response.json({ error: "Cannot delete the active script." }, { status: 400 });
  await deleteScript(params.id);
  return Response.json({ ok: true });
}
