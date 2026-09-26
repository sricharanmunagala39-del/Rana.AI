export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { unauthorized, forbidUnless } from "@/lib/auth";
import { sb } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ALERT_FIELDS, DEFAULT_RULES, buildIntegration, publicIntegration, type Kind } from "@/lib/leadAlerts";
import { LEAD_CHOICES } from "@/lib/reports";

const KINDS: Kind[] = ["slack", "whatsapp", "email", "webhook"];
const mine = (clientId: string, id: string) => sb<any[]>(`/integrations?id=eq.${id}&client_id=eq.${clientId}&limit=1`).then((r) => r?.[0] || null).catch(() => null);

/** GET — this workspace's lead-alert channels (no secrets), recent deliveries, and the choices for the form. */
export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  const [rows, log, campaigns] = await Promise.all([
    sb<any[]>(`/integrations?client_id=eq.${session.clientId}&order=created_at.asc`).catch(() => []),
    sb<any[]>(`/integration_log?client_id=eq.${session.clientId}&order=created_at.desc&limit=30&select=integration_id,kind,ok,error,created_at,call_id`).catch(() => []),
    sb<any[]>(`/campaigns?client_id=eq.${session.clientId}&order=created_at.desc&limit=200&select=id,name`).catch(() => []),
  ]);
  return Response.json({ integrations: (rows || []).map(publicIntegration), log: log || [], campaigns: campaigns || [], fields: ALERT_FIELDS, leadChoices: LEAD_CHOICES, defaults: DEFAULT_RULES });
}

/** POST { kind, name, rules, recipients?, secret?, phoneNumberId?, template?, templateLang? } — add a channel. */
export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  const denied = forbidUnless(session, "admin"); if (denied) return denied;
  const b = await req.json().catch(() => ({} as any));
  if (!KINDS.includes(b.kind)) return Response.json({ error: "Choose Slack, WhatsApp, Email or Webhook." }, { status: 400 });
  const count = ((await sb<any[]>(`/integrations?client_id=eq.${session.clientId}&select=id`).catch(() => [])) || []).length;
  if (count >= 20) return Response.json({ error: "You can have up to 20 alert channels." }, { status: 400 });
  const built = buildIntegration(b.kind, b);
  if ("error" in built) return Response.json({ error: built.error }, { status: 400 });
  const r = await sb<any[]>(`/integrations`, { method: "POST", body: JSON.stringify({ ...built.row, client_id: session.clientId, created_by: session.email }) });
  await audit(session, "integration_added", { req, targetType: "integration", targetId: r?.[0]?.id, detail: { kind: b.kind, name: built.row.name } });
  // A webhook's signing secret is shown once, now; afterwards only its last characters.
  return Response.json({ ok: true, integration: publicIntegration(r[0]), signingSecret: built.signingSecret || null });
}

/** PATCH { id, …same fields, enabled? } — change a channel. Leaving the secret empty keeps the saved one. */
export async function PATCH(req: Request) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  const denied = forbidUnless(session, "admin"); if (denied) return denied;
  const b = await req.json().catch(() => ({} as any));
  const cur = /^[0-9a-f-]{36}$/i.test(String(b.id || "")) ? await mine(session.clientId, b.id) : null;
  if (!cur) return Response.json({ error: "Not found" }, { status: 404 });
  let patch: any;
  if (Object.keys(b).every((k) => k === "id" || k === "enabled")) patch = { enabled: !!b.enabled, updated_at: new Date().toISOString() };
  else {
    const built = buildIntegration(cur.kind, { ...b, recipients: b.recipients ?? cur.config?.recipients, phoneNumberId: b.phoneNumberId ?? cur.config?.phoneNumberId }, cur);
    if ("error" in built) return Response.json({ error: built.error }, { status: 400 });
    patch = built.row;
  }
  const r = await sb<any[]>(`/integrations?id=eq.${cur.id}&client_id=eq.${session.clientId}`, { method: "PATCH", body: JSON.stringify(patch) });
  await audit(session, "integration_changed", { req, targetType: "integration", targetId: cur.id, detail: { kind: cur.kind, changed: Object.keys(patch) } });
  return Response.json({ ok: true, integration: publicIntegration(r[0]) });
}

/** DELETE ?id= — remove a channel (and its delivery log). */
export async function DELETE(req: Request) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  const denied = forbidUnless(session, "admin"); if (denied) return denied;
  const id = new URL(req.url).searchParams.get("id") || "";
  const cur = /^[0-9a-f-]{36}$/i.test(id) ? await mine(session.clientId, id) : null;
  if (!cur) return Response.json({ error: "Not found" }, { status: 404 });
  await sb(`/integrations?id=eq.${cur.id}&client_id=eq.${session.clientId}`, { method: "DELETE", prefer: "return=minimal" });
  await audit(session, "integration_removed", { req, targetType: "integration", targetId: cur.id, detail: { kind: cur.kind, name: cur.name } });
  return Response.json({ ok: true });
}
