export const runtime = "nodejs";
import { getScriptById, updateScript, getClientById, updateClient } from "@/lib/supabase";
import { parseSession } from "../../../auth/me/route";
import {
  createCartesiaAgent,
  updateCartesiaAgent,
  createCartesiaWebhook,
  attachWebhookToAgent,
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

    // One webhook per CLIENT (not per agent) — Cartesia's incoming payload carries its own
    // agent_id, and our webhook route resolves the client purely from the ?key= secret, so
    // every agent under this client can safely share the same webhook URL.
    let webhookId = client.cartesia_webhook_id;
    if (!webhookId) {
      const crypto = await import("crypto");
      const base = process.env.NEXT_PUBLIC_APP_URL || "https://rana-ai-roan.vercel.app";
      const webhookSecret = crypto.randomBytes(16).toString("hex");
      const webhookUrl = `${base}/api/webhooks/cartesia?key=${webhookSecret}`;
      const createdWebhook = await createCartesiaWebhook(webhookUrl, webhookSecret, `RANA — ${client.name}`);
      webhookId = createdWebhook.id;
      await updateClient(client.id, { cartesia_webhook_id: webhookId, cartesia_webhook_secret: webhookSecret });
    }
    await attachWebhookToAgent(agentId, webhookId);

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
