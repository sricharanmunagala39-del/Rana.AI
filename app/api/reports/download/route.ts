export const runtime = "nodejs";
export const maxDuration = 60;
import { getSession } from "@/lib/session";
import { unauthorized, forbidUnless } from "@/lib/auth";
import { getClientById } from "@/lib/supabase";
import { audit } from "@/lib/audit";
import { normalizeFilter, runReport, reportXlsx, columnDefs } from "@/lib/reports";

/** GET (same filters as /api/reports) &format=xlsx|csv — the report as an Excel (or CSV) file. */
export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  const denied = forbidUnless(session, "manager"); if (denied) return denied;
  const sp = new URL(req.url).searchParams;
  const f = normalizeFilter(Object.fromEntries(sp));
  const client = await getClientById(session.clientId);
  const rep = await runReport(session.clientId, f);
  const base = `RANA_calls_${f.from}_to_${f.to}`;
  await audit(session, "report_downloaded", { req, detail: { from: f.from, to: f.to, rows: rep.rows.length, columns: f.columns.length, format: sp.get("format") || "xlsx" } });
  if (sp.get("format") === "csv") {
    const defs = columnDefs(f.columns);
    const esc = (v: unknown) => { const s = v == null ? "" : typeof v === "object" ? String((v as any).link || "") : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = [defs.map((d) => esc(d.label)).join(","), ...rep.rows.map((r) => defs.map((d) => esc(d.get(r, rep.ctx))).join(","))];
    return new Response("﻿" + lines.join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.csv"` } });
  }
  const file = reportXlsx(rep, f, client?.name || "RANA AI");
  return new Response(file as any, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${base}.xlsx"`, "Cache-Control": "no-store" } });
}
