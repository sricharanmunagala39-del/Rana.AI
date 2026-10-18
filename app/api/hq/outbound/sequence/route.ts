export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { requireHq } from "@/lib/hq";
import { sequence } from "@/lib/leadflow";

/** GET → every enrollment with the date each step went out (0 = WhatsApp intro, 1–5 = sequence). */
export async function GET(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session, "view"); if (denied) return denied;
  return Response.json({ rows: await sequence() });
}
