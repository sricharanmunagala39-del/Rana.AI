export const runtime = "nodejs";
import { parseSession, unauthorized } from "@/lib/auth";
import { listCallsLean, listCampaigns } from "@/lib/calls";
import { maybeSyncClientCalls } from "@/lib/callSync";
import {
  resolveRange, previousRange, kpis, hourly, daily, notConnectedReasons, campaignBreakdown, leadMix,
  isHot, isFollowUp, DEFINITIONS,
} from "@/lib/metrics";
import { getSession } from "@/lib/session";

/**
 * GET /api/dashboard?range=today|yesterday|day_before|7d|30d|custom&from=YYYY-MM-DD&to=YYYY-MM-DD&direction=all|inbound|outbound
 * Everything the Overview needs in one response, all computed by lib/metrics.ts.
 */
export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  await maybeSyncClientCalls(session.clientId);

  const sp = new URL(req.url).searchParams;
  const range = resolveRange(sp.get("range") || "today", sp.get("from"), sp.get("to"));
  const prev = previousRange(range);
  const direction = (["inbound", "outbound"].includes(sp.get("direction") || "") ? sp.get("direction") : "all") as "all" | "inbound" | "outbound";

  // Trend window: the range itself, or the 7 days ending on it for single-day views.
  const D = 86400000;
  const trendFrom = range.days >= 7 ? range.from : new Date(Date.parse(range.to) - 7 * D).toISOString();
  const fetchFrom = [prev.from, trendFrom].sort()[0];

  try {
    const [allRaw, campaigns] = await Promise.all([
      listCallsLean(session.clientId, fetchFrom, range.to),
      listCampaigns(session.clientId).catch(() => []),
    ]);
    const all = allRaw.filter((r) => r.source !== "manual"); // Talk-page tests are not results
    const dir = (r: any) => direction === "all" || r.direction === direction;
    // Compare as times, not strings: Supabase returns "+00:00" offsets, JS returns "Z".
    const inRange = (r: any, a: string, b: string) => { const t = Date.parse(r.created_at); return t >= Date.parse(a) && t < Date.parse(b); };
    const cur = all.filter((r) => inRange(r, range.from, range.to));
    const curDir = cur.filter(dir);
    const prv = all.filter((r) => inRange(r, prev.from, prev.to) && dir(r));
    const trendRows = all.filter((r) => inRange(r, trendFrom, range.to));

    const hot = curDir.filter(isHot).sort((a, b) => (a.lead_status === "ready_to_close" ? -1 : 0) - (b.lead_status === "ready_to_close" ? -1 : 0) || b.created_at.localeCompare(a.created_at));
    const follow = curDir.filter((r) => isFollowUp(r) && !isHot(r));

    return Response.json({
      range, previous: { from: prev.from, to: prev.to, label: prev.label }, direction,
      kpis: kpis(curDir),
      previousKpis: kpis(prv),
      split: { inbound: kpis(cur.filter((r) => r.direction === "inbound")), outbound: kpis(cur.filter((r) => r.direction === "outbound")) },
      hourly: hourly(curDir),
      trend: daily(trendRows.filter(dir), trendFrom, range.to),
      notConnected: notConnectedReasons(curDir),
      leadMix: leadMix(curDir),
      campaigns: direction === "inbound" ? [] : campaignBreakdown(cur, campaigns),
      hotLeads: hot.slice(0, 10),
      followUps: follow.slice(0, 10),
      definitions: DEFINITIONS,
      generatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return Response.json({ error: err?.message || "Failed to build dashboard" }, { status: 500 });
  }
}
