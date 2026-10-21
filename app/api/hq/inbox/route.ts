export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { requireHq } from "@/lib/hq";
import { sb } from "@/lib/db";
import { metaConfig } from "@/lib/meta";
import { inboxSettings } from "@/lib/metaInbox";
import { APP_URL } from "@/lib/notify";

/** GET ?filter=all|human|instagram|messenger → conversations (newest first), recent comments, settings and connection status. */
export async function GET(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session, "view"); if (denied) return denied;
  const f = new URL(req.url).searchParams.get("filter") || "all";
  const where = f === "human" ? "&needs_human=eq.true" : f === "instagram" || f === "messenger" ? `&platform=eq.${f}` : "";
  const [threads, comments, settings, counts] = await Promise.all([
    sb<any[]>(`/meta_threads?order=last_message_at.desc.nullslast&limit=300${where}`).catch(() => []),
    sb<any[]>(`/meta_comments?order=created_at.desc&limit=100`).catch(() => []),
    inboxSettings(),
    sb<any[]>(`/meta_threads?select=id&or=(unread.gt.0,needs_human.eq.true)&limit=1000`).catch(() => []),
  ]);
  return Response.json({
    threads: threads || [], comments: comments || [], settings, attention: (counts || []).length,
    config: metaConfig(), webhookUrl: `${APP_URL()}/api/webhooks/meta`, me: session!.email,
  });
}
