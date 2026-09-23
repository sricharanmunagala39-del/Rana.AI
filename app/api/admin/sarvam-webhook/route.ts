/**
 * Diagnostic + fix-it endpoint for wiring a client's Sarvam deployment(s) to our webhook.
 * Uses the documented Deployments API (app-authoring service) — never the dashboard URL.
 *
 * GET  -> lists deployments in the workspace, flags which belong to this client's app_id,
 *         and shows their current webhook_config so we can see the real state before touching anything.
 *
 * POST { deploymentId } -> connects the webhook. Sarvam only allows editing webhook_config on a
 *         PAUSED deployment (PATCH on an active one returns 422 "Only paused deployments can be
 *         edited"). For a live deployment this endpoint therefore does, in order:
 *           1. PUT .../status { action: "pause" }   — stop it accepting inbound calls
 *           2. PATCH .../{id}                        — set webhook_config
 *           3. PUT .../status { action: "resume" }   — always attempted, even if step 2 failed,
 *              so a live line is never left stuck paused because of a webhook error.
 *         If the deployment was already paused when we checked, steps 1 and 3 are skipped
 *         entirely — we only touch the status of a deployment we ourselves paused.
 *         Reference: https://docs.sarvam.ai/api-reference/deployments/update-status
 */
export const runtime = "nodejs";
import { parseSession, unauthorized } from "@/lib/auth";
import { getClientById } from "@/lib/supabase";

const BASE = "https://apps.sarvam.ai/api/app-authoring";

function envOrError() {
  const apiKey = process.env.SARVAM_API_KEY;
  const orgId = process.env.SARVAM_ORG_ID;
  const workspaceId = process.env.SARVAM_WORKSPACE_ID;
  const missing = ["SARVAM_API_KEY", "SARVAM_ORG_ID", "SARVAM_WORKSPACE_ID"].filter((k) => !process.env[k]);
  return { apiKey, orgId, workspaceId, missing };
}

async function sarvamFetch(url: string, apiKey: string, init: RequestInit = {}) {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey, ...(init.headers ?? {}) },
    });
  } catch (e: any) {
    return { status: 0, ok: false, json: { raw: e?.message ?? "network error calling Sarvam" } };
  }
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, ok: res.ok, json };
}

function extractDeploymentArray(json: any): any[] {
  if (Array.isArray(json)) return json;
  for (const key of ["items", "deployments", "data", "results", "records"]) {
    if (Array.isArray(json?.[key])) return json[key];
  }
  return [];
}

export async function GET(req: Request) {
  const session = parseSession(req);
  if (!session) return unauthorized();

  const { apiKey, orgId, workspaceId, missing } = envOrError();
  if (missing.length) return Response.json({ error: `Missing env vars: ${missing.join(", ")}` }, { status: 500 });

  const client = await getClientById(session.clientId);
  if (!client) return Response.json({ error: "Client not found" }, { status: 404 });
  if (!client.sarvam_app_id) return Response.json({ error: "No sarvam_app_id set on this client" }, { status: 400 });

  const base = `${BASE}/v1/orgs/${orgId}/workspaces/${workspaceId}`;
  const { status, ok, json } = await sarvamFetch(`${base}/deployments?limit=100`, apiKey!);
  if (!ok) return Response.json({ error: `Sarvam returned ${status}`, detail: json }, { status });

  const all = extractDeploymentArray(json);
  const mine = all.filter((d: any) => d?.app_id === client.sarvam_app_id);

  const webhookUrl = `${new URL(req.url).origin}/api/webhooks/sarvam?key=${client.webhook_secret}`;

  return Response.json({
    appId: client.sarvam_app_id,
    expectedWebhookUrl: webhookUrl,
    totalDeploymentsInWorkspace: all.length,
    matchingDeployments: mine.map((d: any) => ({
      deployment_id: d.deployment_id,
      name: d.name,
      status: d.status,
      channel_direction: d.channel_direction,
      app_version: d.app_version,
      current_webhook_config: d.webhook_config ?? null,
      already_correct: d.webhook_config?.url === webhookUrl,
    })),
    // Included so nothing is hidden if our parsing above missed something.
    rawSample: all.slice(0, 3),
  });
}

