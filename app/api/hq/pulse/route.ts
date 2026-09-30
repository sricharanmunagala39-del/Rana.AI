export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { requireHq } from "@/lib/hq";
import { sb } from "@/lib/db";

/** GET → the HQ command centre's live pulse: latest calls across every client, website conversations and new demo requests. */
export async function GET(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session, "view"); if (denied) return denied;
  const day = new Date(Date.now() - 24 * 3600e3).toISOString();
  const [calls, clients, talks, demos] = await Promise.all([
    sb<any[]>(`/calls?created_at=gte.${encodeURIComponent(day)}&or=(source.is.null,source.neq.manual)&select=id,client_id,direction,caller_name,duration_seconds,lead_status,summary,created_at&order=created_at.desc&limit=40`).catch(() => []),
    sb<any[]>(`/clients?select=id,name`).catch(() => []),
    sb<any[]>(`/web_talks?started_at=gte.${encodeURIComponent(day)}&select=id,kind,scenario,language,market,started_at,ended_at,seconds,result,demo_request_id&order=started_at.desc&limit=40`).catch(() => []),
    sb<any[]>(`/demo_requests?status=eq.new&select=id,company,name,created_at&order=created_at.desc&limit=10`).catch(() => []),
  ]);
  const name = Object.fromEntries((clients || []).map((c: any) => [c.id, c.name]));
  const live = (talks || []).filter((t: any) => !t.ended_at && Date.now() - Date.parse(t.started_at) < 200e3).length;
  return Response.json({
    now: new Date().toISOString(),
    calls: (calls || []).map((c: any) => ({ id: c.id, client: name[c.client_id] || "—", direction: c.direction, name: c.caller_name, seconds: Number(c.duration_seconds) || 0, lead: c.lead_status, summary: c.summary?.slice(0, 180) || null, at: c.created_at })),
    web: {
      live, today: (talks || []).length,
      talks: (talks || []).map((t: any) => ({ id: t.id, kind: t.kind, scenario: t.scenario, lang: t.language, market: t.market, at: t.started_at, seconds: Number(t.seconds) || 0, open: !t.ended_at, interest: t.result?.interest || null, who: t.result?.company || t.result?.name || t.result?.business || null, outcome: t.result?.outcome || t.result?.summary || null, booked: !!t.demo_request_id })),
    },
    demos: demos || [],
  });
}
