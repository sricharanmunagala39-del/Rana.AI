export const runtime = "nodejs";
export const maxDuration = 60;
import { getSession } from "@/lib/session";
import { requireHq } from "@/lib/hq";
import { sb } from "@/lib/db";
import { financeReport } from "@/lib/finance";
import { todayIST } from "@/lib/billing";

/** GET ?month=YYYY-MM → money in, money out, GST, profit per client, Sarvam credit balance. RANA HQ only. */
export async function GET(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session); if (denied) return denied;
  return Response.json(await financeReport(new URL(req.url).searchParams.get("month")));
}

/** POST { kind: "topup" | "balance", amount, date?, gstIncluded?, note? } → Sarvam ledger entry. { deleteId } removes a mistaken entry. */
export async function POST(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session); if (denied) return denied;
  const b = await req.json().catch(() => ({} as any));
  if (b.deleteId) {
    if (!/^[0-9a-f-]{36}$/i.test(String(b.deleteId))) return Response.json({ error: "Bad id" }, { status: 400 });
    await sb(`/sarvam_ledger?id=eq.${b.deleteId}`, { method: "DELETE", prefer: "return=minimal" });
    return Response.json({ ok: true });
  }
  if (!["topup", "balance"].includes(b.kind)) return Response.json({ error: "Choose top-up or balance reading." }, { status: 400 });
  const amount = Math.round(Number(b.amount) * 100) / 100;
  if (!(amount >= 0) || amount > 10_000_000 || (b.kind === "topup" && amount === 0)) return Response.json({ error: "Enter the amount in rupees." }, { status: 400 });
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(b.date || "")) && String(b.date) <= todayIST() ? String(b.date) : todayIST();
  const [row] = await sb<any[]>(`/sarvam_ledger`, { method: "POST", body: JSON.stringify({ kind: b.kind, amount, entry_date: date, gst_included: b.gstIncluded !== false, note: String(b.note || "").slice(0, 200) || null, created_by: session!.email }) });
  return Response.json({ ok: true, entry: row }, { status: 201 });
}
