export const runtime = "nodejs";
export const maxDuration = 60;
import { getSession } from "@/lib/session";
import { requireHq } from "@/lib/hq";
import { audit } from "@/lib/audit";
import { importLeads } from "@/lib/crm";

/** POST { leads: [{business, contactName, phone, email, city, industry, notes}], owner?, industry?, fileName? } → add to New, skipping duplicates. */
export async function POST(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session, "view"); if (denied) return denied;
  const b = await req.json().catch(() => ({} as any));
  const leads = Array.isArray(b.leads) ? b.leads : [];
  if (!leads.length) return Response.json({ error: "No rows to add." }, { status: 400 });
  if (leads.length > 5000) return Response.json({ error: "Upload at most 5,000 leads at a time." }, { status: 400 });
  const owner = b.owner ? String(b.owner).toLowerCase().slice(0, 150) : null;
  const batch = `upload:${new Date().toISOString().slice(0, 16)}:${String(b.fileName || "").slice(0, 60)}`;
  const r = await importLeads(leads, { source: "upload", owner, by: session!.email, batch, defaultIndustry: b.industry || null });
  await audit(session!, "crm_deal_created", { req, targetType: "crm_import", targetId: batch, detail: { added: r.added, duplicates: r.duplicates, skipped: r.skipped, file: b.fileName || null } }).catch(() => {});
  return Response.json({ ok: true, ...r, addedIds: undefined });
}
