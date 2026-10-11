export const runtime = "nodejs";
export const maxDuration = 120;
import { recordCron } from "@/lib/lifecycle";
import { maybeSyncSheet, crmDigest } from "@/lib/crmSync";

/** Daily ~9:00 IST (vercel.json): pull the Google Sheet, then email follow-up reminders to the sales team. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Forbidden" }, { status: 403 });
  try {
    const sheet = await maybeSyncSheet(0);
    const digest = await crmDigest();
    await recordCron("crm-digest", true, { sheet: sheet ? (sheet.ok ? sheet.result : sheet.error) : null, digest });
    return Response.json({ ok: true, sheet, digest });
  } catch (e: any) {
    await recordCron("crm-digest", false, { error: String(e?.message || e).slice(0, 500) });
    return Response.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
