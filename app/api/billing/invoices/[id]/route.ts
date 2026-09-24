export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { isHqEmail } from "@/lib/hq";
import { getInvoice, offlinePayment } from "@/lib/billing";

/** GET → one invoice, for the printable invoice page. The workspace's own team, or RANA HQ. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const inv = await getInvoice(params.id);
  const hq = isHqEmail(session.email) && !session.hqFrom;
  if (!inv || (inv.client_id !== session.clientId && !hq)) return Response.json({ error: "Invoice not found" }, { status: 404 });
  return Response.json({ invoice: inv, offline: offlinePayment() });
}
