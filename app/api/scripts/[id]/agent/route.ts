export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { hqCan } from "@/lib/hq";
import { audit } from "@/lib/audit";
import { getScriptById, updateScript } from "@/lib/supabase";
import { parseAgentRef } from "@/lib/sarvamAgent";

/**
 * A ready-made R1 agent for one employee (HQ only). When set, every call for this employee — web tests, test calls,
 * campaigns — goes to that agent and uses its own script, greeting and voice; RANA's compiled script isn't sent.
 * GET → { allowed, agent }   PATCH { agent: "AGENT-ID@version" | "" }
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const script: any = await getScriptById(params.id);
  if (!script || script.client_id !== session.clientId) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ allowed: hqCan(session, "clients"), agent: script.engine_agent || "" });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  if (!hqCan(session, "clients")) return Response.json({ error: "RANA HQ only." }, { status: 403 });
  const script: any = await getScriptById(params.id);
  if (!script || script.client_id !== session.clientId) return Response.json({ error: "Not found" }, { status: 404 });
  const b = await req.json().catch(() => ({} as any));
  const raw = String(b.agent || "").trim().replace(/^sarvam:/, "").replace(/^.*\/update-agent\//, "").replace(/\/.*$/, "");
  const ref = raw ? parseAgentRef(raw) : null;
  if (raw && !ref) return Response.json({ error: "That doesn't look like an agent ID, e.g. RV-Kabir-fe3a0273-0904@3" }, { status: 400 });
  if (raw && !/@\d+$/.test(raw)) return Response.json({ error: "Add the committed version after @, e.g. RV-Kabir-fe3a0273-0904@3" }, { status: 400 });
  const agent = ref ? `${ref.appId}@${ref.appVersion}` : null;
  const patch: any = { engine_agent: agent };
  // A ready-made agent carries its own script, so the employee is ready to test straight away.
  if (agent && !script.published_at) { patch.published_at = new Date().toISOString(); patch.engine = "sarvam"; }
  if (agent && !String(script.instructions || "").trim()) patch.instructions = "(This employee uses a ready-made agent with its own script.)";
  const updated = await updateScript(params.id, patch);
  await audit(session, "employee_published", { req, targetType: "employee", targetId: script.id, detail: { name: script.name, engine: "sarvam", agentId: agent || "removed" } }).catch(() => {});
  return Response.json({ ok: true, agent: agent || "", script: updated });
}
