// @ts-nocheck
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY!;
export type Industry = "edtech" | "realestate" | "hospitality" | "saas" | "other";
export type Client = { id: string; name: string; industry: Industry; company_name: string | null; sarvam_app_id: string | null; login_email: string; login_password: string; is_active: boolean; created_at: string; webhook_secret: string; cartesia_agent_id: string | null; cartesia_webhook_id: string | null; cartesia_webhook_secret: string | null; };
export type Script = { id: string; client_id: string; name: string; greeting: string; instructions: string; facts: string[]; steps: { id: string; title: string; body: string }[]; variables: { key: string; label: string }[]; strictness: number; speaker: string; voice_name: string | null; speech_rate: number; speech_pitch: number; starting_language: string; background_sound: string; model_id: string | null; cartesia_agent_id: string | null; status: "draft" | "active"; published_at: string | null; created_at: string; updated_at: string; };
async function sbFetch(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { ...opts, headers: { "Content-Type": "application/json", "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Prefer": "return=representation", ...(opts.headers ?? {}) } });
  if (!res.ok) { const err = await res.text(); throw new Error(`Supabase ${path}: ${res.status} ${err}`); }
  const text = await res.text(); return text ? JSON.parse(text) : null;
}
export async function getClientByEmail(email: string): Promise<Client | null> { const r = await sbFetch(`/clients?login_email=eq.${encodeURIComponent(email)}&limit=1`); return r?.[0] ?? null; }
export async function getClientById(id: string): Promise<Client | null> { const r = await sbFetch(`/clients?id=eq.${id}&limit=1`); return r?.[0] ?? null; }
export async function getAllClients(): Promise<Client[]> { return await sbFetch(`/clients?order=created_at.asc`); }
export async function createClient(data: any): Promise<Client> { const r = await sbFetch(`/clients`, { method: "POST", body: JSON.stringify(data) }); return r[0]; }
export async function updateClient(id: string, patch: any): Promise<Client> { const r = await sbFetch(`/clients?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(patch) }); return r[0]; }
export async function getScriptsForClient(clientId: string): Promise<Script[]> { return await sbFetch(`/scripts?client_id=eq.${clientId}&order=created_at.desc`); }
export async function getScriptById(id: string): Promise<Script | null> { const r = await sbFetch(`/scripts?id=eq.${id}&limit=1`); return r?.[0] ?? null; }
export async function getActiveScript(clientId: string): Promise<Script | null> { const r = await sbFetch(`/scripts?client_id=eq.${clientId}&status=eq.active&limit=1`); return r?.[0] ?? null; }
export async function createScript(data: any): Promise<Script> { const r = await sbFetch(`/scripts`, { method: "POST", body: JSON.stringify({ status: "draft", ...data }) }); return r[0]; }
export async function updateScript(id: string, patch: any): Promise<Script> { const r = await sbFetch(`/scripts?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(patch) }); return r[0]; }
export async function deleteScript(id: string): Promise<void> { await sbFetch(`/scripts?id=eq.${id}`, { method: "DELETE" }); }
export async function setActiveScript(clientId: string, scriptId: string): Promise<void> {
  await sbFetch(`/scripts?client_id=eq.${clientId}&status=eq.active`, { method: "PATCH", body: JSON.stringify({ status: "draft" }), headers: { "Prefer": "return=minimal" } });
  await sbFetch(`/scripts?id=eq.${scriptId}`, { method: "PATCH", body: JSON.stringify({ status: "active", published_at: new Date().toISOString() }), headers: { "Prefer": "return=minimal" } });
}
