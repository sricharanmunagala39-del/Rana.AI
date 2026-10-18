export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { requireHq, hqCan } from "@/lib/hq";
import { waThread, isWaNumber } from "@/lib/leadflow";

/** GET → one WhatsApp thread; opening it marks the inbound messages read. */
export async function GET(req: Request, { params }: { params: { number: string } }) {
  const session = await getSession(req);
  const denied = requireHq(session, "view"); if (denied) return denied;
  const number = decodeURIComponent(params.number);
  if (!isWaNumber(number)) return Response.json({ error: "Not found" }, { status: 404 });
  const t = await waThread(number);
  return Response.json({ ...t, canAct: hqCan(session, "clients") });
}
