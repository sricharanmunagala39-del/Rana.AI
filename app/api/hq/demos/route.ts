export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { requireHq } from "@/lib/hq";
import { sb } from "@/lib/db";

const STATUSES = ["new", "contacted", "demo_booked", "won", "lost"];

/** GET — demo requests from the website, newest first. */
export async function GET(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session, "view"); if (denied) return denied;
  const rows = (await sb<any[]>(`/demo_requests?order=created_at.desc&limit=500&select=id,created_at,name,phone,email,company,industry,wants,languages,volume,best_time,message,source,status,note,updated_at,updated_by`).catch(() => [])) || [];
  return Response.json({ rows });
}

/** PATCH { id, status?, note? } — move a request along. */
export async function PATCH(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session, "clients"); if (denied) return denied;
  const b = await req.json().catch(() => ({} as any));
  if (!/^[0-9a-f-]{36}$/i.test(String(b.id || ""))) return Response.json({ error: "Bad id" }, { status: 400 });
  const patch: any = { updated_at: new Date().toISOString(), updated_by: session!.email };
  if (b.status !== undefined) { if (!STATUSES.includes(b.status)) return Response.json({ error: "Bad status" }, { status: 400 }); patch.status = b.status; }
  if (b.note !== undefined) patch.note = String(b.note || "").slice(0, 1000) || null;
  const r = await sb<any[]>(`/demo_requests?id=eq.${b.id}`, { method: "PATCH", body: JSON.stringify(patch) });
  return Response.json({ ok: true, row: r?.[0] || null });
}
