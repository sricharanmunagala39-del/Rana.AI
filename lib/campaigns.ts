// Campaigns + their contact lists (Supabase, service key, server-side only).
// A campaign = one Cartesia call batch. Every uploaded number is a campaign_contacts row; once
// Cartesia dials it, cartesia_call_id links it to calls.interaction_id.
import { getCartesiaBatch } from "./cartesia";
import { sarvamConfig, getSarvamCampaign } from "./sarvamAgent";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY!;

async function sb(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
      Prefer: "return=representation", ...(opts.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Supabase ${path}: ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export type Campaign = {
  id: string; client_id: string; name: string; script_id: string | null; cartesia_batch_id: string | null;
  cartesia_agent_id: string | null; status: string; total_contacts: number; created_at: string;
  started_at: string | null; completed_at: string | null; from_number_id: string | null; from_number: string | null;
  scheduled_at: string | null; concurrency: number | null; last_error: string | null; last_synced_at: string | null;
};
export type Contact = {
  id: string; campaign_id: string; client_id: string; name: string | null; phone: string;
  variables: Record<string, string>; status: string; cartesia_call_id: string | null; attempts: number; updated_at: string;
};

export async function createCampaignRow(row: Partial<Campaign>): Promise<Campaign> {
  const r = await sb(`/campaigns`, { method: "POST", body: JSON.stringify(row) });
  return r[0];
}
export async function updateCampaignRow(id: string, patch: Partial<Campaign>): Promise<Campaign> {
  const r = await sb(`/campaigns?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(patch) });
  return r[0];
}
export async function listCampaignRows(clientId: string): Promise<Campaign[]> {
  return (await sb(`/campaigns?client_id=eq.${clientId}&order=created_at.desc&limit=200`)) || [];
}
/** Accepts our uuid or the Cartesia batch id (the dashboard links by batch id). */
export async function getCampaignRow(clientId: string, idOrBatch: string): Promise<Campaign | null> {
  const isUuid = /^[0-9a-f-]{36}$/i.test(idOrBatch);
  const q = isUuid ? `id=eq.${idOrBatch}` : `cartesia_batch_id=eq.${encodeURIComponent(idOrBatch)}`;
  const r = await sb(`/campaigns?client_id=eq.${clientId}&${q}&limit=1`);
  return r?.[0] ?? null;
}

export async function insertContacts(campaignId: string, clientId: string, contacts: { name: string | null; phone: string; variables: Record<string, string> }[]) {
  for (let i = 0; i < contacts.length; i += 500) {
    const chunk = contacts.slice(i, i + 500).map((c) => ({ ...c, campaign_id: campaignId, client_id: clientId }));
    await sb(`/campaign_contacts`, { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(chunk) });
  }
}
export async function listContacts(campaignId: string): Promise<Contact[]> {
  const out: Contact[] = [];
  for (let offset = 0; offset < 6000; offset += 1000) {
    const page = await sb(`/campaign_contacts?campaign_id=eq.${campaignId}&order=created_at.asc&limit=1000&offset=${offset}`);
    out.push(...(page || []));
    if (!page || page.length < 1000) break;
  }
  return out;
}
/** call_id → { batch id, contact name } for the calls sync. */
export async function contactsByCallIds(ids: string[]): Promise<Record<string, { batchId: string | null; name: string | null }>> {
  if (!ids.length) return {};
  const list = ids.map((i) => `"${i.replace(/"/g, "")}"`).join(",");
  const rows = await sb(`/campaign_contacts?cartesia_call_id=in.(${encodeURIComponent(list)})&select=cartesia_call_id,name,campaigns(cartesia_batch_id)`);
  const out: Record<string, { batchId: string | null; name: string | null }> = {};
  for (const r of rows || []) out[r.cartesia_call_id] = { batchId: r.campaigns?.cartesia_batch_id ?? null, name: r.name };
  return out;
}

/** Cartesia batch status → our campaign status. */
function campaignStatusFromBatch(b: any): string {
  const s = String(b?.status || "").toLowerCase();
  if (s === "cancelled") return "paused";
  const scheduled = Number(b?.total_calls_scheduled ?? 0), finished = Number(b?.total_calls_finished ?? 0);
  if (scheduled > 0 && finished >= scheduled) return "completed";
  if (s === "pending") return b?.scheduled_at && Date.parse(b.scheduled_at) > Date.now() ? "scheduled" : "running";
  if (s === "in_progress") return "running";
  return s || "running";
}

/** Pull the batch from Cartesia and write each recipient's status + call id onto our contacts. */
export async function refreshCampaignFromCartesia(c: Campaign): Promise<Campaign> {
  if (!c.cartesia_batch_id) return c;
  if ((c as any).engine === "sarvam") return refreshSarvamCampaign(c);
  const b = await getCartesiaBatch(c.cartesia_batch_id);
  const recipients: any[] = b?.recipients ?? [];
  const contacts = await listContacts(c.id);
  const byPhone = new Map(contacts.map((x) => [x.phone, x]));
  const changed = recipients
    .map((r) => ({ r, x: byPhone.get(r.to_number) }))
    .filter(({ r, x }) => x && (x.status !== (r.status || x.status) || (r.agent_call_id && x.cartesia_call_id !== r.agent_call_id)));
  for (const { r, x } of changed) {
    await sb(`/campaign_contacts?id=eq.${x!.id}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: r.status || x!.status, cartesia_call_id: r.agent_call_id || x!.cartesia_call_id, attempts: Number(r.attempts ?? x!.attempts ?? 0) || (r.agent_call_id ? 1 : 0), updated_at: new Date().toISOString() }),
    });
  }
  const status = campaignStatusFromBatch(b);
  return updateCampaignRow(c.id, {
    status, last_synced_at: new Date().toISOString(),
    ...(status === "completed" && !c.completed_at ? { completed_at: new Date().toISOString() } : {}),
    ...(status === "running" && !c.started_at ? { started_at: new Date().toISOString() } : {}),
  });
}

/** Sarvam campaigns: status from Sarvam; per-number results arrive by webhook as calls. */
async function refreshSarvamCampaign(c: Campaign): Promise<Campaign> {
  const cfg = sarvamConfig();
  const id = (c as any).sarvam_campaign_id || c.cartesia_batch_id;
  if (!cfg || !id) return c;
  const sc = await getSarvamCampaign(cfg, id);
  const raw = String(sc?.status || "").toLowerCase();
  // Only statuses the campaigns table allows; a cancelled campaign shows as Stopped (paused), like Cartesia's.
  const status =
    ["ended", "completed", "finished"].includes(raw) ? "completed"
    : ["cancelled", "canceled", "stopped", "paused"].includes(raw) ? "paused"
    : ["scheduled", "created", "draft", "pending"].includes(raw) ? "scheduled"
    : ["failed", "error"].includes(raw) ? "failed"
    : "running";
  return updateCampaignRow(c.id, {
    status, last_synced_at: new Date().toISOString(),
    ...(status === "completed" && !c.completed_at ? { completed_at: new Date().toISOString() } : {}),
    ...(status === "running" && !c.started_at ? { started_at: new Date().toISOString() } : {}),
  });
}

export async function refreshActiveCampaigns(clientId: string): Promise<void> {
  const rows = await listCampaignRows(clientId);
  for (const c of rows.filter((r) => ["running", "scheduled"].includes(r.status) && r.cartesia_batch_id)) {
    try { await refreshCampaignFromCartesia(c); } catch { /* one bad batch shouldn't stop the others */ }
  }
}

/** "98765 43210", "098765...", "+91 98765..." → "+919876543210"; null if not a phone number. */
export function normalisePhone(raw: string): string | null {
  const s = String(raw || "").replace(/[^\d+]/g, "");
  let out: string;
  if (s.startsWith("+")) out = s;
  else if (s.startsWith("00")) out = "+" + s.slice(2);
  else if (s.length === 11 && s.startsWith("0")) out = "+91" + s.slice(1);
  else if (s.length === 10) out = "+91" + s;
  else if (s.length === 12 && s.startsWith("91")) out = "+" + s;
  else return null;
  return /^\+[1-9]\d{9,14}$/.test(out) ? out : null;
}
