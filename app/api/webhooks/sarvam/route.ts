/**
 * POST /api/webhooks/sarvam?key=<client webhook_secret>
 * Receives post-call webhooks from the voice engine (deployment / campaign / instant outbound)
 * and stores them as rows in `calls` for the right client.
 *
 * Client resolution: ?key= (preferred, per-client secret) -> app_id match on clients.sarvam_app_id.
 */
export const runtime = "nodejs";
import { getClientByWebhookSecret, getClientByAppId, upsertCall, payloadToCall } from "@/lib/calls";
import { sarvamConfig, recordingUrl } from "@/lib/sarvamAgent";
import { optOutPhrase, addDnc } from "@/lib/compliance";
import { normalisePhone } from "@/lib/campaigns";

/**
 * Best-effort fetch of the call recording from Sarvam's analytics API.
 * GET /api/analytics/v1/{org}/{workspace}/{app}/recordings/{interaction_id}
 * The response shape isn't pinned down in Sarvam's docs, so we try the common key names.
 * Never throws — a missing or not-yet-processed recording should never break webhook ingestion.
 */
async function fetchRecordingUrl(appId: string, interactionId: string): Promise<string | null> {
  // RANA's own Sarvam workspace first (the RANA Runtime agent), then the older per-client setup.
  const cfg = sarvamConfig();
  if (cfg) { const u = await recordingUrl(cfg, appId, interactionId); if (u) return u; }
  const orgId = process.env.SARVAM_ORG_ID;
  const workspaceId = process.env.SARVAM_WORKSPACE_ID;
  const apiKey = process.env.SARVAM_API_KEY;
  if (!orgId || !workspaceId || !apiKey) return null;

  try {
    const res = await fetch(
      `https://apps.sarvam.ai/api/analytics/v1/${orgId}/${workspaceId}/${appId}/recordings/${interactionId}`,
      { headers: { "X-API-Key": apiKey } }
    );
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data || typeof data !== "object") return null;
    const url =
      data.recording_url ?? data.url ?? data.audio_url ?? data.recordingUrl ??
      data.signed_url ?? data.download_url ?? null;
    return typeof url === "string" && url ? url : null;
  } catch (err) {
    console.error("[webhook] recording fetch failed", (err as any)?.message);
    return null;
  }
}

export async function POST(req: Request) {
  let payload: any;
  try { payload = await req.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const key = new URL(req.url).searchParams.get("key");
  let client = key ? await getClientByWebhookSecret(key) : null;
  if (!client && payload?.app_id) client = await getClientByAppId(payload.app_id);
  if (!client) return Response.json({ error: "Unknown client" }, { status: 404 });

  try {
    const row = payloadToCall(payload, client.id);
    if (!row.interaction_id) row.interaction_id = `manual-${client.id.slice(0, 8)}-${Date.now()}`;

    // Recordings only ever exist for calls that actually connected — skip the extra
    // network round-trip otherwise.
    const appId = payload?.app_id ?? client.sarvam_app_id;
    if (appId && row.interaction_id && (row.duration_seconds ?? 0) > 0) {
      row.recording_url = await fetchRecordingUrl(appId, row.interaction_id);
    }

    const saved = await upsertCall(row);

    // "Don't call me again" goes straight onto the do-not-call list so no future campaign dials them.
    const phone = normalisePhone(String(row.caller_phone || ""));
    const said = optOutPhrase((row.transcript || []).filter((t: any) => t.role === "user").map((t: any) => t.text).join(" "));
    if (said && phone) {
      await addDnc(client.id, [{ phone, source: "caller_request", reason: `Caller said "${said}"`, callId: String(row.interaction_id) }]).catch(() => {});
    }
    return Response.json({ ok: true, id: saved.id, lead_status: saved.lead_status });
  } catch (err: any) {
    console.error("[webhook] failed", err?.message);
    return Response.json({ error: err?.message || "Failed to store call" }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({ ok: true, service: "rana-webhook" });
}
