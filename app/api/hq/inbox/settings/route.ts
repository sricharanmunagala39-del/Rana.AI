export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { requireHq } from "@/lib/hq";
import { sb } from "@/lib/db";
import { checkConnection } from "@/lib/meta";

/** GET → check the Meta connection (which Page / Instagram account the token reaches). */
export async function GET(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session, "view"); if (denied) return denied;
  return Response.json(await checkConnection());
}
/** PUT { autoReply?, aiReplies?, maxPerDay?, alertEmails? } → founders / Operations change the inbox switches. */
export async function PUT(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session, "clients"); if (denied) return denied;
  const b = await req.json().catch(() => ({} as any));
  const rows: any[] = [];
  const now = new Date().toISOString();
  if ("autoReply" in b) rows.push({ key: "auto_reply", value: !!b.autoReply });
  if ("aiReplies" in b) rows.push({ key: "ai_replies", value: !!b.aiReplies });
  if ("maxPerDay" in b) rows.push({ key: "max_agent_replies_per_day", value: Math.max(1, Math.min(50, Math.round(Number(b.maxPerDay) || 15))) });
  if ("alertEmails" in b) rows.push({ key: "alert_emails", value: (Array.isArray(b.alertEmails) ? b.alertEmails : String(b.alertEmails || "").split(",")).map((e: any) => String(e).trim().toLowerCase()).filter((e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)).slice(0, 10) });
  if (!rows.length) return Response.json({ error: "Nothing to change" }, { status: 400 });
  await sb(`/meta_settings?on_conflict=key`, { method: "POST", prefer: "return=minimal,resolution=merge-duplicates", body: JSON.stringify(rows.map((r) => ({ ...r, updated_by: session!.email, updated_at: now }))) });
  return Response.json({ ok: true });
}
