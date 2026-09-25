export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { requireHq } from "@/lib/hq";
import { sb } from "@/lib/db";
import { audit } from "@/lib/audit";
import { walletOf } from "@/lib/wallet";

/** GET → the client's prepaid wallet. POST { amount, note } → HQ adjustment (goodwill credit, correction; negative allowed). */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  const denied = requireHq(session, "view"); if (denied) return denied;
  const [c] = (await sb<any[]>(`/clients?id=eq.${params.id.replace(/[^0-9a-f-]/gi, "")}&is_hq=eq.false&limit=1`)) || [];
  if (!c) return Response.json({ error: "Client not found" }, { status: 404 });
  return Response.json({ wallet: c.plan === "trial" ? null : await walletOf(c) });
}
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  const denied = requireHq(session, "billing"); if (denied) return denied;
  const [c] = (await sb<any[]>(`/clients?id=eq.${params.id.replace(/[^0-9a-f-]/gi, "")}&is_hq=eq.false&limit=1`)) || [];
  if (!c) return Response.json({ error: "Client not found" }, { status: 404 });
  const b = await req.json().catch(() => ({} as any));
  const amount = Math.round(Number(b.amount) * 100) / 100;
  if (!amount || Math.abs(amount) > 1_000_000) return Response.json({ error: "Enter an amount in rupees (negative to take back)." }, { status: 400 });
  const note = String(b.note || "").trim().slice(0, 200) || (amount > 0 ? "Credit from RANA" : "Correction by RANA");
  await sb(`/wallet_ledger`, { method: "POST", prefer: "return=minimal", body: JSON.stringify({ client_id: c.id, kind: "adjust", amount, note, created_by: `HQ ${session!.email}` }) });
  if (!c.wallet_enabled) await sb(`/clients?id=eq.${c.id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ wallet_enabled: true }) });
  await audit({ clientId: c.id, email: session!.email }, "hq_client_updated", { req, targetType: "client", targetId: c.id, detail: { by: "RANA HQ", walletAdjust: amount, note } });
  return Response.json({ ok: true, wallet: await walletOf({ ...c, wallet_enabled: true }) });
}
