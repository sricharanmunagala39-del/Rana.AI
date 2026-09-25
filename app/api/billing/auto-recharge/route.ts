export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { hasRole } from "@/lib/auth";
import { sb } from "@/lib/db";
import { audit } from "@/lib/audit";
import { MIN_RECHARGE } from "@/lib/wallet";

/** PUT { below, amount } turns auto-recharge on; { off: true } turns it off. */
export async function PUT(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  if (!hasRole(session, "admin")) return Response.json({ error: "Only owners and admins can change auto-recharge." }, { status: 403 });
  const b = await req.json().catch(() => ({} as any));
  let patch: any;
  if (b.off) patch = { auto_recharge_below: null, auto_recharge_amount: null };
  else {
    const below = Math.round(Number(b.below)), amount = Math.round(Number(b.amount));
    if (!(below >= 500) || below > 500000) return Response.json({ error: "Set the trigger level between ₹500 and ₹5,00,000." }, { status: 400 });
    if (!(amount >= MIN_RECHARGE) || amount > 1000000) return Response.json({ error: `Recharge amount must be at least ₹${MIN_RECHARGE.toLocaleString("en-IN")}.` }, { status: 400 });
    patch = { auto_recharge_below: below, auto_recharge_amount: amount };
  }
  await sb(`/clients?id=eq.${session.clientId}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify(patch) });
  await audit(session, "billing_details_changed", { req, targetType: "client", targetId: session.clientId, detail: { autoRecharge: patch } });
  return Response.json({ ok: true });
}
