export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { requireHq } from "@/lib/hq";
import { sb } from "@/lib/db";
import { addActivity, hqStaffEmails } from "@/lib/crm";

const ok = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

/** PATCH { done?, title?, dueAt?, owner? } → tick off (or reopen) or edit a task. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  const denied = requireHq(session, "view"); if (denied) return denied;
  if (!ok(params.id)) return Response.json({ error: "Not found" }, { status: 404 });
  const [cur] = (await sb<any[]>(`/crm_tasks?id=eq.${params.id}&limit=1`)) || [];
  if (!cur) return Response.json({ error: "Not found" }, { status: 404 });
  const b = await req.json().catch(() => ({} as any));
  const patch: any = {};
  if ("done" in b) { patch.done_at = b.done ? new Date().toISOString() : null; patch.done_by = b.done ? session!.email : null; }
  if ("title" in b) { const t = String(b.title || "").trim().slice(0, 300); if (!t) return Response.json({ error: "Write what needs doing." }, { status: 400 }); patch.title = t; }
  if ("dueAt" in b) { const t = b.dueAt ? Date.parse(b.dueAt) : NaN; patch.due_at = Number.isFinite(t) ? new Date(t).toISOString() : null; }
  if ("owner" in b) {
    const o = String(b.owner || "").trim().toLowerCase().slice(0, 150);
    if (!o || (o !== session!.email.toLowerCase() && !(await hqStaffEmails(session!.clientId)).has(o))) return Response.json({ error: "Tasks can only be given to RANA HQ teammates." }, { status: 400 });
    patch.owner = o;
  }
  if (!Object.keys(patch).length) return Response.json({ error: "Nothing to change" }, { status: 400 });
  const [task] = await sb<any[]>(`/crm_tasks?id=eq.${cur.id}`, { method: "PATCH", body: JSON.stringify(patch) });
  if (cur.deal_id && "done" in b && !!b.done !== !!cur.done_at) {
    await addActivity(cur.deal_id, "system", `${b.done ? "Task done" : "Task reopened"}: ${cur.title}`, session!.email).catch(() => {});
    await sb(`/crm_deals?id=eq.${cur.deal_id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ last_activity_at: new Date().toISOString() }) }).catch(() => {});
  }
  return Response.json({ ok: true, task });
}

/** DELETE → remove a task (its creator or a founder/ops). */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  const denied = requireHq(session, "view"); if (denied) return denied;
  if (!ok(params.id)) return Response.json({ error: "Not found" }, { status: 404 });
  const [cur] = (await sb<any[]>(`/crm_tasks?id=eq.${params.id}&select=id,created_by&limit=1`)) || [];
  if (!cur) return Response.json({ error: "Not found" }, { status: 404 });
  const mine = String(cur.created_by || "").toLowerCase() === session!.email.toLowerCase();
  if (!mine && requireHq(session, "clients")) return Response.json({ error: "Only the person who added it, a founder or Operations can delete a task." }, { status: 403 });
  await sb(`/crm_tasks?id=eq.${cur.id}`, { method: "DELETE", prefer: "return=minimal" });
  return Response.json({ ok: true });
}
