export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { unauthorized } from "@/lib/auth";
import { SARVAM_VOICES, voiceAgents, parseAgentRef } from "@/lib/sarvamAgent";
import { R1_CATALOG, r1PreviewSpeaker } from "@/lib/sarvamVoiceCatalog";

/** GET → all 200 R1 voices (v3 + v4) with whether each is ready for calls now (`live`) and has a sample (`sample`). */
export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  const agents = await voiceAgents().catch(() => ({} as Record<string, string>));
  const builtin = new Set(SARVAM_VOICES.map((v) => v.catalogId));
  return Response.json({
    voices: R1_CATALOG.map((v) => ({ ...v, live: builtin.has(v.id) || !!parseAgentRef(agents[v.id]), sample: !!r1PreviewSpeaker(v) })),
  }, { headers: { "Cache-Control": "private, max-age=60" } });
}
