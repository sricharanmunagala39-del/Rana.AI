export const runtime = "nodejs";
export const maxDuration = 60;
import { getSession } from "@/lib/session";
import { zoneOf } from "@/lib/tz";
import { getClientById } from "@/lib/supabase";
import { unauthorized } from "@/lib/auth";
import { normalizeFilter, runReport, previewRows, COLUMNS, DEFAULT_COLUMNS, LEAD_CHOICES } from "@/lib/reports";

/** GET ?from&to&direction&campaign&leads&connected&columns — live stats + a preview of the rows for the Reports page. */
export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  const tz = zoneOf(await getClientById(session.clientId).catch(() => null));
  const f = normalizeFilter(Object.fromEntries(new URL(req.url).searchParams), tz);
  try {
    const rep = await runReport(session.clientId, f, tz);
    return Response.json({
      filter: f, stats: rep.stats, preview: previewRows(rep.rows, rep.ctx, f.columns),
      columns: COLUMNS.map((c) => ({ key: c.key, label: c.key === "when" ? `Date & time` : c.label })), timezone: tz, listColumns: rep.listVars.map((v) => ({ key: `list:${v}`, label: v })),
      defaultColumns: DEFAULT_COLUMNS, leadChoices: LEAD_CHOICES, campaigns: rep.campaigns,
    });
  } catch (e: any) {
    console.error("[reports]", e?.message);
    return Response.json({ error: "Couldn't build the report just now. Please try again." }, { status: 500 });
  }
}
