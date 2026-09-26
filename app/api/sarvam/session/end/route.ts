export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { endPractice } from "@/lib/practice";

/** POST { practiceId } — the browser practice call ended; record its length. Also accepts navigator.sendBeacon. */
export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const b = await req.json().catch(async () => ({}));
  const id = String(b?.practiceId || "");
  if (!/^[0-9a-f-]{36}$/.test(id)) return Response.json({ ok: false }, { status: 400 });
  const seconds = await endPractice(id, session.clientId);
  return Response.json({ ok: true, seconds });
}
