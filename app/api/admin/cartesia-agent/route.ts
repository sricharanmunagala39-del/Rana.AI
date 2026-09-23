export const runtime = "nodejs";
import { getClientById, updateClient } from "@/lib/supabase";
import {
  createCartesiaAgent,
  updateCartesiaAgent,
  createCartesiaWebhook,
  attachWebhookToAgent,
  listCartesiaModels,
  listCartesiaVoices,
  toCartesiaLanguage,
} from "@/lib/cartesia";
import crypto from "crypto";

// Single-tenant for now, matching the existing /api/outbound-call and /api/voice-config
// routes — DBMCI is RANA's only client today. Revisit with a session-based client_id lookup
// once a second tenant needs this.
const DBMCI_CLIENT_ID = "724b4395-fba9-4de6-b773-eded4e3f3711";

export async function GET() {
  const client = await getClientById(DBMCI_CLIENT_ID);
  if (!client) return Response.json({ error: "Client not found" }, { status: 404 });
  return Response.json({
    agentId: client.cartesia_agent_id ?? null,
    hasWebhook: !!client.cartesia_webhook_id,
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
  };
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid body." }, { status: 400 }); }

  const { name, greeting, instructions, startingLanguage, speechRate, voiceId, modelId } = body;
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
    };

    let agentId = client.cartesia_agent_id;
    if (agentId) {
      await updateCartesiaAgent(agentId, cfg);
    } else {
      const created = await createCartesiaAgent(cfg);
      agentId = created.id;
      await updateClient(client.id, { cartesia_agent_id: agentId });
    }

    let webhookId = client.cartesia_webhook_id;
    if (!webhookId) {
      const base = process.env.NEXT_PUBLIC_APP_URL || "https://rana-ai-roan.vercel.app";
      const webhookSecret = crypto.randomBytes(16).toString("hex");
      const webhookUrl = `${base}/api/webhooks/cartesia?key=${webhookSecret}`;
      const createdWebhook = await createCartesiaWebhook(webhookUrl, webhookSecret, `RANA — ${name}`);
      webhookId = createdWebhook.id;
      await updateClient(client.id, { cartesia_webhook_id: webhookId, cartesia_webhook_secret: webhookSecret });
      await attachWebhookToAgent(agentId!, webhookId);
    }

    return Response.json({ ok: true, agentId, webhookId, voiceId: resolvedVoiceId, modelId: resolvedModelId, language });
  } catch (err: any) {
    console.error("[cartesia publish] failed", err?.message);
    return Response.json({ error: err?.message || "Failed to publish to Cartesia" }, { status: 500 });
  }
}
