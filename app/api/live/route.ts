export const runtime = "nodejs";
import { hideVendors } from "@/lib/voice/brand";
import { unauthorized } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { listCallsLean, listCampaigns, getCall } from "@/lib/calls";
import { maybeSyncClientCalls } from "@/lib/callSync";
import { kpis } from "@/lib/metrics";
import { getClientById } from "@/lib/supabase";
import { zoneOf, dayStart, localDate } from "@/lib/tz";

/**
 * GET /api/live → the Live monitor (Mission control): today's numbers, running campaigns with progress,
 * and the latest calls as they finish. GET /api/live?call=<id> → one call with its transcript (for the replay).
 */
export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  const sp = new URL(req.url).searchParams;
  const one = sp.get("call");
  if (one) {
    if (!/^[0-9a-f-]{36}$/.test(one)) return Response.json({ error: "bad id" }, { status: 400 });
    const c = await getCall(session.clientId, one);
    if (!c) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json({ call: { id: c.id, direction: c.direction, caller_name: c.caller_name, caller_phone: c.caller_phone, duration_seconds: c.duration_seconds, lead_status: c.lead_status, lead_reason: (c as any).lead_reason, summary: c.summary, transcript: (c.transcript || []).slice(0, 80), created_at: (c as any).created_at, recording_url: c.recording_url } });
  }
  await maybeSyncClientCalls(session.clientId);
  const now = new Date();
  const tz = zoneOf(await getClientById(session.clientId).catch(() => null));
  const startToday = new Date(dayStart(tz, localDate(tz, now.getTime()))).toISOString();
  try {
    const campaigns = (await listCampaigns(session.clientId).catch(() => [])).filter((c) => c.status === "running" || c.status === "scheduled");
    const oldest = campaigns.reduce((m, c) => (c.created_at < m ? c.created_at : m), startToday);
    const rows = (await listCallsLean(session.clientId, oldest, new Date(now.getTime() + 60e3).toISOString(), 5000)).filter((r) => r.source !== "manual");
    const today = rows.filter((r) => Date.parse(r.created_at) >= Date.parse(startToday));
    const lastHour = today.filter((r) => now.getTime() - Date.parse(r.created_at) < 3600e3).length;
    return Response.json({
      now: now.toISOString(),
      kpis: kpis(today),
      lastHour,
      campaigns: campaigns.map((c) => {
        const done = rows.filter((r) => r.campaign_id === c.id || (c.cartesia_batch_id && r.campaign_id === c.cartesia_batch_id)).length;
        return { id: c.id, name: c.name, status: c.status, total: c.total_contacts, done: Math.min(done, c.total_contacts || done) };
      }),
      feed: today.slice(0, 30).map((r) => ({ id: r.id, direction: r.direction, name: r.caller_name, phone: r.caller_phone, seconds: Number(r.duration_seconds) || 0, lead: r.lead_status, reason: r.lead_reason, summary: r.summary ? hideVendors(r.summary)?.slice(0, 240) : null, at: r.created_at, connected: r.connectivity_status })),
    });
  } catch (e: any) {
    return Response.json({ error: hideVendors(e?.message) || "Couldn't load live data" }, { status: 500 });
  }
}
