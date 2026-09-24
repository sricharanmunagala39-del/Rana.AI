// Every client shares one Cartesia account, so Cartesia itself can't tell whose number or agent is whose.
// This table is the wall between clients: a route may only touch a Cartesia resource its client owns.
import { sb, inList } from "./db";
import { getAllClients } from "./supabase";

export type ResourceType = "phone_number" | "agent";

export async function claimResource(clientId: string, type: ResourceType, resourceId: string, label?: string | null) {
  await sb(`/cartesia_resources?on_conflict=resource_type,resource_id`, {
    method: "POST",
    prefer: "resolution=ignore-duplicates,return=minimal",
    body: JSON.stringify({ client_id: clientId, resource_type: type, resource_id: resourceId, label: label ?? null }),
  });
}

export async function releaseResource(clientId: string, type: ResourceType, resourceId: string) {
  await sb(`/cartesia_resources?client_id=eq.${clientId}&resource_type=eq.${type}&resource_id=eq.${encodeURIComponent(resourceId)}`, { method: "DELETE", prefer: "return=minimal" });
}

export async function ownsResource(clientId: string, type: ResourceType, resourceId: string): Promise<boolean> {
  if (!resourceId) return false;
  const r = await sb<any[]>(`/cartesia_resources?client_id=eq.${clientId}&resource_type=eq.${type}&resource_id=eq.${encodeURIComponent(resourceId)}&select=id&limit=1`);
  return !!r?.length;
}

/** Owner of each id (missing = nobody has claimed it yet). */
export async function ownersOf(type: ResourceType, ids: string[]): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const rows = await sb<any[]>(`/cartesia_resources?resource_type=eq.${type}&resource_id=in.${inList(ids)}&select=resource_id,client_id`);
  const out: Record<string, string> = {};
  for (const r of rows || []) out[r.resource_id] = r.client_id;
  return out;
}

/**
 * Who inherits resources that existed before ownership was tracked. Set RANA_DEFAULT_CLIENT_ID to pin it;
 * otherwise, while there is exactly one client, that client. With several clients and no setting,
 * unclaimed resources stay hidden from everyone until RANA assigns them.
 */
let heirCache: { id: string | null; at: number } | null = null;
export async function legacyHeir(): Promise<string | null> {
  if (process.env.RANA_DEFAULT_CLIENT_ID) return process.env.RANA_DEFAULT_CLIENT_ID;
  if (heirCache && Date.now() - heirCache.at < 5 * 60_000) return heirCache.id;
  const clients = await getAllClients().catch(() => [] as any[]);
  const id = clients.length === 1 ? clients[0].id : null;
  heirCache = { id, at: Date.now() };
  return id;
}

/**
 * Filters a Cartesia list down to what this client owns. Unclaimed items are handed to the legacy heir
 * (and recorded) the first time they are seen, so numbers bought before this change don't vanish.
 */
export async function filterOwned<T extends { id: string }>(clientId: string, type: ResourceType, items: T[], labelOf?: (t: T) => string | null): Promise<T[]> {
  const owners = await ownersOf(type, items.map((i) => i.id));
  const unclaimed = items.filter((i) => !owners[i.id]);
  if (unclaimed.length) {
    const heir = await legacyHeir();
    if (heir) {
      for (const i of unclaimed) {
        await claimResource(heir, type, i.id, labelOf?.(i) ?? null).catch(() => {});
        owners[i.id] = heir;
      }
    }
  }
  return items.filter((i) => owners[i.id] === clientId);
}
