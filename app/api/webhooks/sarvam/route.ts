/**
 * POST /api/webhooks/sarvam?key=<client webhook_secret>
 * Receives post-call webhooks from the voice engine (deployment / campaign / instant outbound)
 * and stores them as rows in `calls` for the right client.
 *
 * Client resolution: ?key= (preferred, per-client secret) -> app_id match on clients.sarvam_app_id.
 */
export const runtime = "nodejs";
export const maxDuration = 60;
import { getClientByWebhookSecret, getClientByAppId, upsertCall, payloadToCall, existingCall } from "@/lib/calls";
import { handoffAfterCall } from "@/lib/handoffAlert";
import { leadAlertsAfterCall } from "@/lib/leadAlerts";
import { applyInsight } from "@/lib/callInsight";
import crypto from "crypto";
import { sarvamConfig, recordingUrl, SARVAM_VOICES } from "@/lib/sarvamAgent";
import { optOutPhrase, addDnc } from "@/lib/compliance";
import { normalisePhone } from "@/lib/campaigns";
import { sb } from "@/lib/db";
import { getClientById } from "@/lib/supabase";
import { engine } from "@/lib/leadflow";

/** Our webhook metadata (rana_source, leadflow_lead_id…) — wherever Sarvam echoes it in the payload. */
function webhookMeta(p: any): Record<string, any> {
  const nested = [p?.metadata, p?.webhook_metadata, p?.webhook_config?.metadata].filter((m) => m && typeof m === "object");
  return Object.assign({}, p, ...nested);
}

/**
 * A warm-lead call placed by LeadFlow (/api/internal/leadflow/call): hand the outcome back to the LeadFlow engine.
 * Never throws — the webhook's own response must not depend on it.
 */
