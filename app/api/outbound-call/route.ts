export const runtime = "nodejs";

export async function POST(req: Request) {
  const apiKey     = process.env.SARVAM_API_KEY;
  const orgId      = process.env.SARVAM_ORG_ID;
  const workspaceId = process.env.SARVAM_WORKSPACE_ID;
  const appId      = process.env.SARVAM_APP_ID;
  const connectionId = process.env.SARVAM_CONNECTION_ID;

  const missing = ["SARVAM_API_KEY","SARVAM_ORG_ID","SARVAM_WORKSPACE_ID","SARVAM_APP_ID","SARVAM_CONNECTION_ID"]
    .filter((k) => !process.env[k]);
  if (missing.length > 0) {
    return Response.json(
      { error: `Missing env vars: ${missing.join(", ")}. Add them in Vercel → Settings → Environment Variables.` },
      { status: 500 }
    );
  }

  let body: { userPhone: string; agentPhone?: string; appVersion?: number };
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid body." }, { status: 400 }); }

  const { userPhone, agentPhone, appVersion = 1 } = body;
  if (!userPhone) return Response.json({ error: "userPhone is required." }, { status: 400 });

  const url = `https://apps.sarvam.ai/api/outbounds/v1/orgs/${orgId}/workspaces/${workspaceId}/outbounds`;

  const payload: Record<string, unknown> = {
    app_config: {
      app_id: appId,
      app_version: appVersion,
      connection_config: {
        connection_id: connectionId,
        ...(agentPhone ? { agent_phone_number: agentPhone } : {}),
      },
    },
    user_config: { user_phone_number: userPhone },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-subscription-key": apiKey! },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    if (!res.ok) return Response.json({ error: `Sarvam returned ${res.status}`, detail: data }, { status: res.status });
    return Response.json({ success: true, data });
  } catch (err: any) {
    return Response.json({ error: err?.message || "Failed to reach Sarvam outbound API." }, { status: 500 });
  }
}
