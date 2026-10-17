export const runtime = "nodejs";
export const maxDuration = 300;
import { recordCron } from "@/lib/lifecycle";
import { tick } from "@/lib/salesEngine/engine";
import { prodDeps, tablesReady } from "@/lib/salesEngine/prod";
import { SupabaseStore } from "@/lib/salesEngine/supabaseStore";

/** Keeps running Sales Engine campaigns moving when nobody has the dashboard open (follow-ups, callbacks). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Forbidden" }, { status: 403 });
  if (!(await tablesReady())) return Response.json({ ok: true, skipped: "tables not set up" });
  const started = Date.now();
  const out: any[] = [];
  try {
    const due = (await new SupabaseStore(null).listCampaigns(50)).filter((c) => c.status === "running" && (!c.nextRunAt || Date.parse(c.nextRunAt) <= Date.now()));
    for (const c of due) {
      if (Date.now() - started > 240_000) break;
      const r = await tick(await prodDeps(c.mode), c.id, { budgetMs: 45_000, maxItems: 60 }).catch((e) => ({ worked: 0, message: String(e?.message || e) } as any));
      out.push({ id: c.id, worked: r.worked, message: r.message || null });
    }
    await recordCron("sales-engine", true, { campaigns: out.length });
    return Response.json({ ok: true, ran: out });
  } catch (e: any) {
    await recordCron("sales-engine", false, { error: String(e?.message || e).slice(0, 500) });
    return Response.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
