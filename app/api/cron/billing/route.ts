export const runtime = "nodejs";
export const maxDuration = 300;
import { runBilling } from "@/lib/billing";

/** Daily (vercel.json): renewal invoices, overage invoices, and pausing workspaces with invoices >7 days overdue. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const ua = req.headers.get("user-agent") || "";
  const allowed = secret ? auth === `Bearer ${secret}` : ua.startsWith("vercel-cron/");
  if (!allowed) return Response.json({ error: "Forbidden" }, { status: 403 });
  return Response.json({ ok: true, ...(await runBilling()) });
}
