export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { sarvamConfig, sarvamMissing, SARVAM_AGENT_VOICE, SARVAM_VOICES, withClientNumber } from "@/lib/sarvamAgent";
import { getClientById } from "@/lib/supabase";
import { llmProvider } from "@/lib/llm";
import { liveTransferOn } from "@/lib/handoff";

/** GET → which engine pieces are configured (never returns secrets). Used by the wizard and Settings. */
export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const base = sarvamConfig();
  const client: any = await getClientById(session.clientId).catch(() => null);
  const cfg = base ? withClientNumber(base, client) : null;
  return Response.json({
    sarvam: { ready: !!cfg, missing: sarvamMissing(), voice: SARVAM_AGENT_VOICE.name, voices: SARVAM_VOICES.map((v) => ({ key: v.key, name: v.name, gender: v.gender, tone: v.tone })), number: cfg?.agentNumber || null, ownNumber: !!client?.sarvam_agent_number, calling: !!cfg?.connectionId, appId: cfg?.appId || null },
    cartesia: { ready: !!process.env.CARTESIA_API_KEY },
    studioAi: llmProvider(),
    liveTransfer: liveTransferOn(),
  });
}
