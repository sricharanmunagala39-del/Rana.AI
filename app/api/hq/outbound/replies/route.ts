export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { requireHq, hqCan } from "@/lib/hq";
import { pendingReplies } from "@/lib/leadflow";

/** GET → replies waiting for the founder's approval, with the AI's draft answer. */
export async function GET(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session, "view"); if (denied) return denied;
  return Response.json({ replies: await pendingReplies(), canAct: hqCan(session, "clients") });
}
