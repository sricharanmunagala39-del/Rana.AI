export const runtime = "nodejs";

const DAY_MAP: Record<string, string> = {
  Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday",
  Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday",
};

export async function POST(req: Request) {
  const apiKey       = process.env.SARVAM_API_KEY;
  const orgId        = process.env.SARVAM_ORG_ID;
  const workspaceId  = process.env.SARVAM_WORKSPACE_ID;
  const appId        = process.env.SARVAM_APP_ID;
  const connectionId = process.env.SARVAM_CONNECTION_ID;

  const missing = ["SARVAM_API_KEY","SARVAM_ORG_ID","SARVAM_WORKSPACE_ID","SARVAM_APP_ID","SARVAM_CONNECTION_ID"]
    .filter((k) => !process.env[k]);
  if (missing.length > 0) {
    return Response.json({ error: `Missing env vars: ${missing.join(", ")}` }, { status: 500 });
  }

  let body: {
    name: string;
    startDate: string;
    windowStart: string;
    windowEnd: string;
    days: string[];
    dialRate: string;
    contacts: { phone: string; name?: string }[];
    description?: string;
  };
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }

  const { name, startDate, windowStart, windowEnd, days, dialRate, contacts, description } = body;
  if (!name || !startDate || !contacts?.length) {
    return Response.json({ error: "name, startDate, and contacts are required." }, { status: 400 });
  }

  const attemptsPerSec = parseFloat(dialRate) || 2;
  const startISO = `${startDate}T${windowStart}:00+05:30`;
  const endDate  = new Date(startDate);
  endDate.setDate(endDate.getDate() + 30);
  const endISO = `${endDate.toISOString().split("T")[0]}T${windowEnd}:00+05:30`;
  const allowedDays = days.map((d) => DAY_MAP[d] ?? d);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-API-Key": apiKey!,
  };
  const schedulingBase = `https://apps.sarvam.ai/api/scheduling/v1/orgs/${orgId}/workspaces/${workspaceId}`;

  // Step 1: Create campaign
  const campaignPayload = {
    name,
    description: description ?? `RANA AI \u2014 ${name}`,
    app_config: {
      app_id: appId,
      app_type: "agent",
      app_version: 1,
      attempts_per_second: attemptsPerSec,
      connection_configs: [{ connection_id: connectionId, phone_numbers: [] }],
      retry_config: {
        max_retries: 2,
        retry_interval_minutes: 30,
        retry_on: {
          no_answer:      { enabled: true },
          busy:           { enabled: true },
          short_duration: { enabled: true, threshold_seconds: 20 },
        },
      },
    },
    start_timestamp:  startISO,
    end_timestamp:    endISO,
    allowed_schedule: {
      allowed_start_time: windowStart,
      allowed_end_time:   windowEnd,
      allowed_days:       allowedDays,
      timezone:           "Asia/Kolkata",
    },
  };

  let campaignId: string;
  try {
    const campRes = await fetch(`${schedulingBase}/campaigns`, {
      method: "POST", headers, body: JSON.stringify(campaignPayload),
    });
    const campText = await campRes.text();
    let campData: any;
    try { campData = JSON.parse(campText); } catch { campData = { raw: campText }; }
    if (!campRes.ok) {
      return Response.json(
        { error: `Sarvam create-campaign returned ${campRes.status}`, detail: campData },
        { status: campRes.status }
      );
    }
    campaignId = campData.campaign_id;
    if (!campaignId) {
      return Response.json({ error: "No campaign_id in Sarvam response", detail: campData }, { status: 500 });
    }
  } catch (err: any) {
    return Response.json({ error: err?.message || "Failed to call Sarvam campaigns API." }, { status: 500 });
  }

  // Step 2: Stream contacts in batches of 1000
  const cohortBase = `${schedulingBase}/campaigns/${campaignId}/cohorts/stream`;
  const BATCH = 1000;
  const cohortResults: any[] = [];

  for (let i = 0; i < contacts.length; i += BATCH) {
    const batch = contacts.slice(i, i + BATCH);
    const users = batch.map((c, idx) => ({
      user_phone_number: c.phone,
      user_identifier: `rana-${i + idx}`,
      ...(c.name ? { app_variables: { customer_name: c.name } } : {}),
    }));
    try {
      const cohortRes = await fetch(cohortBase, {
        method: "POST", headers,
        body: JSON.stringify({ name: `${name} batch-${Math.floor(i / BATCH) + 1}`, users }),
      });
      const cohortText = await cohortRes.text();
      let cohortData: any;
      try { cohortData = JSON.parse(cohortText); } catch { cohortData = { raw: cohortText }; }
      cohortResults.push({ batch: Math.floor(i / BATCH) + 1, status: cohortRes.status, data: cohortData });
    } catch (err: any) {
      cohortResults.push({ batch: Math.floor(i / BATCH) + 1, error: err?.message });
    }
  }

  return Response.json({ success: true, sarvamCampaignId: campaignId, cohortResults });
}
