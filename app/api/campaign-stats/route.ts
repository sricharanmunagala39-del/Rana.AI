export const runtime = "nodejs";

const BASE  = "https://apps.sarvam.ai/api";
const ANLTX = `${BASE}/analytics/v1`;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const campaignId  = searchParams.get("campaignId");

  const apiKey      = process.env.SARVAM_API_KEY;
  const orgId       = process.env.SARVAM_ORG_ID;
  const workspaceId = process.env.SARVAM_WORKSPACE_ID;
  const appId       = process.env.SARVAM_APP_ID;

  const missing = ["SARVAM_API_KEY","SARVAM_ORG_ID","SARVAM_WORKSPACE_ID","SARVAM_APP_ID"]
    .filter(k => !process.env[k]);
  if (missing.length)
    return Response.json({ error: `Missing env: ${missing.join(", ")}` }, { status: 500 });
  if (!campaignId)
    return Response.json({ error: "campaignId is required" }, { status: 400 });

  const endDt   = new Date();
  const startDt = new Date(endDt.getTime() - 90 * 24 * 60 * 60 * 1000);

  const filter = JSON.stringify([
    { id: "1", field: "campaign_id", operator: "equals", value: campaignId }
  ]);

  const url = new URL(`${ANLTX}/${orgId}/${workspaceId}/${appId}/attempts`);
  url.searchParams.set("start_datetime", startDt.toISOString());
  url.searchParams.set("end_datetime",   endDt.toISOString());
  url.searchParams.set("filter_conditions", filter);
  url.searchParams.set("limit", "1000");

  try {
    const res = await fetch(url.toString(), {
      headers: { "X-API-Key": apiKey! },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return Response.json(
        { error: `Sarvam analytics error ${res.status}`, detail: body },
        { status: res.status }
      );
    }

    const data = await res.json();
    const items: Attempt[] = data.items ?? [];

    const total     = data.total ?? items.length;
    const connected = items.filter(i => i.connectivity_status === "connected").length;
    const failed    = items.filter(i =>
      i.connectivity_status === "failed" ||
      i.connectivity_status === "busy"   ||
      i.connectivity_status === "no_answer"
    ).length;

    const durations = items
      .map(i => i.duration_in_seconds)
      .filter((d): d is number => typeof d === "number" && d > 0);
    const avgDuration   = durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0;
    const totalDuration = Math.round(durations.reduce((a, b) => a + b, 0));

    const connectRate = total > 0 ? Math.round((connected / total) * 100) : 0;

    const breakdown: Record<string, number> = {};
    for (const item of items) {
      const k = item.connectivity_status ?? "pending";
      breakdown[k] = (breakdown[k] ?? 0) + 1;
    }

    return Response.json({
      total, connected, failed, connectRate,
      avgDuration, totalDuration, breakdown,
      fetchedAt: new Date().toISOString(),
    });

  } catch (err: any) {
    return Response.json(
      { error: err?.message ?? "Failed to fetch campaign stats" },
      { status: 500 }
    );
  }
}

interface Attempt {
  attempt_id: string;
  interaction_id?: string | null;
  connectivity_status?: string | null;
  failure_reason?: string | null;
  duration_in_seconds?: number | null;
  start_datetime?: string | null;
  end_datetime?: string | null;
  campaign_id?: string | null;
}
