export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { hqCan } from "@/lib/hq";
import { sb } from "@/lib/db";
import { view } from "@/lib/crm";

/** GET → how many of my leads need a call (overdue or due today) plus my tasks due by tonight, for the sidebar badge. */
export async function GET(req: Request) {
  const session = await getSession(req);
  if (!hqCan(session, "view")) return Response.json({ due: 0 });
  const me = encodeURIComponent(session!.email.toLowerCase());
  const rows = ((await sb<any[]>(`/crm_deals?owner=eq.${me}&stage=in.(contacted,prospect,new)&next_action_at=not.is.null&select=stage,next_action_at,expected_close_at,last_activity_at,updated_at,created_at&limit=2000`).catch(() => [])) || []).map(view);
  const end = new Date(Date.now() + 5.5 * 3600e3); end.setUTCHours(23, 59, 59, 999);
  const tasks = (await sb<any[]>(`/crm_tasks?owner=eq.${me}&done_at=is.null&due_at=lte.${encodeURIComponent(new Date(end.getTime() - 5.5 * 3600e3).toISOString())}&select=id&limit=500`).catch(() => [])) || [];
  return Response.json({ due: rows.filter((d) => d.follow === "overdue" || d.follow === "today").length + tasks.length, tasks: tasks.length });
}
