export const runtime = "nodejs";
import { parseSession, unauthorized } from "@/lib/auth";
import { listCalls } from "@/lib/calls";
import { maybeSyncClientCalls } from "@/lib/callSync";
import { getSession } from "@/lib/session";

/** Start of today in Asia/Kolkata as ISO (clients are India-based). */
function startOfTodayIST(): string {
  const now = new Date();
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  ist.setHours(0, 0, 0, 0);
  const offsetMs = 5.5 * 60 * 60 * 1000;
  return new Date(ist.getTime() - offsetMs).toISOString();
}

export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  await maybeSyncClientCalls(session.clientId); // throttled to once a minute per client
  try {
    const todayStart = startOfTodayIST();
    const yesterdayStart = new Date(new Date(todayStart).getTime() - 24 * 3600 * 1000).toISOString();
    const rows = await listCalls(session.clientId, { since: yesterdayStart, limit: 500 });

    const today = rows.filter((r) => r.created_at >= todayStart);
    const yesterday = rows.filter((r) => r.created_at < todayStart);

    const isConnected = (r: any) => (r.connectivity_status ? r.connectivity_status === "connected" : r.duration_seconds > 0);
    const connected = today.filter(isConnected);
    const hot = today.filter((r) => r.lead_status === "hot" || r.lead_status === "ready_to_close");
    const avg = connected.length ? connected.reduce((a, r) => a + Number(r.duration_seconds || 0), 0) / connected.length : 0;

    return Response.json({
      today: {
        calls: today.length,
        inbound: today.filter((r) => r.direction === "inbound").length,
        outbound: today.filter((r) => r.direction === "outbound").length,
        connected: connected.length,
        connectRate: today.length ? Math.round((connected.length / today.length) * 100) : 0,
        hot: hot.length,
        readyToClose: today.filter((r) => r.lead_status === "ready_to_close").length,
        avgDurationSeconds: Math.round(avg),
      },
      yesterday: { calls: yesterday.length },
      recent: rows.slice(0, 8),
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
