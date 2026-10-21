export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { hqCan } from "@/lib/hq";
import { sb } from "@/lib/db";

/** GET → number of Instagram/Messenger chats that are unread or need a person, for the sidebar badge. */
export async function GET(req: Request) {
  const session = await getSession(req);
  if (!hqCan(session, "view")) return Response.json({ due: 0 });
  const rows = (await sb<any[]>(`/meta_threads?select=id&or=(unread.gt.0,needs_human.eq.true)&limit=1000`).catch(() => [])) || [];
  return Response.json({ due: rows.length });
}
