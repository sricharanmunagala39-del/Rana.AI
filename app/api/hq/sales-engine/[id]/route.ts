export const runtime = "nodejs";
export const maxDuration = 60;
import { getSession } from "@/lib/session";
import { requireHq } from "@/lib/hq";
import { audit } from "@/lib/audit";
import { tick, control, counters } from "@/lib/salesEngine/engine";
import { prodDeps } from "@/lib/salesEngine/prod";
import { SupabaseStore } from "@/lib/salesEngine/supabaseStore";
import { callingWindow } from "@/lib/salesEngine/rules";

/** GET → one campaign: counters (from saved records), prospects, recent calls and the run log. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  const denied = requireHq(session, "view"); if (denied) return denied;
  const store = new SupabaseStore(null);
  const c = await store.getCampaign(params.id);
  if (!c) return Response.json({ error: "Campaign not found" }, { status: 404 });
  const [prospects, events] = await Promise.all([store.listProspects(c.id), store.listEvents(c.id)]);
  const calls = events.filter((e) => e.kind === "call" || e.kind === "booking" || e.kind === "booking_failed" || e.kind === "error").slice(-60).reverse();
  return Response.json({
    campaign: { ...c, config: { ...c.config, uploadedList: undefined, uploadedCount: c.config.uploadedList?.length || 0 } },
    window: callingWindow(c.config).law,
    counters: counters(prospects, events),
    prospects: prospects.sort((a, b) => (b.score ?? -1) - (a.score ?? -1)).slice(0, 300),
    events: calls,
  });
}

/** POST { action: pause | resume | cancel | retry | tick } */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  const b = await req.json().catch(() => ({} as any));
  const denied = requireHq(session, b.action === "tick" ? "view" : "clients"); if (denied) return denied;
  const store = new SupabaseStore(null);
  const c = await store.getCampaign(params.id);
  if (!c) return Response.json({ error: "Campaign not found" }, { status: 404 });
  if (b.action === "tick") {
    if (c.status !== "running") return Response.json({ ok: true, campaign: c, worked: 0 });
    const r = await tick(await prodDeps(c.mode), c.id, { budgetMs: 25_000 });
    return Response.json({ ok: true, campaign: r.campaign, worked: r.worked, waitingUntil: r.waitingUntil, message: r.message || null });
  }
  if (!["pause", "resume", "cancel", "retry"].includes(b.action)) return Response.json({ error: "Unknown action" }, { status: 400 });
  const r = await control(store, c.id, b.action, session!.email);
  if (r.error) return Response.json({ error: r.error }, { status: 409 });
  if (b.action === "cancel" || b.action === "retry")
    await audit(session!, b.action === "cancel" ? "campaign_cancelled" : "campaign_retried", { req, targetType: "sales_engine", targetId: c.id, detail: { name: c.name } }).catch(() => {});
  return Response.json({ ok: true, campaign: r.campaign });
}