export async function POST(req: Request) {
  const session = parseSession(req);
  if (!session) return unauthorized();

  const { apiKey, orgId, workspaceId, missing } = envOrError();
  if (missing.length) return Response.json({ error: `Missing env vars: ${missing.join(", ")}` }, { status: 500 });

  const client = await getClientById(session.clientId);
  if (!client) return Response.json({ error: "Client not found" }, { status: 404 });

  let body: { deploymentId?: string };
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }
  if (!body.deploymentId) return Response.json({ error: "deploymentId is required" }, { status: 400 });

  const deploymentId = body.deploymentId;
  const base = `${BASE}/v1/orgs/${orgId}/workspaces/${workspaceId}`;
  const statusUrl = `${base}/deployments/${deploymentId}/status`;
  const deploymentUrl = `${base}/deployments/${deploymentId}`;
  const webhookUrl = `${new URL(req.url).origin}/api/webhooks/sarvam?key=${client.webhook_secret}`;

  // Find out whether this deployment is currently live, so we know if pause/resume is even needed.
  const listRes = await sarvamFetch(`${base}/deployments?limit=100`, apiKey!);
  if (!listRes.ok) {
    return Response.json({ error: `Sarvam returned ${listRes.status} while checking deployment status`, detail: listRes.json }, { status: listRes.status || 502 });
  }
  const current = extractDeploymentArray(listRes.json).find((d: any) => d?.deployment_id === deploymentId);
  if (!current) return Response.json({ error: "Deployment not found in workspace" }, { status: 404 });

  const wasActive = current.status === "active";
  let pausedByUs = false;

  // Step 1: pause, only if it's live. Nothing has changed yet if this fails, so it's safe to
  // return immediately.
  if (wasActive) {
    const pauseRes = await sarvamFetch(statusUrl, apiKey!, { method: "PUT", body: JSON.stringify({ action: "pause" }) });
    if (!pauseRes.ok) {
      return Response.json({ error: `Could not pause deployment before editing (Sarvam returned ${pauseRes.status})`, detail: pauseRes.json }, { status: pauseRes.status || 502 });
    }
    pausedByUs = true;
  }

  // Step 2: patch the webhook. Step 3 (resume) always runs afterwards if we paused it —
  // regardless of whether this succeeds — so a failed PATCH never leaves the line paused.
  let patchResult: { status: number; ok: boolean; json: any };
  let resumeFailed: any = null;
  try {
    patchResult = await sarvamFetch(deploymentUrl, apiKey!, { method: "PATCH", body: JSON.stringify({ webhook_config: { url: webhookUrl } }) });
  } finally {
    if (pausedByUs) {
      const resumeRes = await sarvamFetch(statusUrl, apiKey!, { method: "PUT", body: JSON.stringify({ action: "resume" }) });
      if (!resumeRes.ok) {
        resumeFailed = resumeRes.json;
        // The HTTP response below already reflects the PATCH outcome; this failure is more
        // serious (the line may still be down) so it needs to be unmistakable even though we
        // can't safely throw out of a finally here.
        console.error(`CRITICAL: deployment ${deploymentId} was paused to update its webhook and could not be resumed. Sarvam returned ${resumeRes.status}:`, resumeRes.json);
      }
    }
  }

  if (resumeFailed) {
    return Response.json({
      error: "Webhook update finished, but RANA could not resume the deployment afterwards. It may still be paused and NOT accepting calls right now — check the Sarvam dashboard immediately.",
      patchSucceeded: patchResult!.ok,
      resumeError: resumeFailed,
    }, { status: 502 });
  }

  if (!patchResult!.ok) {
    return Response.json({
      error: `Sarvam returned ${patchResult!.status}`,
      detail: patchResult!.json,
      wasPausedForUpdate: pausedByUs,
      resumed: pausedByUs,
    }, { status: patchResult!.status || 502 });
  }

  return Response.json({ ok: true, webhookUrl, deployment: patchResult!.json, wasPausedForUpdate: pausedByUs, resumed: pausedByUs });
}
