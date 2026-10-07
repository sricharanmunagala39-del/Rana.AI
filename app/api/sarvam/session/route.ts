export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { forbidUnless } from "@/lib/auth";
import { getScriptById, getClientById } from "@/lib/supabase";
import { callingBlock } from "@/lib/plans";
import { startPractice, MAX_PRACTICE_S } from "@/lib/practice";
import { friendly } from "@/lib/sarvamHealth";
import { sarvamConfig, sarvamMissing, signedSessionUrl, sessionPayload, routeVoice } from "@/lib/sarvamAgent";

/**
 * POST { scriptId } → a single-use Sarvam WebSocket URL for a browser test call, plus the start message
 * (this employee's instructions, greeting and opening language). The Sarvam key never reaches the browser.
 */
export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const denied = forbidUnless(session, "manager"); if (denied) return denied;
  const cfg = sarvamConfig();
  if (!cfg) return Response.json({ error: "Calling isn't switched on for your account yet — RANA support has been notified." }, { status: 500 });
  const b = await req.json().catch(() => ({}));
  const script: any = b.scriptId ? await getScriptById(String(b.scriptId)) : null;
  if (!script || script.client_id !== session.clientId) return Response.json({ error: "Employee not found" }, { status: 404 });
  if (!script.published_at || !String(script.instructions || "").trim()) return Response.json({ error: `${script.name} isn't published yet — press Publish first.` }, { status: 400 });
  const planBlock = await callingBlock(await getClientById(session.clientId), { practice: true }); // own free allowance, not plan minutes
  if (planBlock) return Response.json({ error: planBlock, code: "plan_limit" }, { status: 402 });
  try {
    const rv = await routeVoice(cfg, script.voice_name);
    const signed = await signedSessionUrl(rv.cfg, `rana-test-${session.clientId.slice(0, 8)}-${Date.now()}`);
    // Test as an incoming or outgoing call; without a choice the employee answers as before (both styles).
    const direction = b.direction === "inbound" || b.direction === "outbound" ? b.direction : undefined;
    const p = sessionPayload(script, undefined, direction);
    // Metered: Sarvam bills browser sessions like calls, so every practice session is recorded.
    const practiceId = await startPractice(session.clientId, script.id, (session as any).email || null);
    const hotwords = (Array.isArray(script.keyterms) ? script.keyterms : []).map((k: any) => String(k)).filter(Boolean).slice(0, 50);
    return Response.json({
      url: signed.url,
      referenceId: signed.referenceId,
      start: {
        type: "client.action.interaction_start", origin: "client",
        agent_variables: p.agent_variables, initial_bot_message: p.initial_bot_message, initial_language_name: p.initial_language_name,
        ...(hotwords.length ? { speech_hotwords: hotwords } : {}),
        // Best effort: asks for the chosen library voice (the engine currently keeps the agent's own voice).
        ...(!rv.live && rv.voice.catalogId ? { text_to_speech_config: { speaker_id: rv.voice.catalogId } } : {}),
      },
      direction: direction || null, hasInbound: !!String(script.instructions_inbound || "").trim(), voice: rv.live ? rv.voice.name : rv.via.name, voiceNote: rv.live ? null : `${rv.voice.name} is being set up — this test uses ${rv.via.name} until it is ready.`, language: p.initial_language_name,
      practiceId, maxSeconds: MAX_PRACTICE_S,
    });
  } catch (e: any) {
    console.error("[talk session]", e?.message || e);
    return Response.json({ error: friendly(e, "Couldn't start the test call. Please try again in a minute.") }, { status: 502 });
  }
}
