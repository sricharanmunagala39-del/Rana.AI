export const runtime = "nodejs";
import { parseSession, unauthorized } from "@/lib/auth";
import { getClientById, updateClient } from "@/lib/supabase";
import {
  createCartesiaAgent,
  updateCartesiaAgent,
  listCartesiaModels,
  listCartesiaVoices,
  toCartesiaLanguage,
} from "@/lib/cartesia";


export async function GET(req: Request) {
  const session = parseSession(req);
  if (!session) return unauthorized();
  const client = await getClientById(session.clientId);
  if (!client) return Response.json({ error: "Client not found" }, { status: 404 });
  return Response.json({
    agentId: client.cartesia_agent_id ?? null,
  });
}

export async function POST(req: Request) {
  const session = parseSession(req);
  if (!session) return unauthorized();
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

  const client = await getClientById(session.clientId);
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

    // Agent-level webhooks don't exist on Cartesia-Version 2026-08-14, so nothing is attached
    // here. Call outcomes are pulled from GET /agents/calls by lib/callSync.ts instead.

    return Response.json({ ok: true, agentId, voiceId: resolvedVoiceId, modelId: resolvedModelId, language });
  } catch (err: any) {
    console.error("[cartesia publish] failed", err?.message);
    return Response.json({ error: err?.message || "Failed to publish to Cartesia" }, { status: 500 });
  }
}
