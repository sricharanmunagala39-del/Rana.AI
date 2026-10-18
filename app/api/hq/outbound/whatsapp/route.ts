export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { requireHq } from "@/lib/hq";
import { waConversations, getSettings } from "@/lib/leadflow";

/** GET → WhatsApp conversations, unread first. */
export async function GET(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session, "view"); if (denied) return denied;
  const [convos, s] = await Promise.all([waConversations(), getSettings()]);
  return Response.json({ convos, agentName: s.wa_agent_name || "Priya", agentOn: s.wa_agent !== "off" });
}
