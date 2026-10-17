// Wires the engine to RANA's real infrastructure (server only). Everything paid is OFF unless switched on:
//  • calls are simulated unless SALES_ENGINE_LIVE_CALLS=1 AND a campaign is launched in live mode;
//  • no LLM is used at all (call plans are templates over verified facts);
//  • discovery uses only free sources (OpenStreetMap, your list, your CRM).
import { MemoryStore } from "./store";
import { SupabaseStore, SupabaseCrm, crmLeadsForIndustry } from "./supabaseStore";
import { OsmSource, ListSource, CrmSource, type Http } from "./sources";
import { PoliteFetcher } from "./research";
import { SimulatedVoice, SarvamLiveVoice, type PlaceCall, type VoiceAdapter } from "./voice";
import { InternalCalendar } from "./booking";
import type { Deps } from "./engine";
import type { LiveEnv } from "./rules";
import type { Mode } from "./types";
import { sb } from "../db";

export const fetchHttp: Http = async (url, opts = {}) => {
  const res = await fetch(url, {
    method: opts.method || "GET", body: opts.body, headers: opts.headers, redirect: "follow", cache: "no-store",
    signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
  });
  const ct = res.headers.get("content-type") || "";
  // Only text is read; PDFs, images and huge files are skipped.
  const text = /text|json|xml|html/i.test(ct) || !ct ? (await res.text()).slice(0, 800_000) : "";
  return { status: res.status, text, url: res.url || url };
};

export function liveEnv(): LiveEnv {
  return {
    liveSwitch: process.env.SALES_ENGINE_LIVE_CALLS === "1",
    telephonyReady: !!process.env.SALES_ENGINE_SARVAM_SCRIPT_ID && !!process.env.RANA_SARVAM_AGENTS_API_KEY && !!process.env.RANA_SARVAM_CONNECTION_ID,
    indiaTelemarketerOk: process.env.SALES_ENGINE_IN_TELEMARKETER_OK === "1",
  };
}

/** Real Sarvam calls through RANA's existing outbound integration — only built when live calling is switched on. */
async function sarvamPlaceCall(): Promise<{ place: PlaceCall | null; reason: string | null }> {
  const env = liveEnv();
  if (!env.liveSwitch) return { place: null, reason: "SALES_ENGINE_LIVE_CALLS is not 1" };
  const scriptId = process.env.SALES_ENGINE_SARVAM_SCRIPT_ID;
  if (!scriptId) return { place: null, reason: "Set SALES_ENGINE_SARVAM_SCRIPT_ID to the published RANA sales-agent employee to call with." };
  const { sarvamConfig, placeOutboundCall, withClientNumber, webhookUrl } = await import("../sarvamAgent");
  const { getScriptById, getClientById } = await import("../supabase");
  const base = sarvamConfig();
  if (!base) return { place: null, reason: "Sarvam isn't configured on this deployment." };
  const script: any = await getScriptById(scriptId);
  if (!script?.published_at) return { place: null, reason: "The sales-agent employee isn't published." };
  const client: any = await getClientById(script.client_id);
  const cfg = withClientNumber(base, client);
  const place: PlaceCall = async ({ phone, variables, metadata }) => {
    const r = await placeOutboundCall(cfg, { phone, script, caller: { name: variables.company, variables }, webhook: client?.webhook_secret ? webhookUrl(client.webhook_secret) : null, metadata });
    return { attemptId: r.attempt_id };
  };
  return { place, reason: null };
}

export async function hqClientId(): Promise<string | null> {
  const [r] = (await sb<any[]>(`/clients?is_hq=eq.true&select=id&limit=1`).catch(() => [])) || [];
  return r?.id || null;
}

let tablesOk: boolean | null = null;
/** False until supabase/migrations/20261017_sales_engine.sql has been applied. */
export async function tablesReady(): Promise<boolean> {
  if (tablesOk) return true;
  try { await sb(`/se_campaigns?select=id&limit=1`); tablesOk = true; } catch { tablesOk = false; }
  return tablesOk;
}

export async function prodDeps(mode: Mode = "simulation"): Promise<Deps> {
  const store = new SupabaseStore(await hqClientId());
  let voice: VoiceAdapter = new SimulatedVoice();
  if (mode === "live") {
    const { place, reason } = await sarvamPlaceCall().catch((e) => ({ place: null, reason: String(e?.message || e) }));
    voice = new SarvamLiveVoice(place, reason);
  }
  return {
    store,
    sources: [new OsmSource(fetchHttp), new ListSource(), new CrmSource(crmLeadsForIndustry)],
    fetcher: new PoliteFetcher(fetchHttp, 1000),
    voice,
    booking: new InternalCalendar(store),
    crm: new SupabaseCrm(),
    liveEnv: liveEnv(),
  };
}

export { MemoryStore };
