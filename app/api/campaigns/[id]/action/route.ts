export const runtime = "nodejs";
import { parseSession, unauthorized } from "@/lib/auth";
import { getCampaignRow, refreshCampaignFromCartesia, updateCampaignRow } from "@/lib/campaigns";
import { cancelCartesiaBatch, retryCartesiaBatch } from "@/lib/cartesia";

/** POST { action: "cancel" | "retry" | "refresh" } — retry re-dials the numbers that didn't connect. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = parseSession(req);
  if (!session) return unauthorized();
  const c = await getCampaignRow(session.clientId, decodeURIComponent(params.id));
  if (!c) return Response.json({ error: "Campaign not found" }, { status: 404 });
  if (!c.cartesia_batch_id) return Response.json({ error: "This campaign never reached Cartesia." }, { status: 400 });
  const { action } = await req.json().catch(() => ({}));
  try {
    if (action === "cancel") { await cancelCartesiaBatch(c.cartesia_batch_id); await updateCampaignRow(c.id, { status: "paused" }); }
    else if (action === "retry") { await retryCartesiaBatch(c.cartesia_batch_id); await updateCampaignRow(c.id, { status: "running", completed_at: null }); }
    else if (action !== "refresh") return Response.json({ error: "Unknown action" }, { status: 400 });
    const fresh = await refreshCampaignFromCartesia((await getCampaignRow(session.clientId, c.id))!);
    return Response.json({ ok: true, campaign: fresh });
  } catch (err: any) {
    return Response.json({ error: err?.message || "Cartesia rejected that action" }, { status: 502 });
  }
}
