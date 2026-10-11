export const runtime = "nodejs";
export const maxDuration = 60;
import { getSession } from "@/lib/session";
import { requireHq } from "@/lib/hq";
import { sb } from "@/lib/db";
import { sheetCsvUrl } from "@/lib/crm";
import { syncSheet } from "@/lib/crmSync";

/** PUT { sheetUrl, sheetOwner } → link (or unlink) the Google Sheet and sync it once. Founders + Operations. */
export async function PUT(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session, "clients"); if (denied) return denied;
  const b = await req.json().catch(() => ({} as any));
  const url = String(b.sheetUrl || "").trim();
  if (url && !sheetCsvUrl(url)) return Response.json({ error: "Paste the link of a Google Sheet (docs.google.com/spreadsheets/…)." }, { status: 400 });
  await sb(`/crm_settings?id=eq.1`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ sheet_url: url || null, sheet_owner: b.sheetOwner ? String(b.sheetOwner).toLowerCase().slice(0, 150) : null, sheet_last_sync: null, sheet_last_result: null, updated_at: new Date().toISOString(), updated_by: session!.email }) });
  if (!url) return Response.json({ ok: true, unlinked: true });
  const r = await syncSheet(session!.email);
  return Response.json(r, { status: r.ok ? 200 : 400 });
}

/** POST → sync the linked sheet now (anyone on the sales team). */
export async function POST(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session, "view"); if (denied) return denied;
  const r = await syncSheet(session!.email);
  return Response.json(r, { status: r.ok ? 200 : 400 });
}
