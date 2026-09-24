// Shared guard for the Agent Studio APIs: signed in, admin or owner, and (when a script id is given) the script is theirs.
import { getSession } from "./session";
import { forbidUnless, type Session } from "./auth";
import { getScriptById } from "./supabase";

export async function studioGuard(req: Request, scriptId?: string | null): Promise<{ session: Session; script: any | null } | Response> {
  const session = await getSession(req);
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const denied = forbidUnless(session, "admin"); if (denied) return denied;
  if (!scriptId) return { session, script: null };
  const script = await getScriptById(scriptId);
  if (!script || script.client_id !== session.clientId) return Response.json({ error: "Employee not found" }, { status: 404 });
  return { session, script };
}
