export const runtime = "nodejs";
import { unauthorized, forbidUnless } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getClientById } from "@/lib/supabase";
import { rulesFromClient, insideWindow, describeRules } from "@/lib/compliance";
import { getCampaignRow, refreshCampaignFromCartesia, updateCampaignRow } from "@/lib/campaigns";
import { cancelCartesiaBatch, retryCartesiaBatch } from "@/lib/cartesia";
import { sarvamConfig, setSarvamCampaignStatus } from "@/lib/sarvamAgent";
import { getSession } from "@/lib/session";

/** POST { action: "cancel" | "retry" | "refresh" } — retry re-dials the numbers that didn't connect. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  const c = await getCampaignRow(session.clientId, decodeURIComponent(params.id));
  if (!c) return Response.json({ error: "Campaign not found" }, { status: 404 });
  if (!c.cartesia_batch_id) return Response.json({ error: "This campaign never reached the calling engine." }, { status: 400 });
  const onSarvam = (c as any).engine === "sarvam";
  const { action } = await req.json().catch(() => ({}));
  if (action === "cancel" || action === "retry") { const denied = forbidUnless(session, "manager"); if (denied) return denied; }
  if (action === "retry") {
    const rules = rulesFromClient(await getClientById(session.clientId));
    if (!insideWindow(rules)) return Response.json({ error: `It's outside your calling hours (${describeRules(rules)}). Re-dial when the window opens.` }, { status: 409 });
  }
  try {
    if (onSarvam && (action === "cancel" || action === "retry")) {
      const cfg = sarvamConfig();
      if (!cfg) return Response.json({ error: "Sarvam isn't configured." }, { status: 500 });
      if (action === "retry") return Response.json({ error: "Sarvam already re-dials busy and unanswered numbers twice, an hour apart. To try the rest again, start a new campaign with the numbers that didn't connect (Export CSV → filter DNP)." }, { status: 400 });
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
    return Response.json({ error: err?.message || "The calling engine rejected that action" }, { status: 502 });
  }
}
