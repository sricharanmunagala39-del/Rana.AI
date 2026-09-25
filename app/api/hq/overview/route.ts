export const runtime = "nodejs";
export const maxDuration = 60;
import { getSession } from "@/lib/session";
import { requireHq, hqCan } from "@/lib/hq";
import { hqOverview } from "@/lib/insights";

/** GET → the HQ command centre: alerts, live strip, money, growth, platform health, clients ranked by health. */
export async function GET(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session, "view"); if (denied) return denied;
  const o = await hqOverview();
  // Finance numbers only for roles that may see money.
  if (!hqCan(session, "money")) (o as any).money = null;
  return Response.json({ ...o, role: session!.hqRole });
}
