export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { requireHq, hqCan } from "@/lib/hq";
import { overview } from "@/lib/leadflow";

/** GET → LeadFlow overview: enrollment counts, today's sends vs caps, modes, engine health, inbox counts. */
export async function GET(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session, "view"); if (denied) return denied;
  const o = await overview();
  const { settings, ...rest } = o;
  return Response.json({ ...rest, ramp: settings.ramp === "on", liveSince: settings.live_since || null, canAct: hqCan(session, "clients"), canGoLive: hqCan(session, "team") });
}
