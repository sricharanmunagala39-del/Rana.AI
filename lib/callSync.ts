// Pulls finished calls from Cartesia into `calls`. Runs on dashboard load (throttled), on the Sync
// button, and from the daily Vercel cron. Safe to run repeatedly: rows upsert on interaction_id.
import { getClientById, getScriptsForClient, getAllClients } from "./supabase";
import { listCartesiaCalls } from "./cartesia";
import { callFromCartesiaApi, upsertCall, latestCartesiaCallStart, existingCallState } from "./calls";
import { refreshActiveCampaigns, contactsByCallIds, normalisePhone } from "./campaigns";
import { optOutPhrase, addDnc } from "./compliance";

const FIRST_SYNC_LOOKBACK_DAYS = 14;
const OVERLAP_MS = 30 * 60 * 1000; // re-read the last 30 min so calls that were still in progress get their final state
const lastRun = new Map<string, number>();

export type SyncResult = { clientId: string; agents: number; fetched: number; saved: number; skipped: number; errors: string[] };

export async function agentIdsForClient(clientId: string): Promise<string[]> {
  const [client, scripts] = await Promise.all([getClientById(clientId), getScriptsForClient(clientId)]);
  const ids = new Set<string>();
  if (client?.cartesia_agent_id) ids.add(client.cartesia_agent_id);
  for (const s of scripts || []) if (s.cartesia_agent_id) ids.add(s.cartesia_agent_id);
  return Array.from(ids);
}

export async function syncClientCalls(clientId: string): Promise<SyncResult> {
  const res: SyncResult = { clientId, agents: 0, fetched: 0, saved: 0, skipped: 0, errors: [] };
  if (!process.env.CARTESIA_API_KEY) { res.errors.push("CARTESIA_API_KEY is not set"); return res; }
  lastRun.set(clientId, Date.now());

  // Pull campaign progress first so freshly dialled numbers already carry their Cartesia call id.
  try { await refreshActiveCampaigns(clientId); } catch (e: any) { res.errors.push(`campaigns: ${e?.message || e}`); }

  const agentIds = await agentIdsForClient(clientId);
  res.agents = agentIds.length;
  if (!agentIds.length) return res;

  const latest = await latestCartesiaCallStart(clientId);
  const since = latest
    ? new Date(Date.parse(latest) - OVERLAP_MS).toISOString()
    : new Date(Date.now() - FIRST_SYNC_LOOKBACK_DAYS * 86400000).toISOString();

  for (const agentId of agentIds) {
    try {
      const calls = await listCartesiaCalls({ agentId, startTimeGte: since });
      res.fetched += calls.length;
      // Skip calls that haven't finished yet; the next sync (with overlap) picks them up.
      const finished = calls.filter((c) => c?.status === "completed" || c?.status === "failed");
      const ids = finished.map((c) => c.id).filter(Boolean);
      const [state, campaignOf] = await Promise.all([existingCallState(ids), contactsByCallIds(ids).catch(() => ({} as Record<string, any>))]);
      for (const c of finished) {
        if (state[c.id]?.final) { res.skipped++; continue; }
        const row: any = callFromCartesiaApi(c, clientId);
        const camp = campaignOf[c.id];
        if (camp) {
          // A campaign dial: tie it to its campaign and the name from the uploaded list.
          row.direction = "outbound"; row.source = "campaign"; row.campaign_id = camp.batchId ?? row.campaign_id;
          if (camp.name && !row.caller_name) row.caller_name = camp.name;
        }
        try { await upsertCall(row); res.saved++; }
        catch (e: any) { res.errors.push(`${c.id}: ${e?.message || e}`); continue; }
        // "Don't call me again" goes straight onto the do-not-call list so no future campaign dials them.
        if (row.source !== "manual" && row.caller_phone) {
          const said = optOutPhrase((row.transcript || []).filter((t: any) => t.role === "user").map((t: any) => t.text).join(" "));
          const phone = normalisePhone(row.caller_phone);
          if (said && phone) {
            await addDnc(clientId, [{ phone, source: "caller_request", reason: `Caller said "${said}"`, callId: c.id }])
              .catch((e: any) => res.errors.push(`dnc ${c.id}: ${e?.message || e}`));
          }
        }
      }
    } catch (e: any) {
      res.errors.push(`${agentId}: ${e?.message || e}`);
    }
  }
  return res;
}

/** Fire-and-forget-friendly: skips if this client synced within `minIntervalMs`, and never throws. */
export async function maybeSyncClientCalls(clientId: string, minIntervalMs = 60_000, timeoutMs = 8_000): Promise<void> {
  const prev = lastRun.get(clientId) ?? 0;
  if (Date.now() - prev < minIntervalMs) return;
  try {
    await Promise.race([syncClientCalls(clientId), new Promise((r) => setTimeout(r, timeoutMs))]);
  } catch { /* the dashboard still renders what's already stored */ }
}

export async function syncAllClients(): Promise<SyncResult[]> {
  const clients = await getAllClients();
  const out: SyncResult[] = [];
  for (const c of clients.filter((c: any) => c.is_active !== false)) out.push(await syncClientCalls(c.id));
  return out;
}