async function leadflowAfterCall(payload: any, row: any, saved: any) {
  try {
    const meta = webhookMeta(payload);
    if (meta.rana_source !== "leadflow" || !meta.leadflow_lead_id) return;
    const vars = { ...(row.agent_variables || {}), ...(saved?.agent_variables || {}) };
    const out = (k: string) => (vars[k] == null || vars[k] === "" ? null : String(vars[k]));
    const r = await engine({
      action: "call_result",
      leadflow_lead_id: String(meta.leadflow_lead_id),
      attempt_id: payload?.attempt_id ?? null,
      interaction_id: row.interaction_id ?? null,
      call_id: saved?.id != null ? String(saved.id) : null,
      connectivity_status: saved?.connectivity_status ?? row.connectivity_status ?? null,
      completion_status: saved?.completion_status ?? row.completion_status ?? null,
      duration_seconds: saved?.duration_seconds ?? row.duration_seconds ?? null,
      lead_status: saved?.lead_status ?? row.lead_status ?? null,
      summary: saved?.summary ?? row.summary ?? null,
      recording_url: saved?.recording_url ?? row.recording_url ?? null,
      outputs: { call_outcome: out("call_outcome"), preferred_time: out("preferred_time"), email: out("email"), notes: out("notes") },
    });
    if (!r.ok) console.error("[webhook] leadflow call_result", r.error);
  } catch (e: any) {
    console.error("[webhook] leadflow call_result", e?.message || e);
  }
}

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
  // Fallback for a client's own Sarvam agent (set up before per-client keys). Never for RANA's shared runtime agents,
  // whose ids are shared by every client — those webhooks must carry ?key=.
  const shared = new Set([sarvamConfig()?.appId, ...SARVAM_VOICES.map((v) => v.appId)].filter(Boolean) as string[]);
  if (!client && payload?.app_id && !shared.has(String(payload.app_id))) client = await getClientByAppId(payload.app_id);
  // A ready-made agent connected to one employee (HQ): its calls (inbound too) belong to that employee and its workspace.
  let own: any = null;
  if (payload?.app_id && !shared.has(String(payload.app_id))) {
    const id = String(payload.app_id).replace(/[^A-Za-z0-9_-]/g, "");
    [own] = id ? (await sb<any[]>(`/scripts?engine_agent=like.${encodeURIComponent(id + "@")}*&select=id,name,client_id&limit=1`).catch(() => [])) || [] : [];
    if (own && client && own.client_id !== client.id) own = null;
    if (!client && own?.client_id) client = await getClientById(own.client_id);
  }
  if (own && !payload.rana_script_id) payload.rana_script_id = own.id;
  if (!client) return Response.json({ error: "Unknown client" }, { status: 404 });

  try {
    const row = payloadToCall(payload, client.id);
    if (own) (row as any).agent_variables = { ...((row as any).agent_variables || {}), employee_name: own.name };
    // No id from Sarvam: derive a stable one, so a retried webhook updates the same row instead of adding another.
    if (!row.interaction_id) row.interaction_id = `sarvam-${crypto.createHash("sha256").update(JSON.stringify([client.id, payload.user_identifier, payload.start_datetime ?? payload.created_at, payload.user_phone_number, payload.app_id])).digest("hex").slice(0, 32)}`;
    const prev = await existingCall(row.interaction_id);
    if (prev && prev.client_id !== client.id) return Response.json({ error: "That call belongs to another workspace." }, { status: 409 });
    if (prev?.lead_reason === "Set manually by your team.") { delete row.lead_status; delete row.lead_reason; }
    // Already read by the AI on an earlier delivery: keep its verdict instead of the quick keyword guess.
    if (prev?.insight) { delete row.lead_status; delete row.lead_reason; delete (row as any).summary; }

    // Recordings only ever exist for calls that actually connected — skip the extra
    // network round-trip otherwise.
    const appId = payload?.app_id ?? client.sarvam_app_id;
    if (appId && row.interaction_id && (row.duration_seconds ?? 0) > 0) {
      row.recording_url = await fetchRecordingUrl(appId, row.interaction_id);
    }
    if (prev?.recording_url && !row.recording_url) delete row.recording_url; // keep a recording we already have
    if (prev?.handoff) (row as any).follow_up = true; // a handoff stays a follow-up on retried webhooks

    (row as any).engine = "sarvam";
    let saved: any = await upsertCall(row);
    // AI read of the call: lead / customer / junk / spam / sales pitch, why they called, wholesale, details.
    if (row.source !== "manual") saved = await applyInsight(client, { ...saved, insight: prev?.insight || saved.insight || null }, { keepLead: prev?.lead_reason === "Set manually by your team." });

    // "Don't call me again" goes straight onto the do-not-call list so no future campaign dials them.
    const phone = normalisePhone(String(row.caller_phone || ""));
    const said = optOutPhrase((row.transcript || []).filter((t: any) => t.role === "user").map((t: any) => t.text).join(" "));
    if (said && phone) {
      await addDnc(client.id, [{ phone, source: "caller_request", reason: `Caller said "${said}"`, callId: String(row.interaction_id) }]).catch(() => {});
    }
    // Needed a person (ready to pay, asked for someone, existing customer issue…)? Alert them now — once per call.
    let handoff = prev?.handoff || null;
    if (!handoff && row.source !== "manual" && (row.duration_seconds ?? 0) > 0) {
      handoff = await handoffAfterCall(client, saved, payload).catch((e: any) => { console.error("[webhook] handoff", e?.message); return null; });
    }
    // The client's own lead alerts (Slack, WhatsApp, email, webhook) — each call to each channel once.
    const alerts = await leadAlertsAfterCall(client, { ...saved, handoff: handoff || saved.handoff || null, follow_up: saved.follow_up || !!handoff });
    // Called by LeadFlow (warm sales lead)? Report the outcome back to the LeadFlow engine.
    await leadflowAfterCall(payload, row, saved);
    return Response.json({ ok: true, id: saved.id, lead_status: saved.lead_status, handoff: handoff ? handoff.rule : null, alerts });
  } catch (err: any) {
    console.error("[webhook] failed", err?.message);
    return Response.json({ error: err?.message || "Failed to store call" }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({ ok: true, service: "rana-webhook" });
}
