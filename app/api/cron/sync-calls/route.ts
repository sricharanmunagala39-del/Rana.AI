export const runtime = "nodejs";
export const maxDuration = 300;
import { syncAllClients } from "@/lib/callSync";

/**
 * Vercel Cron (see vercel.json). Hobby plan crons run once a day, so this is the safety net;
 * the dashboard also syncs on load. Vercel sends `Authorization: Bearer $CRON_SECRET` when
 * CRON_SECRET is set — set it in Vercel and this route rejects everyone else.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const ua = req.headers.get("user-agent") || "";
  const allowed = secret ? auth === `Bearer ${secret}` : ua.startsWith("vercel-cron/");
  if (!allowed) return Response.json({ error: "Forbidden" }, { status: 403 });
  const results = await syncAllClients();
  return Response.json({ ok: true, results: results.map((r) => ({ ...r, errors: r.errors.slice(0, 5) })) });
}
