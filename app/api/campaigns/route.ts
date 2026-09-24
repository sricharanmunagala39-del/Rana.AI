export const runtime = "nodejs";
export const maxDuration = 60;
import { unauthorized, forbidUnless } from "@/lib/auth";
import { getScriptById, getClientById } from "@/lib/supabase";
import { filterOwned } from "@/lib/ownership";
import { dncSet, rulesFromClient, insideWindow, nextWindowOpen, describeRules } from "@/lib/compliance";
import { audit } from "@/lib/audit";
import { listCartesiaPhoneNumbers, createCartesiaBatch } from "@/lib/cartesia";
import { sarvamConfig, sarvamMissing, createSarvamCampaign, streamCampaignContacts, webhookUrl } from "@/lib/sarvamAgent";
import { createCampaignRow, updateCampaignRow, listCampaignRows, insertContacts, normalisePhone } from "@/lib/campaigns";
import { listCallsLean } from "@/lib/calls";
import { kpis } from "@/lib/metrics";
import { getSession } from "@/lib/session";

/** GET — every campaign for this client with live numbers computed from its calls. */
export async function GET(req: Request) {
  const session = await getSession(req);
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
  const session = await getSession(req);
  if (!session) return unauthorized();
  const denied = forbidUnless(session, "manager"); if (denied) return denied;

  let body: Body;
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid body." }, { status: 400 }); }
  const name = (body.name || "").trim();
  if (!name) return Response.json({ error: "Give the campaign a name." }, { status: 400 });

  const script = body.scriptId ? await getScriptById(body.scriptId) : null;
  if (!script || script.client_id !== session.clientId) return Response.json({ error: "Pick which employee should make the calls." }, { status: 400 });
  if (!script.cartesia_agent_id) return Response.json({ error: `${script.name} isn't published yet. Publish it from My Employees first.` }, { status: 400 });
  const onSarvam = String(script.cartesia_agent_id).startsWith("sarvam:");
  if (!onSarvam && !process.env.CARTESIA_API_KEY) return Response.json({ error: "CARTESIA_API_KEY is not set." }, { status: 500 });
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
  // Never dial anyone on this client's do-not-call list.
  const blocked = await dncSet(session.clientId, Array.from(seen.keys()));
  const skippedDnc = Array.from(seen.keys()).filter((p) => blocked.has(p));
  for (const p of skippedDnc) seen.delete(p);
  const contacts = Array.from(seen.values());
  if (!contacts.length) return Response.json({ error: skippedDnc.length ? `Every number on this list is on your do-not-call list (${skippedDnc.length}).` : "No valid phone numbers in the list." }, { status: 400 });
  if (contacts.length > 5000) return Response.json({ error: "Cartesia allows up to 5,000 numbers per campaign — split the list." }, { status: 400 });

  const scheduledAt = body.scheduledAt && Date.parse(body.scheduledAt) > Date.now() + 60000 ? new Date(body.scheduledAt).toISOString() : null;
  // Calling hours: refuse to start outside the client's window and say when it next opens.
  const rules = rulesFromClient(await getClientById(session.clientId));
  const startAt = scheduledAt ? new Date(scheduledAt) : new Date();
  if (!insideWindow(rules, startAt)) {
    const next = nextWindowOpen(rules, startAt);
    return Response.json({
      error: `${scheduledAt ? "That start time is" : "It's"} outside your calling hours (${describeRules(rules)}).${next ? " Schedule it for when the window opens." : ""}`,
      code: "outside_calling_window", nextOpen: next ? next.toISOString() : null,
    }, { status: 409 });
  }
  const concurrency = body.concurrency && body.concurrency > 0 ? Math.min(50, Math.round(body.concurrency)) : null;

  // ── Sarvam engine: a Sarvam campaign on RANA's Indian number; each contact carries this employee's instructions.
  if (onSarvam) {
    const cfg = sarvamConfig();
    if (!cfg) return Response.json({ error: `Sarvam isn't configured: set ${sarvamMissing().join(", ")} in Vercel.` }, { status: 500 });
    if (!cfg.connectionId) return Response.json({ error: "No Sarvam phone number is connected (RANA_SARVAM_CONNECTION_ID)." }, { status: 500 });
    const client: any = await getClientById(session.clientId);
    const campaign = await createCampaignRow({
      client_id: session.clientId, name, script_id: script.id, cartesia_agent_id: script.cartesia_agent_id, engine: "sarvam",
      status: "draft", total_contacts: contacts.length, from_number_id: "sarvam", from_number: cfg.agentNumber,
      scheduled_at: scheduledAt, concurrency, skipped_dnc: skippedDnc.length, created_by: session.email,
    } as any);
    await insertContacts(campaign.id, session.clientId, contacts);
    try {
      const sc = await createSarvamCampaign(cfg, {
        name, startAt: scheduledAt ? new Date(scheduledAt) : new Date(Date.now() + 60000),
        rules: { startMin: rules.windowStart, endMin: rules.windowEnd, days: rules.days, timezone: rules.timezone },
        attemptsPerSecond: concurrency ? Math.max(0.2, concurrency / 10) : 1,
        webhook: client?.webhook_secret ? webhookUrl(client.webhook_secret) : null,
        metadata: { rana_campaign_id: campaign.id },
      });
      await streamCampaignContacts(cfg, sc.campaign_id, script, contacts, name);
      const updated = await updateCampaignRow(campaign.id, {
        // The Sarvam campaign id doubles as the batch id so results link to this campaign exactly like Cartesia batches.
        cartesia_batch_id: sc.campaign_id, sarvam_campaign_id: sc.campaign_id, status: scheduledAt ? "scheduled" : "running",
        started_at: scheduledAt ? null : new Date().toISOString(), last_error: null,
      } as any);
      await audit(session, "campaign_launched", { req, targetType: "campaign", targetId: campaign.id, detail: { name, engine: "sarvam", contacts: contacts.length, skippedDnc: skippedDnc.length, scheduledAt } });
      return Response.json({ ok: true, campaign: updated, accepted: contacts.length, invalid, skippedDnc: skippedDnc.length });
    } catch (err: any) {
      await updateCampaignRow(campaign.id, { status: "failed", last_error: String(err?.message || err).slice(0, 500) });
      return Response.json({ error: `Sarvam didn't accept the campaign: ${err?.message || err}`, campaignId: campaign.id }, { status: 502 });
    }
  }

  // ── Cartesia engine: resolve the caller-ID number.
  const numbers = await filterOwned(session.clientId, "phone_number", (await listCartesiaPhoneNumbers().catch(() => [])) || []);
  const from = numbers.find((n: any) => n.id === body.fromNumberId);
  if (!from) return Response.json({ error: "Pick the number to call from. Add one on the Phone Numbers page if the list is empty." }, { status: 400 });

  const campaign = await createCampaignRow({
    client_id: session.clientId, name, script_id: script.id, cartesia_agent_id: script.cartesia_agent_id,
    status: "draft", total_contacts: contacts.length, from_number_id: from.id, from_number: from.number,
    scheduled_at: scheduledAt, concurrency, skipped_dnc: skippedDnc.length, created_by: session.email,
  } as any);
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
    await audit(session, "campaign_launched", { req, targetType: "campaign", targetId: campaign.id, detail: { name, contacts: contacts.length, skippedDnc: skippedDnc.length, scheduledAt } });
    return Response.json({ ok: true, campaign: updated, accepted: contacts.length, invalid, skippedDnc: skippedDnc.length });
  } catch (err: any) {
    await updateCampaignRow(campaign.id, { status: "failed", last_error: String(err?.message || err).slice(0, 500) });
    return Response.json({ error: `Cartesia didn't accept the campaign: ${err?.message || err}`, campaignId: campaign.id }, { status: 502 });
  }
}
