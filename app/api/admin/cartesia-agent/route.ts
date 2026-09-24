export const runtime = "nodejs";
import { getClientById, updateClient } from "@/lib/supabase";
import {
  createCartesiaAgent,
  updateCartesiaAgent,
  listCartesiaModels,
  listCartesiaVoices,
  toCartesiaLanguage,
} from "@/lib/cartesia";

// Single-tenant for now, matching the existing /api/outbound-call and /api/voice-config
// routes — DBMCI is RANA's only client today. Revisit with a session-based client_id lookup
// once a second tenant needs this.
const DBMCI_CLIENT_ID = "724b4395-fba9-4de6-b773-eded4e3f3711";

export async function GET() {
  const client = await getClientById(DBMCI_CLIENT_ID);
  if (!client) return Response.json({ error: "Client not found" }, { status: 404 });
  return Response.json({
    agentId: client.cartesia_agent_id ?? null,
  });
}

export async function POST(req: Request) {
  if (!process.env.CARTESIA_API_KEY) {
    return Response.json(
      { error: "CARTESIA_API_KEY is not set. Add it in Vercel → Settings → Environment Variables." },
      { status: 500 }
    );
  }

  let body: {
    name: string;
    greeting: string;
    instructions: string;
    startingLanguage: string;
    speechRate?: number;
    voiceId?: string;
    modelId?: string;
    noiseSuppression?: "off" | "auto" | "max";
    backgroundSoundId?: string | null;
    backgroundVolume?: number;
  };
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid body." }, { status: 400 }); }

  const { name, greeting, instructions, startingLanguage, speechRate, voiceId, modelId, noiseSuppression, backgroundSoundId, backgroundVolume } = body;
  if (!name || !instructions) {
    return Response.json({ error: "name and instructions are required." }, { status: 400 });
  }

  const client = await getClientById(DBMCI_CLIENT_ID);
  if (!client) return Response.json({ error: "Client not found" }, { status: 404 });

  try {
    const language = toCartesiaLanguage(startingLanguage);

    // Resolve a voice/model if the caller didn't pin one, so "Publish" works with zero
    // Cartesia-specific setup on the user's side.
    let resolvedVoiceId = voiceId;
    if (!resolvedVoiceId) {
      const voices = await listCartesiaVoices();
      const match =
        voices.find((v: any) => v.language === language) ??
        voices.find((v: any) => v.language === "en") ??
        voices[0];
      if (!match) throw new Error("No Cartesia voices available on this account.");
      resolvedVoiceId = match.id;
    }

    let resolvedModelId = modelId;
    if (!resolvedModelId) {
      const models = await listCartesiaModels();
      const match =
        models.find((m: any) => /haiku/i.test(m.id ?? m.name ?? "")) ?? models[0];
      if (!match) throw new Error("No Cartesia models available on this account.");
      resolvedModelId = match.id;
    }

    const cfg = {
      name,
      instructions,
      initialMessage: greeting || null,
      language,
      voiceId: resolvedVoiceId,
      speed: speechRate,
      modelId: resolvedModelId,
      noiseSuppression: noiseSuppression ?? "auto",
      backgroundSound: backgroundSoundId ? { fileId: backgroundSoundId, volume: backgroundVolume ?? 1 } : null,
    };

    let agentId = client.cartesia_agent_id;
    if (agentId) {
      await updateCartesiaAgent(agentId, cfg);
    } else {
      const created = await createCartesiaAgent(cfg);
      agentId = created.id;
      await updateClient(client.id, { cartesia_agent_id: agentId });
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

    return Response.json({ ok: true, agentId, voiceId: resolvedVoiceId, modelId: resolvedModelId, language });
  } catch (err: any) {
    console.error("[cartesia publish] failed", err?.message);
    return Response.json({ error: err?.message || "Failed to publish to Cartesia" }, { status: 500 });
  }
}
