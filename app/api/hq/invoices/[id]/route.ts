export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { requireHq } from "@/lib/hq";
import { audit } from "@/lib/audit";
import { getInvoice, markPaid, voidInvoice } from "@/lib/billing";

/** POST { action: "mark_paid", via?, ref? } | { action: "void" } — for bank transfers, cheques and mistakes. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  const denied = requireHq(session, "billing"); if (denied) return denied;
  const inv = await getInvoice(params.id);
  if (!inv) return Response.json({ error: "Invoice not found" }, { status: 404 });
  const b = await req.json().catch(() => ({} as any));
  try {
    if (b.action === "mark_paid") {
      if (inv.status === "void") return Response.json({ error: "This invoice was cancelled." }, { status: 400 });
      const via = ["bank transfer", "upi", "cheque", "cash", "razorpay", "other"].includes(String(b.via)) ? String(b.via) : "bank transfer";
      const r = await markPaid(inv.id, { via, ref: String(b.ref || "").slice(0, 100) || null });
      if (!r.already) await audit({ clientId: inv.client_id, email: session!.email }, "invoice_paid", { req, targetType: "invoice", targetId: inv.id, detail: { by: "RANA HQ", number: inv.number, total: inv.total, via } });
      return Response.json({ ok: true, invoice: await getInvoice(inv.id), already: r.already });
    }
    if (b.action === "void") {
      const v = await voidInvoice(inv);
      await audit({ clientId: inv.client_id, email: session!.email }, "invoice_voided", { req, targetType: "invoice", targetId: inv.id, detail: { by: "RANA HQ", number: inv.number } });
      return Response.json({ ok: true, invoice: v });
    }
  } catch (e: any) {
    return Response.json({ error: String(e?.message || e) }, { status: 400 });
  }
  return Response.json({ error: "Unknown action" }, { status: 400 });
}
