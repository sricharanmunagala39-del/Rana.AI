// @ts-nocheck
export const runtime = "nodejs";
import { getScriptById, updateScript, deleteScript } from "@/lib/supabase";
import { parseSession } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { forbidUnless } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { claimResource } from "@/lib/ownership";
import { isForeignVoice } from "@/lib/voiceClone";
import { normalizePlaybook, normalizeLinks, normalizePronunciations, normalizePolicy } from "@/lib/playbook";
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
  if (await isForeignVoice(session.clientId, patch.speaker)) return Response.json({ error: "That voice isn't available to your account." }, { status: 403 });
  // Studio fields: always stored in their clean shape.
  if ("playbook" in patch) patch.playbook = patch.playbook ? normalizePlaybook(patch.playbook) : null;
  if ("links" in patch) patch.links = normalizeLinks(patch.links);
  if ("pronunciations" in patch) patch.pronunciations = normalizePronunciations(patch.pronunciations);
  if ("language_policy" in patch) patch.language_policy = normalizePolicy(patch.language_policy, patch.starting_language || existing.starting_language);
  if ("keyterms" in patch) patch.keyterms = (Array.isArray(patch.keyterms) ? patch.keyterms : []).map((k: any) => String(k).slice(0, 60)).filter(Boolean).slice(0, 100);
  if ("engine" in patch) patch.engine = patch.engine === "cartesia" ? "cartesia" : "sarvam";
  if ("source_script" in patch) patch.source_script = String(patch.source_script || "").slice(0, 60000);
  // Anything other than test sign-off changes what the agent says → the published agent is now out of date.
  const testOnly = ["test_checklist", "test_notes", "tested_at"];
  delete patch.edited_at;
  if (Object.keys(patch).some((k) => !testOnly.includes(k))) patch.edited_at = new Date().toISOString();
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
