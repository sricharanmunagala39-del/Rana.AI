export const runtime = "nodejs";
export const maxDuration = 60;
import { parseSession, unauthorized } from "@/lib/auth";
import { getScriptById } from "@/lib/supabase";
import { listCartesiaPhoneNumbers, createCartesiaBatch } from "@/lib/cartesia";
import { createCampaignRow, updateCampaignRow, listCampaignRows, insertContacts, normalisePhone } from "@/lib/campaigns";
import { listCallsLean } from "@/lib/calls";
import { kpis } from "@/lib/metrics";

/** GET — every campaign for this client with live numbers computed from its calls. */
export async function GET(req: Request) {
  const session = parseSession(req);
  if (!session) return unauthorized();
  try {
    const rows = await listCampaignRows(session.clientId);
    const since = rows.length ? rows[rows.length - 1].created_at : new Date().toISOString();
    const calls = rows.length ? await listCallsLean(session.clientId, new Date(Date.parse(since) - 86400000).toISOString(), new Date(Date.now() + 86400000).toISOString()) : [];
    const byBatch = new Map<string, typeof calls>();
    for (const c of calls) if (c.campaign_id) { if (!byBatch.has(c.campaign_id)) byBatch.set(c.campaign_id, []); byBatch.get(c.campaign_id)!.push(c); }
    return Response.json({
      campaigns: rows.map((c) => ({ ...c, kpis: kpis(c.cartesia_batch_id ? byBatch.get(c.cartesia_batch_id) || [] : []) })),
    });
  } catch (err: any) {
    return Response.json({ error: err?.message || "Failed to load campaigns" }, { status: 500 });
  }
}

type Body = {
  name?: string; scriptId?: string; fromNumberId?: string;
  contacts?: { name?: string; phone?: string; variables?: Record<string, string> }[];
  scheduledAt?: string | null; concurrency?: number | null;
};

/** POST — create the campaign, store every contact, and hand the batch to Cartesia. */
export async function POST(req: Request) {
  const session = parseSession(req);
  if (!session) return unauthorized();
  if (!process.env.CARTESIA_API_KEY) return Response.json({ error: "CARTESIA_API_KEY is not set." }, { status: 500 });

  let body: Body;
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid body." }, { status: 400 }); }
  const name = (body.name || "").trim();
  if (!name) return Response.json({ error: "Give the campaign a name." }, { status: 400 });

  const script = body.scriptId ? await getScriptById(body.scriptId) : null;
  if (!script || script.client_id !== session.clientId) return Response.json({ error: "Pick which employee should make the calls." }, { status: 400 });
  if (!script.cartesia_agent_id) return Response.json({ error: `${script.name} isn't published yet. Publish it from My Employees first.` }, { status: 400 });
  if (!(script as any).tested_at) return Response.json({ error: `${script.name} hasn't been signed off yet. Talk to it on the Talk page and mark it as tested first.` }, { status: 400 });

  // De-duplicate and validate numbers; keep the first name seen for each.
  const seen = new Map<string, { name: string | null; phone: string; variables: Record<string, string> }>();
  const invalid: string[] = [];
  for (const c of body.contacts || []) {
    const phone = normalisePhone(c.phone || "");
    if (!phone) { if (c.phone) invalid.push(String(c.phone)); continue; }
    if (!seen.has(phone)) {
      const vars: Record<string, string> = {};
      for (const [k, v] of Object.entries(c.variables || {})) if (v != null && String(v).trim()) vars[k.slice(0, 40)] = String(v).slice(0, 200);
      seen.set(phone, { name: (c.name || "").trim() || null, phone, variables: vars });
    }
  }
  const contacts = Array.from(seen.values());
  if (!contacts.length) return Response.json({ error: "No valid phone numbers in the list." }, { status: 400 });
  if (contacts.length > 5000) return Response.json({ error: "Cartesia allows up to 5,000 numbers per campaign — split the list." }, { status: 400 });

  // Resolve the caller-ID number.
  const numbers = await listCartesiaPhoneNumbers().catch(() => []);
  const from = numbers.find((n: any) => n.id === body.fromNumberId);
  if (!from) return Response.json({ error: "Pick the number to call from. Add one on the Phone Numbers page if the list is empty." }, { status: 400 });

  const scheduledAt = body.scheduledAt && Date.parse(body.scheduledAt) > Date.now() + 60000 ? new Date(body.scheduledAt).toISOString() : null;
  const concurrency = body.concurrency && body.concurrency > 0 ? Math.min(50, Math.round(body.concurrency)) : null;

  const campaign = await createCampaignRow({
    client_id: session.clientId, name, script_id: script.id, cartesia_agent_id: script.cartesia_agent_id,
    status: "draft", total_contacts: contacts.length, from_number_id: from.id, from_number: from.number,
    scheduled_at: scheduledAt, concurrency,
  });
  await insertContacts(campaign.id, session.clientId, contacts);

  try {
    const batch = await createCartesiaBatch({
      agentId: script.cartesia_agent_id, fromNumberId: from.id, name,
      recipients: contacts.map((c) => ({ to_number: c.phone, dynamic_variables: { ...(c.name ? { name: c.name } : {}), ...c.variables } })),
      concurrency: concurrency ?? undefined, scheduledAt: scheduledAt ?? undefined,
    });
    const updated = await updateCampaignRow(campaign.id, {
      cartesia_batch_id: batch.id, status: scheduledAt ? "scheduled" : "running",
      started_at: scheduledAt ? null : new Date().toISOString(), last_error: null,
    });
    return Response.json({ ok: true, campaign: updated, accepted: contacts.length, invalid });
  } catch (err: any) {
    await updateCampaignRow(campaign.id, { status: "failed", last_error: String(err?.message || err).slice(0, 500) });
    return Response.json({ error: `Cartesia didn't accept the campaign: ${err?.message || err}`, campaignId: campaign.id }, { status: 502 });
  }
}
