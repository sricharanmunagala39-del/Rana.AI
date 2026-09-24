export const runtime = "nodejs";
export const maxDuration = 60;
import { parseSession, unauthorized } from "@/lib/auth";
import { syncClientCalls } from "@/lib/callSync";
import { getSession } from "@/lib/session";

/** "Sync now" button: pull this client's latest Cartesia calls immediately. */
export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  try {
    const r = await syncClientCalls(session.clientId);
    return Response.json({ ok: r.errors.length === 0, ...r }, { status: r.errors.length && !r.saved ? 502 : 200 });
  } catch (err: any) {
    return Response.json({ error: err?.message || "Sync failed" }, { status: 500 });
  }
}
