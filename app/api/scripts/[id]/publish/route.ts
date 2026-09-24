export const runtime = "nodejs";
import { getScriptById, updateScript, getClientById } from "@/lib/supabase";
import { parseSession } from "../../../auth/me/route";
import {
  createCartesiaAgent,
  updateCartesiaAgent,
  listCartesiaModels,
  listCartesiaVoices,
  toCartesiaLanguage,
} from "@/lib/cartesia";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = parseSession(req);
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });

  if (!process.env.CARTESIA_API_KEY) {
    return Response.json(
      { error: "CARTESIA_API_KEY is not set. Add it in Vercel → Settings → Environment Variables." },
      { status: 500 }
    );
  }

  const script = await getScriptById(params.id);
  if (!script || script.client_id !== session.clientId) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const client = await getClientById(session.clientId);
  if (!client) return Response.json({ error: "Client not found" }, { status: 404 });

  try {
    const language = toCartesiaLanguage(script.starting_language);

    // Resolve a voice/model if this agent doesn't have one pinned yet.
    let resolvedVoiceId = script.speaker;
    if (!resolvedVoiceId) {
      const voices = await listCartesiaVoices();
      const match =
        voices.find((v: any) => v.language === language) ??
        voices.find((v: any) => v.language === "en") ??
        voices[0];
      if (!match) throw new Error("No Cartesia voices available on this account.");
      resolvedVoiceId = match.id;
    }

    let resolvedModelId = script.model_id;
    if (!resolvedModelId) {
      const models = await listCartesiaModels();
      const match = models.find((m: any) => /haiku/i.test(m.id ?? m.name ?? "")) ?? models[0];
      if (!match) throw new Error("No Cartesia models available on this account.");
      resolvedModelId = match.id;
    }

    const cfg = {
      name: script.name,
      instructions: script.instructions,
      initialMessage: script.greeting || null,
      language,
      voiceId: resolvedVoiceId,
      speed: script.speech_rate,
      modelId: resolvedModelId,
      noiseSuppression: (script.noise_suppression as "off" | "auto" | "max" | undefined) ?? "auto",
      backgroundSound: script.background_sound_id
        ? { fileId: script.background_sound_id, volume: typeof script.background_volume === "number" ? script.background_volume : 1 }
        : null,
    };

    // Every named agent gets its own Cartesia agent_id — that's what makes each one
    // independently selectable for a campaign or phone number later.
    let agentId = script.cartesia_agent_id;
    if (agentId) {
      await updateCartesiaAgent(agentId, cfg);
    } else {
      const created = await createCartesiaAgent(cfg);
      agentId = created.id;
    }

    // NOTE: agent-level webhooks are NOT part of the Cartesia API version this app is
    // pinned to (Cartesia-Version 2026-08-14) — confirmed directly against the live
    // OpenAPI schema: neither Create Agent nor Update Agent has a `webhook_id` field on
    // this version, and the Webhooks endpoints (POST/PATCH /agents/webhooks) only appear
    // under the older 2026-03-01 docs, not 2026-08-14's. Attaching one here always 400s
    // with "Unrecognized key: webhook_id". Call-outcome ingestion for Cartesia calls will
    // need to poll GET /v1/agents/calls (and GET /v1/agents/calls/{id} for a transcript)
    // instead of relying on a pushed webhook — not built yet. Deliberately not attempting
    // webhook setup here so it can't block Publish.

    const updated = await updateScript(params.id, {
      cartesia_agent_id: agentId,
      speaker: resolvedVoiceId,
      model_id: resolvedModelId,
      published_at: new Date().toISOString(),
    });

    return Response.json({ ok: true, script: updated, agentId, voiceId: resolvedVoiceId, modelId: resolvedModelId, language });
  } catch (err: any) {
    console.error("[script publish] failed", err?.message);
    return Response.json({ error: err?.message || "Failed to publish this agent to Cartesia" }, { status: 500 });
  }
}
