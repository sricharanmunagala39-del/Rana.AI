/**
 * POST /api/internal/leadflow/call — server-to-server only (no session; middleware lets /api/internal/leadflow through).
 * The LeadFlow engine (Supabase Edge Function) asks RANA's own HQ agent to ring ONE warm sales lead.
 * Same preparation as /api/sarvam/call (DNC, plan block, agent version, voice routing, HQ's number) plus the
 * calling-hours check. The result comes back through the HQ webhook, which forwards it to LeadFlow (rana_source = "leadflow").
 */
export const runtime = "nodejs";
import crypto from "crypto";
import { getScriptById } from "@/lib/supabase";
import { sb } from "@/lib/db";
import { sarvamConfig, placeOutboundCall, webhookUrl, withClientNumber, routeVoice, syncAgentVersion } from "@/lib/sarvamAgent";
import { callingBlock } from "@/lib/plans";
import { normalisePhone } from "@/lib/campaigns";
import { dncSet, rulesFromClient, insideWindow, describeRules } from "@/lib/compliance";
import { friendly } from "@/lib/sarvamHealth";

const DEFAULT_SCRIPT_NAME = "LeadFlow Warm-Lead Caller (Priya)";

/** Bearer <key> must equal the service key — compared in constant time. */
function authorised(req: Request): boolean {
  const key = process.env.SUPABASE_SERVICE_KEY;
  const m = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!key || !m) return false;
  const a = crypto.createHash("sha256").update(m[1].trim()).digest();
  const b = crypto.createHash("sha256").update(key).digest();
  return crypto.timingSafeEqual(a, b);
}

const fail = (error: string, status: number, extra: Record<string, unknown> = {}) => Response.json({ ok: false, error, ...extra }, { status });
const str = (v: unknown) => String(v ?? "").trim();

/** POST { phone, name, company, reason, why_rana, leadflow_lead_id, script_id? } → { ok: true, attempt_id } */
export async function POST(req: Request) {
  if (!authorised(req)) return fail("Unauthorized", 401);
  const base = sarvamConfig();
  if (!base) return fail("Sarvam calling isn't configured on this server.", 500);
  const b = await req.json().catch(() => ({}));
  const leadId = str(b.leadflow_lead_id);
  if (!leadId) return fail("leadflow_lead_id is required.", 400);
  const phone = normalisePhone(str(b.phone));
  if (!phone) return fail("A valid phone number is required.", 400);

  // RANA's own workspace (HQ) and its LeadFlow caller script.
  const [client] = (await sb<any[]>(`/clients?is_hq=eq.true&select=*&limit=1`).catch(() => [])) || [];
  if (!client) return fail("HQ workspace not found.", 500);
  const scriptId = str(b.script_id) || str(process.env.LEADFLOW_CALL_SCRIPT_ID);
  const script: any = scriptId
    ? await getScriptById(scriptId).catch(() => null)
    : ((await sb<any[]>(`/scripts?client_id=eq.${client.id}&name=eq.${encodeURIComponent(DEFAULT_SCRIPT_NAME)}&limit=1`).catch(() => [])) || [])[0];
  if (!script || script.client_id !== client.id) return fail("LeadFlow caller script not found in HQ.", 404);
  if (!script.published_at) return fail(`${script.name} is still a draft — publish it in HQ first.`, 409, { code: "script_draft" });

  // Compliance: do-not-call list, plan/suspension block, calling hours.
  if ((await dncSet(client.id, [phone])).has(phone)) return fail("That number is on the do-not-call list.", 409, { code: "dnc" });
  const block = await callingBlock(client);
  if (block) return fail(block, 409, { code: "blocked" });
  const rules = rulesFromClient(client);
  if (!insideWindow(rules)) return fail(`Outside calling hours (${describeRules(rules)}).`, 409, { code: "outside_hours" });

  await syncAgentVersion(base, script); // a ready-made agent always calls with its newest version
  const { cfg } = await routeVoice(withClientNumber(base, client), script.voice_name, script.engine_agent);
  try {
    const r = await placeOutboundCall(cfg, {
      phone, script,
      caller: { name: str(b.name) || null, variables: { name: str(b.name), company: str(b.company), reason: str(b.reason), why_rana: str(b.why_rana) } },
      webhook: client.webhook_secret ? webhookUrl(client.webhook_secret) : null,
      metadata: { rana_script_id: script.id, rana_source: "leadflow", leadflow_lead_id: leadId },
      direction: "outbound",
    });
    return Response.json({ ok: true, attempt_id: r.attempt_id });
  } catch (e: any) {
    console.error("[leadflow call]", e?.message || e);
    return fail(friendly(e, "Couldn't place the call right now."), 502);
  }
}
