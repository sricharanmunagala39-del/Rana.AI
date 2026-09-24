export const runtime = "nodejs";
import { parseSession, unauthorized } from "@/lib/auth";
import { listCalls } from "@/lib/calls";
import { maybeSyncClientCalls } from "@/lib/callSync";

export async function GET(req: Request) {
  const session = parseSession(req);
  if (!session) return unauthorized();
  await maybeSyncClientCalls(session.clientId); // throttled to once a minute per client
  const sp = new URL(req.url).searchParams;
  try {
    const calls = await listCalls(session.clientId, {
      direction: sp.get("direction") ?? undefined,
      lead: sp.get("lead") ?? undefined,
      limit: Number(sp.get("limit") ?? 50),
      since: sp.get("since") ?? undefined,
    });
    return Response.json({ calls });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
