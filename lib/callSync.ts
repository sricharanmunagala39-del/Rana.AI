// Pulls finished calls from Cartesia into `calls`. Runs on dashboard load (throttled), on the Sync
// button, and from the daily Vercel cron. Safe to run repeatedly: rows upsert on interaction_id.
import { getClientById, getScriptsForClient, getAllClients } from "./supabase";
import { listCartesiaCalls } from "./cartesia";
import { callFromCartesiaApi, upsertCall, latestCartesiaCallStart, existingCallState } from "./calls";

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
      const state = await existingCallState(finished.map((c) => c.id).filter(Boolean));
      for (const c of finished) {
        if (state[c.id]?.final) { res.skipped++; continue; }
        try { await upsertCall(callFromCartesiaApi(c, clientId) as any); res.saved++; }
        catch (e: any) { res.errors.push(`${c.id}: ${e?.message || e}`); }
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
