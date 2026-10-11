export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { requireHq } from "@/lib/hq";
import { sb } from "@/lib/db";
import { audit } from "@/lib/audit";
import { dealPatch, addActivity, importDemoRequests, dealMonthly, STAGES, SOURCES, OPEN_STAGES } from "@/lib/crm";

/** GET → every deal (newest first), HQ staff for the owner list, clients to link, and pipeline totals. Pulls in new website demo requests first. */
export async function GET(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session, "view"); if (denied) return denied;
  const imported = await importDemoRequests().catch(() => 0);
  const [deals, staff, clients] = await Promise.all([
    sb<any[]>(`/crm_deals?order=updated_at.desc&limit=2000`).catch(() => []),
    sb<any[]>(`/users?client_id=eq.${session!.clientId}&is_active=eq.true&select=email,name,designation&order=created_at.asc`).catch(() => []),
    sb<any[]>(`/clients?is_hq=eq.false&select=id,name,plan,status&order=name.asc`).catch(() => []),
  ]);
  const rows = (deals || []).map((d) => ({ ...d, monthly: dealMonthly(d) }));
  const open = rows.filter((d) => OPEN_STAGES.includes(d.stage));
  const now = Date.now();
  const startMonth = new Date(); startMonth.setDate(1); startMonth.setHours(0, 0, 0, 0);
  return Response.json({
    deals: rows, staff: staff || [], clients: clients || [], stages: STAGES, sources: SOURCES, imported,
    me: session!.email,
    totals: {
      open: open.length,
      pipelineMonthly: open.reduce((s, d) => s + d.monthly, 0),
      due: open.filter((d) => d.next_action_at && Date.parse(d.next_action_at) <= now + 86400000 - (now % 86400000)).length,
      overdue: open.filter((d) => d.next_action_at && Date.parse(d.next_action_at) < now).length,
      wonThisMonth: rows.filter((d) => d.stage === "won" && Date.parse(d.updated_at) >= startMonth.getTime()).length,
      wonMonthlyThisMonth: rows.filter((d) => d.stage === "won" && Date.parse(d.updated_at) >= startMonth.getTime()).reduce((s, d) => s + d.monthly, 0),
    },
  });
}

/** POST → add a deal. */
export async function POST(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session, "view"); if (denied) return denied;
  const b = await req.json().catch(() => ({} as any));
  const { patch, error } = dealPatch({ business: "", ...b });
  if (error) return Response.json({ error }, { status: 400 });
  const row = { source: "manual", owner: session!.email, ...patch, created_by: session!.email, last_contact_at: null };
  const [d] = await sb<any[]>(`/crm_deals`, { method: "POST", body: JSON.stringify(row) });
  await addActivity(d.id, "system", `Deal added${b.note ? `: ${String(b.note).slice(0, 500)}` : ""}`, session!.email).catch(() => {});
  await audit(session!, "crm_deal_created", { req, targetType: "crm_deal", targetId: d.id, detail: { business: d.business } }).catch(() => {});
  return Response.json({ ok: true, deal: { ...d, monthly: dealMonthly(d) } }, { status: 201 });
}
