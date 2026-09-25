export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { forbidUnless } from "@/lib/auth";
import { getScriptById, getClientById } from "@/lib/supabase";
import { callingBlock } from "@/lib/plans";
import { sarvamConfig, sarvamMissing, signedSessionUrl, sessionPayload, voiceFor, withVoice } from "@/lib/sarvamAgent";

/**
 * POST { scriptId } → a single-use Sarvam WebSocket URL for a browser test call, plus the start message
 * (this employee's instructions, greeting and opening language). The Sarvam key never reaches the browser.
 */
export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const denied = forbidUnless(session, "manager"); if (denied) return denied;
  const cfg = sarvamConfig();
  if (!cfg) return Response.json({ error: `Sarvam isn't configured: set ${sarvamMissing().join(", ")} in Vercel.` }, { status: 500 });
  const b = await req.json().catch(() => ({}));
  const script: any = b.scriptId ? await getScriptById(String(b.scriptId)) : null;
  if (!script || script.client_id !== session.clientId) return Response.json({ error: "Employee not found" }, { status: 404 });
  if (!script.published_at || !String(script.instructions || "").trim()) return Response.json({ error: `${script.name} isn't published yet — press Publish first.` }, { status: 400 });
  const planBlock = await callingBlock(await getClientById(session.clientId), { practice: true }); // practice is free
  if (planBlock) return Response.json({ error: planBlock, code: "plan_limit" }, { status: 402 });
  try {
    const signed = await signedSessionUrl(withVoice(cfg, script.voice_name), `rana-test-${session.clientId.slice(0, 8)}-${Date.now()}`);
    const p = sessionPayload(script);
    const hotwords = (Array.isArray(script.keyterms) ? script.keyterms : []).map((k: any) => String(k)).filter(Boolean).slice(0, 50);
    return Response.json({
      url: signed.url,
      referenceId: signed.referenceId,
      start: {
        type: "client.action.interaction_start", origin: "client",
        agent_variables: p.agent_variables, initial_bot_message: p.initial_bot_message, initial_language_name: p.initial_language_name,
        ...(hotwords.length ? { speech_hotwords: hotwords } : {}),
      },
      voice: voiceFor(script.voice_name).name, language: p.initial_language_name,
    });
  } catch (e: any) {
    return Response.json({ error: e?.message || "Couldn't start a Sarvam session." }, { status: 502 });
  }
}
