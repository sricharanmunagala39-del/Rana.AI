export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { requireHq } from "@/lib/hq";
import { emailSchedule } from "@/lib/leadflow";

/** GET → forecast of upcoming outreach emails, grouped by sending day (leadflow_email_schedule, next 45 days). */
export async function GET(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session, "view"); if (denied) return denied;
  try {
    return Response.json({ days: await emailSchedule(45) });
  } catch (e: any) {
    return Response.json({ error: `Couldn't load the email schedule (${e?.message || "error"}).` }, { status: 502 });
  }
}
