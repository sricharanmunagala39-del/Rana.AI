export const runtime = "nodejs";
export const maxDuration = 300;
import { runBilling } from "@/lib/billing";
import { runLifecycle, recordCron } from "@/lib/lifecycle";

/** Daily (vercel.json): renewal invoices, overage invoices, and pausing workspaces with invoices >7 days overdue. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const ua = req.headers.get("user-agent") || "";
  const allowed = secret ? auth === `Bearer ${secret}` : ua.startsWith("vercel-cron/");
  if (!allowed) return Response.json({ error: "Forbidden" }, { status: 403 });
  try {
    const billing = await runBilling();
    const lifecycle = await runLifecycle();
    await recordCron("billing", true, { billing: billing.log.slice(0, 50), lifecycle: lifecycle.slice(0, 50) });
    return Response.json({ ok: true, ...billing, lifecycle });
  } catch (e: any) {
    await recordCron("billing", false, { error: String(e?.message || e).slice(0, 500) });
    return Response.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
