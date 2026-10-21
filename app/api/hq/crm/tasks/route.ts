export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { requireHq } from "@/lib/hq";
import { sb } from "@/lib/db";
import { addActivity, hqStaffEmails } from "@/lib/crm";

const clip = (v: any, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const isId = (v: any) => /^[0-9a-f-]{36}$/i.test(String(v || ""));


/** GET ?scope=mine|all&done=0|1 → tasks with their lead's name, soonest first. */
export async function GET(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session, "view"); if (denied) return denied;
  const u = new URL(req.url);
  const scope = u.searchParams.get("scope") === "all" ? "all" : "mine";
  const done = u.searchParams.get("done") === "1";
  const who = scope === "mine" ? `&owner=eq.${encodeURIComponent(session!.email.toLowerCase())}` : "";
  const tasks = (await sb<any[]>(`/crm_tasks?done_at=${done ? "not.is.null" : "is.null"}${who}&order=${done ? "done_at.desc" : "due_at.asc.nullslast"}&limit=500`).catch(() => [])) || [];
  const ids = Array.from(new Set(tasks.map((t) => t.deal_id).filter(Boolean)));
  const deals = ids.length ? (await sb<any[]>(`/crm_deals?id=in.(${ids.join(",")})&select=id,business,phone,stage`).catch(() => [])) || [] : [];
  const byId = Object.fromEntries(deals.map((d) => [d.id, d]));
  return Response.json({ tasks: tasks.map((t) => ({ ...t, deal: t.deal_id ? byId[t.deal_id] || null : null })), me: session!.email });
}

/** POST { title, dueAt?, owner?, dealId? } → add a task (owner defaults to me). */
export async function POST(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session, "view"); if (denied) return denied;
  const b = await req.json().catch(() => ({} as any));
  const title = clip(b.title, 300);
  if (!title) return Response.json({ error: "Write what needs doing." }, { status: 400 });
  const t = b.dueAt ? Date.parse(b.dueAt) : NaN;
  const owner = clip(b.owner, 150).toLowerCase() || session!.email.toLowerCase();
  if (owner !== session!.email.toLowerCase() && !(await hqStaffEmails(session!.clientId)).has(owner)) return Response.json({ error: "Tasks can only be given to RANA HQ teammates." }, { status: 400 });
  const row = {
    title, due_at: Number.isFinite(t) ? new Date(t).toISOString() : null,
    owner,
    deal_id: isId(b.dealId) ? b.dealId : null, created_by: session!.email,
  };
  const [task] = await sb<any[]>(`/crm_tasks`, { method: "POST", body: JSON.stringify(row) });
  if (row.deal_id) {
    await addActivity(row.deal_id, "system", `Task: ${title}${row.due_at ? ` · due ${new Date(row.due_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : ""}${row.owner !== session!.email.toLowerCase() ? ` · for ${row.owner}` : ""}`, session!.email).catch(() => {});
    await sb(`/crm_deals?id=eq.${row.deal_id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ last_activity_at: new Date().toISOString() }) }).catch(() => {});
  }
  return Response.json({ ok: true, task }, { status: 201 });
}
