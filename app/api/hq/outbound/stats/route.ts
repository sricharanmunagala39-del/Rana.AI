export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { requireHq } from "@/lib/hq";
import { emailStats } from "@/lib/leadflow";

/** GET → emails sent per day (last 30 days, India time) and per month (leadflow_email_stats). */
export async function GET(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session, "view"); if (denied) return denied;
  try {
    return Response.json(await emailStats(30));
  } catch (e: any) {
    return Response.json({ error: `Couldn't load email stats (${e?.message || "error"}).` }, { status: 502 });
  }
}
