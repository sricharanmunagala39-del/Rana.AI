/**
 * POST /api/voice-config
 * Returns the NON-SECRET config the browser needs to open a test voice session.
 * The engine API key never leaves the server: the browser talks to /api/sarvam-session/*,
 * which injects the key before forwarding.
 */
export const runtime = "nodejs";
import { parseSession, unauthorized } from "@/lib/auth";
import { getClientById } from "@/lib/supabase";

export async function POST(req: Request) {
  const session = parseSession(req);
  if (!session) return unauthorized();

  const orgId       = process.env.SARVAM_ORG_ID || process.env.NEXT_PUBLIC_SARVAM_ORG_ID;
  const workspaceId = process.env.SARVAM_WORKSPACE_ID || process.env.NEXT_PUBLIC_SARVAM_WORKSPACE_ID;
  if (!orgId || !workspaceId) return Response.json({ error: "Voice engine not configured" }, { status: 500 });

  const client = await getClientById(session.clientId);
  const appId = client?.sarvam_app_id || process.env.SARVAM_APP_ID;
  if (!appId) return Response.json({ error: "No voice agent linked to this account yet" }, { status: 400 });

  return Response.json({
    orgId,
    workspaceId,
    appId,
    userId: `rana-${session.clientId.slice(0, 8)}-${Date.now()}`,
    baseUrl: "/api/sarvam-session/",
  });
}
