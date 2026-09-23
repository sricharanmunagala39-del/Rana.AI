// @ts-nocheck
/**
 * POST /api/voice-token
 * Returns Sarvam config to the browser so the API key never leaks.
 * GET /api/voice-token
 * Debug: shows what config values are loaded (masks API key)
 */
export const runtime = "nodejs";

export async function GET() {
  const apiKey      = process.env.SARVAM_API_KEY;
  const orgId       = process.env.NEXT_PUBLIC_SARVAM_ORG_ID;
  const workspaceId = process.env.NEXT_PUBLIC_SARVAM_WORKSPACE_ID;
  const appId       = process.env.SARVAM_APP_ID || "Conversatio-3b1430ca-82ed";

  return Response.json({
    apiKey_set:      !!apiKey,
    apiKey_prefix:   apiKey ? apiKey.slice(0, 20) + "..." : null,
    orgId,
    workspaceId,
    appId,
  });
}

export async function POST(req: Request) {
  const apiKey      = process.env.SARVAM_API_KEY;
  const orgId       = process.env.NEXT_PUBLIC_SARVAM_ORG_ID;
  const workspaceId = process.env.NEXT_PUBLIC_SARVAM_WORKSPACE_ID;
  const appId       = process.env.SARVAM_APP_ID || "Conversatio-3b1430ca-82ed";

  if (!apiKey) return Response.json({ error: "SARVAM_API_KEY not configured" }, { status: 500 });
  if (!orgId || !workspaceId) return Response.json({ error: "Sarvam org/workspace not configured" }, { status: 500 });

  let body: { userId?: string; agentId?: string } = {};
  try { body = await req.json(); } catch { /* no body */ }

  return Response.json({
    apiKey,
    orgId,
    workspaceId,
    appId: body.agentId || appId,
    userId: body.userId || `rana-user-${Date.now()}`,
  });
}
