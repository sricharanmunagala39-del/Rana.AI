export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { requireHq, hqCan } from "@/lib/hq";
import { sb } from "@/lib/db";
import { audit } from "@/lib/audit";
import { dealPatch, addActivity, importDemoRequests, view, STAGES, SOURCES, INDUSTRIES, OPEN_STAGES, NEEDS_FOLLOW_UP } from "@/lib/crm";
import { crmSettings, maybeSyncSheet } from "@/lib/crmSync";
import { APP_URL } from "@/lib/notify";

/** GET → every lead (newest activity first) plus counts, staff, and how leads come in. Pulls website requests and the Google Sheet first. */
export async function GET(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session, "view"); if (denied) return denied;
  const [imported, synced] = await Promise.all([importDemoRequests().catch(() => 0), maybeSyncSheet(10)]);
  const [deals, staff, clients, s] = await Promise.all([
    sb<any[]>(`/crm_deals?order=last_activity_at.desc.nullslast&limit=5000`).catch(() => []),
    sb<any[]>(`/users?client_id=eq.${session!.clientId}&is_active=eq.true&select=email,name,designation&order=created_at.asc`).catch(() => []),
    sb<any[]>(`/clients?is_hq=eq.false&select=id,name,plan,status&order=name.asc`).catch(() => []),
    crmSettings(),
  ]);
  const rows = (deals || []).map(view);
  const open = rows.filter((d) => OPEN_STAGES.includes(d.stage));
  const startMonth = new Date(); startMonth.setDate(1); startMonth.setHours(0, 0, 0, 0);
  const won = rows.filter((d) => d.stage === "deal" && Date.parse(d.updated_at) >= startMonth.getTime());
  const manager = hqCan(session, "clients");
  return Response.json({
    deals: rows, staff: staff || [], clients: clients || [], stages: STAGES, sources: SOURCES, industries: INDUSTRIES.map(({ key, label }) => ({ key, label })),
    needsFollowUp: NEEDS_FOLLOW_UP, canDelete: hqCan(session, "team"), imported, synced: synced?.result?.added || 0, me: session!.email, manager,
    sheet: { url: s.sheet_url || "", owner: s.sheet_owner || "", lastSync: s.sheet_last_sync || null, lastResult: s.sheet_last_result || null },
    inbox: manager && s.inbox_key ? `${APP_URL()}/api/webhooks/crm-inbox?key=${s.inbox_key}` : null,
    totals: {
      open: open.length,
      overdue: open.filter((d) => d.follow === "overdue").length,
      today: open.filter((d) => d.follow === "today").length,
      delayed: open.filter((d) => d.delayed).length,
      pipelineMonthly: rows.filter((d) => d.stage === "prospect").reduce((n, d) => n + d.monthly, 0),
      wonThisMonth: won.length, wonMonthlyThisMonth: won.reduce((n, d) => n + d.monthly, 0),
    },
  });
}

/** POST → add one lead (goes to New unless a stage is given). */
export async function POST(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session, "view"); if (denied) return denied;
  const b = await req.json().catch(() => ({} as any));
  const { patch, error } = dealPatch({ business: "", ...b });
  if (error) return Response.json({ error }, { status: 400 });
  if (!patch.phone && !patch.email) return Response.json({ error: "Add a phone number or an email." }, { status: 400 });
  if (patch.phone) {
    const [dup] = (await sb<any[]>(`/crm_deals?phone=eq.${encodeURIComponent(patch.phone)}&select=id,business,stage,owner&limit=1`).catch(() => [])) || [];
    if (dup && !b.force) return Response.json({ error: `This number is already in the CRM: ${dup.business}${dup.owner ? ` (owner ${dup.owner})` : ""}.`, duplicate: dup }, { status: 409 });
  }
  if (NEEDS_FOLLOW_UP.includes(patch.stage) && !patch.next_action_at) return Response.json({ error: "Pick the next follow-up date." }, { status: 400 });
  const now = new Date().toISOString();
  const row = { source: "manual", owner: session!.email, stage: "new", ...patch, industry: patch.industry || view({ business: patch.business }).industry, created_by: session!.email, last_activity_at: now };
  const [d] = await sb<any[]>(`/crm_deals`, { method: "POST", body: JSON.stringify(row) });
  await addActivity(d.id, "system", `Lead added${b.note ? `: ${String(b.note).slice(0, 500)}` : ""}`, session!.email).catch(() => {});
  await audit(session!, "crm_deal_created", { req, targetType: "crm_deal", targetId: d.id, detail: { business: d.business } }).catch(() => {});
  return Response.json({ ok: true, deal: view(d) }, { status: 201 });
}
