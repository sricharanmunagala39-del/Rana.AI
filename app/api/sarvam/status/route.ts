export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { sarvamConfig, sarvamMissing, SARVAM_AGENT_VOICE } from "@/lib/sarvamAgent";
import { llmProvider } from "@/lib/llm";

/** GET → which engine pieces are configured (never returns secrets). Used by the wizard and Settings. */
export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const cfg = sarvamConfig();
  return Response.json({
    sarvam: { ready: !!cfg, missing: sarvamMissing(), voice: SARVAM_AGENT_VOICE.name, number: cfg?.agentNumber || null, calling: !!cfg?.connectionId, appId: cfg?.appId || null },
    cartesia: { ready: !!process.env.CARTESIA_API_KEY },
    studioAi: llmProvider(),
  });
}
