export const runtime = "nodejs";
export const maxDuration = 60;
import { parseSession, unauthorized } from "@/lib/auth";
import { getScriptById } from "@/lib/supabase";
import { getCampaignRow, listContacts, refreshCampaignFromCartesia } from "@/lib/campaigns";
import { maybeSyncClientCalls } from "@/lib/callSync";
import { listCallsLean } from "@/lib/calls";
import { kpis, isConnected, notConnectedReasons } from "@/lib/metrics";
import { getSession } from "@/lib/session";

/** Everything the campaign page shows: the campaign, every number on the list, and the call each became. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  let c = await getCampaignRow(session.clientId, decodeURIComponent(params.id));
  if (!c) return Response.json({ error: "Campaign not found" }, { status: 404 });

  // Refresh from Cartesia at most every 20s, then pull any finished calls.
  if (c.cartesia_batch_id && ["running", "scheduled"].includes(c.status) && (!c.last_synced_at || Date.now() - Date.parse(c.last_synced_at) > 20000)) {
    try { c = await refreshCampaignFromCartesia(c); } catch { /* show last known state */ }
  }
  await maybeSyncClientCalls(session.clientId, 20000);

  const [contacts, script, calls] = await Promise.all([
    listContacts(c.id),
    c.script_id ? getScriptById(c.script_id) : null,
    c.cartesia_batch_id ? listCallsLean(session.clientId, new Date(Date.parse(c.created_at) - 3600000).toISOString(), new Date(Date.now() + 86400000).toISOString()) : Promise.resolve([]),
  ]);
  const mine = calls.filter((x) => x.campaign_id === c!.cartesia_batch_id);
  // Outbound calls store the dialled number as caller_phone; calls are newest-first, so the first match is the latest attempt.
  const byPhone = new Map<string, any>();
  for (const x of mine) { if (x.caller_phone && !byPhone.has(x.caller_phone)) byPhone.set(x.caller_phone, x); }

  const rows = contacts.map((ct) => {
    const call = byPhone.get(ct.phone) || null;
    return {
      contactId: ct.id, name: ct.name, phone: ct.phone, variables: ct.variables, dialStatus: ct.status, attempts: ct.attempts,
      call: call ? {
        id: call.id, lifted: isConnected(call), talkSeconds: Number(call.duration_seconds || 0), lead: call.lead_status,
        reason: call.lead_reason, summary: call.summary, at: call.created_at, followUp: call.follow_up,
      } : null,
    };
  });

  return Response.json({
    campaign: c, employee: script ? { id: script.id, name: script.name } : null,
    kpis: kpis(mine), notConnected: notConnectedReasons(mine),
    progress: { total: contacts.length, dialled: rows.filter((r) => r.call || !/queued|pending|scheduled/i.test(r.dialStatus)).length },
    rows,
  });
}
