/**
 * Diagnostic + fix-it endpoint for wiring a client's Sarvam deployment(s) to our webhook.
 * Uses the documented Deployments API (app-authoring service) — never the dashboard URL.
 *
 * GET  -> lists deployments in the workspace, flags which belong to this client's app_id,
 *         and shows their current webhook_config so we can see the real state before touching anything.
 * POST { deploymentId } -> PATCHes that deployment's webhook_config to this client's webhook URL.
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

async function listAllDeployments(base: string, apiKey: string) {
  // Paginate defensively — we don't know the exact page-size default, so ask for a generous limit
  // and follow a `next`/`cursor` field if present. Fall back to a single page if the response
  // shape doesn't match what we expect; we return the raw payload either way so nothing is hidden.
  const url = `${base}/deployments?limit=100`;
  const res = await fetch(url, { headers: { "X-API-Key": apiKey } });
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
  const { status, ok, json } = await listAllDeployments(base, apiKey!);
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

  const webhookUrl = `${new URL(req.url).origin}/api/webhooks/sarvam?key=${client.webhook_secret}`;
  const url = `${BASE}/v1/orgs/${orgId}/workspaces/${workspaceId}/deployments/${body.deploymentId}`;

  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey! },
    body: JSON.stringify({ webhook_config: { url: webhookUrl } }),
  });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }

  if (!res.ok) return Response.json({ error: `Sarvam returned ${res.status}`, detail: json }, { status: res.status });
  return Response.json({ ok: true, webhookUrl, deployment: json });
}
