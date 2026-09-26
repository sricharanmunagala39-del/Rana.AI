export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { unauthorized, forbidUnless } from "@/lib/auth";
import { sb } from "@/lib/db";
import { normalizeFilter } from "@/lib/reports";

/** Saved report layouts, shared by the whole team. Dates are not saved — a template is "which calls, which columns". */
export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  const rows = (await sb<any[]>(`/report_templates?client_id=eq.${session.clientId}&order=created_at.desc&select=id,name,config,created_by,created_at`).catch(() => [])) || [];
  return Response.json({ templates: rows });
}

export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  const denied = forbidUnless(session, "manager"); if (denied) return denied;
  const b = await req.json().catch(() => ({} as any));
  const name = String(b.name || "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (!name) return Response.json({ error: "Give the template a name." }, { status: 400 });
  const f = normalizeFilter(b.filter || {});
  const config = { direction: f.direction, campaign: f.campaign, leads: f.leads, connected: f.connected, columns: f.columns, range: ["today", "7d", "30d", "month"].includes(b.range) ? b.range : null };
  const existing = (await sb<any[]>(`/report_templates?client_id=eq.${session.clientId}&select=id`).catch(() => [])) || [];
  if (existing.length >= 30) return Response.json({ error: "You can keep up to 30 templates. Delete one first." }, { status: 400 });
  const r = await sb<any[]>(`/report_templates`, { method: "POST", body: JSON.stringify({ client_id: session.clientId, name, config, created_by: session.email }) });
  return Response.json({ ok: true, template: r?.[0] });
}

export async function DELETE(req: Request) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  const denied = forbidUnless(session, "manager"); if (denied) return denied;
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Bad id" }, { status: 400 });
  await sb(`/report_templates?id=eq.${id}&client_id=eq.${session.clientId}`, { method: "DELETE", prefer: "return=minimal" });
  return Response.json({ ok: true });
}
