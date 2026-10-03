export const runtime = "nodejs";
import { hideVendors } from "@/lib/voice/brand";
import { engineOfCampaign } from "@/lib/voice/engines";
import { unauthorized, forbidUnless } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getClientById } from "@/lib/supabase";
import { rulesFromClient, insideWindow, describeRules } from "@/lib/compliance";
import { getCampaignRow, refreshCampaignFromCartesia, updateCampaignRow } from "@/lib/campaigns";
import { cancelCartesiaBatch, retryCartesiaBatch } from "@/lib/cartesia";
import { sarvamConfig, setSarvamCampaignStatus } from "@/lib/sarvamAgent";
import { getSession } from "@/lib/session";
import { sb } from "@/lib/db";
import { localDate } from "@/lib/tz";

/** POST { action: "cancel" | "retry" | "refresh" } — retry re-dials the numbers that didn't connect. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  const c = await getCampaignRow(session.clientId, decodeURIComponent(params.id));
  if (!c) return Response.json({ error: "Campaign not found" }, { status: 404 });
  if (!c.cartesia_batch_id) return Response.json({ error: "This campaign never reached the calling engine." }, { status: 400 });
  const onSarvam = engineOfCampaign(c as any) === "sarvam";
  const { action } = await req.json().catch(() => ({}));
  if (action === "cancel" || action === "retry") { const denied = forbidUnless(session, "manager"); if (denied) return denied; }
  if (action === "retry") {
    const client: any = await getClientById(session.clientId);
    const rules = rulesFromClient(client);
    if (!insideWindow(rules)) return Response.json({ error: `It's outside your calling hours (${describeRules(rules)}). Re-dial when the window opens.` }, { status: 409 });
    // UAE telemarketing rules: an unanswered number may be called at most once a day and twice a week.
    if (client?.market === "ae") {
      const since = new Date(Date.now() - 7 * 86400e3).toISOString();
      const rows = (await sb<any[]>(`/calls?client_id=eq.${session.clientId}&campaign_id=eq.${encodeURIComponent(c.cartesia_batch_id)}&created_at=gte.${encodeURIComponent(since)}&select=created_at&order=created_at.desc&limit=5000`).catch(() => [])) || [];
      const days = new Set(rows.map((r) => localDate(rules.timezone, Date.parse(r.created_at))));
      if (days.has(localDate(rules.timezone))) return Response.json({ error: "UAE rules allow one call a day to a number that didn't answer. These numbers were already called today — retry tomorrow." }, { status: 409 });
      if (days.size >= 2) return Response.json({ error: "UAE rules allow at most two calls a week to a number that didn't answer. These numbers have already been called twice this week." }, { status: 409 });
    }
  }
  try {
    if (onSarvam && (action === "cancel" || action === "retry")) {
      const cfg = sarvamConfig();
      if (!cfg) return Response.json({ error: "Calling isn't switched on for your account yet — RANA support has been notified." }, { status: 500 });
      if (action === "retry") return Response.json({ error: "RANA already re-dials busy and unanswered numbers twice, an hour apart. To try the rest again, start a new campaign with the numbers that didn't connect (Export CSV → filter DNP)." }, { status: 400 });
      await setSarvamCampaignStatus(cfg, (c as any).sarvam_campaign_id || c.cartesia_batch_id, "cancel");
      await updateCampaignRow(c.id, { status: "paused" });
    }
    else if (action === "cancel") { await cancelCartesiaBatch(c.cartesia_batch_id); await updateCampaignRow(c.id, { status: "paused" }); }
    else if (action === "retry") { await retryCartesiaBatch(c.cartesia_batch_id); await updateCampaignRow(c.id, { status: "running", completed_at: null }); }
    if (action === "cancel" || action === "retry") await audit(session, action === "cancel" ? "campaign_cancelled" : "campaign_retried", { req, targetType: "campaign", targetId: c.id, detail: { name: c.name } });
    if (action !== "cancel" && action !== "retry" && action !== "refresh") return Response.json({ error: "Unknown action" }, { status: 400 });
    const fresh = await refreshCampaignFromCartesia((await getCampaignRow(session.clientId, c.id))!);
    return Response.json({ ok: true, campaign: fresh });
  } catch (err: any) {
    return Response.json({ error: hideVendors(err?.message) || "The calling engine rejected that action" }, { status: 502 });
  }
}
