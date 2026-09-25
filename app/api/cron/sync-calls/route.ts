export const runtime = "nodejs";
export const maxDuration = 300;
import { syncAllClients } from "@/lib/callSync";
import { recordCron } from "@/lib/lifecycle";

/**
 * Vercel Cron (see vercel.json). Hobby plan crons run once a day, so this is the safety net;
 * the dashboard also syncs on load. Vercel sends `Authorization: Bearer $CRON_SECRET` when
 * CRON_SECRET is set — set it in Vercel and this route rejects everyone else.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const ua = req.headers.get("user-agent") || "";
  const allowed = !!secret && auth === `Bearer ${secret}`; // CRON_SECRET is required (Vercel sends it automatically)
  if (!allowed) return Response.json({ error: "Forbidden" }, { status: 403 });
  let results;
  try { results = await syncAllClients(); }
  catch (e: any) { await recordCron("sync-calls", false, { error: String(e?.message || e).slice(0, 500) }); throw e; }
  await recordCron("sync-calls", true, { clients: results.length, errors: results.reduce((a: number, r: any) => a + (r.errors?.length || 0), 0) });
  return Response.json({ ok: true, results: results.map((r) => ({ ...r, errors: r.errors.slice(0, 5) })) });
}
