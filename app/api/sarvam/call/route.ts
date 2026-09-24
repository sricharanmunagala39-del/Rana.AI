export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { forbidUnless } from "@/lib/auth";
import { getScriptById, getClientById } from "@/lib/supabase";
import { sarvamConfig, sarvamMissing, placeOutboundCall, webhookUrl } from "@/lib/sarvamAgent";
import { normalisePhone } from "@/lib/campaigns";
import { dncSet } from "@/lib/compliance";
import { audit } from "@/lib/audit";

/** POST { scriptId, phone, name? } → Sarvam calls this number right now with this employee (a real phone test). */
export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const denied = forbidUnless(session, "manager"); if (denied) return denied;
  const cfg = sarvamConfig();
  if (!cfg) return Response.json({ error: `Sarvam isn't configured: set ${sarvamMissing().join(", ")} in Vercel.` }, { status: 500 });
  const b = await req.json().catch(() => ({}));
  const script: any = b.scriptId ? await getScriptById(String(b.scriptId)) : null;
  if (!script || script.client_id !== session.clientId) return Response.json({ error: "Employee not found" }, { status: 404 });
  if (!script.published_at) return Response.json({ error: `${script.name} isn't published yet.` }, { status: 400 });
  const phone = normalisePhone(String(b.phone || ""));
  if (!phone) return Response.json({ error: "Enter a valid mobile number, e.g. 98765 43210." }, { status: 400 });
  if ((await dncSet(session.clientId, [phone])).has(phone)) return Response.json({ error: "That number is on your do-not-call list." }, { status: 400 });
  const client: any = await getClientById(session.clientId);
  try {
    const r = await placeOutboundCall(cfg, {
      phone, script, caller: { name: String(b.name || "").trim() || null },
      webhook: client?.webhook_secret ? webhookUrl(client.webhook_secret) : null,
      metadata: { rana_script_id: script.id, rana_source: "test_call" },
    });
    await audit(session, "number_test_call", { req, targetType: "employee", targetId: script.id, detail: { phone, engine: "sarvam", attemptId: r.attempt_id } }).catch(() => {});
    return Response.json({ ok: true, attemptId: r.attempt_id, from: cfg.agentNumber });
  } catch (e: any) {
    return Response.json({ error: e?.message || "Sarvam couldn't place the call." }, { status: 502 });
  }
}

