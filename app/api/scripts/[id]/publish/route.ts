export const runtime = "nodejs";
import { getScriptById, updateScript, getClientById } from "@/lib/supabase";
import { parseSession } from "@/lib/auth";
import {
  createCartesiaAgent,
  updateCartesiaAgent,
  listCartesiaModels,
  listCartesiaVoices,
  toCartesiaLanguage,
} from "@/lib/cartesia";
import { getSession } from "@/lib/session";
import { forbidUnless } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { claimResource } from "@/lib/ownership";
import { buildAgentPrompt, normalizePlaybook, normalizePolicy, normalizeLinks, normalizePronunciations } from "@/lib/playbook";
import { listKnowledge } from "@/lib/knowledge";
import { STRICTNESS_LABELS } from "@/lib/storage";
import { sarvamConfig, sarvamMissing, voiceFor, withVoice } from "@/lib/sarvamAgent";

/** Same instructions for either engine: playbook, links, documents, pronunciation and language rules in one prompt. */
async function compile(script: any) {
  const knowledge = await listKnowledge(script.id).catch(() => []);
  const tier = STRICTNESS_LABELS.find((t) => t.value === script.strictness) ?? STRICTNESS_LABELS[2];
  const instructions = buildAgentPrompt({
    name: script.name, greeting: script.greeting || "", startingLanguage: script.starting_language || "en-IN",
    strictnessText: tier.description,
    playbook: script.playbook ? normalizePlaybook(script.playbook) : null,
    steps: script.playbook ? undefined : script.steps, facts: script.facts || [],
    policy: normalizePolicy(script.language_policy, script.starting_language || "en-IN"),
    links: normalizeLinks(script.links), pronunciations: normalizePronunciations(script.pronunciations),
    knowledge: knowledge.map((k: any) => ({ title: k.title, kind: k.kind, summary: k.summary, content: k.content })),
  });
  const keyterms = Array.from(new Set([...(script.keyterms || []), ...normalizePronunciations(script.pronunciations).map((p) => p.word)])).slice(0, 100);
  return { instructions, keyterms };
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const denied = forbidUnless(session, "admin"); if (denied) return denied;

  const first = await getScriptById(params.id);
  if (!first || first.client_id !== session.clientId) return Response.json({ error: "Not found" }, { status: 404 });

  // Sarvam engine (the only engine offered to customers): nothing to create remotely. RANA's instructions travel
  // with every call to the RANA Runtime agent for the chosen voice, so publishing = compiling and saving them.
  // Older Cartesia drafts are moved onto Sarvam when they are published.
  const SARVAM_ONLY = true;
  if (SARVAM_ONLY || (first as any).engine !== "cartesia") {
    const voice = voiceFor((first as any).engine === "cartesia" ? null : first.voice_name);
    const base = sarvamConfig();
    const cfg = base ? withVoice(base, voice.key) : null;
    if (!cfg) return Response.json({ error: `Sarvam isn't configured: set ${sarvamMissing().join(", ")} in Vercel.` }, { status: 500 });
    try {
      const { instructions, keyterms } = await compile(first);
      const agentRef = `sarvam:${cfg.appId}`;
      await audit(session, "employee_published", { req, targetType: "employee", targetId: first.id, detail: { name: first.name, engine: "sarvam", agentId: cfg.appId } });
      const updated = await updateScript(params.id, {
        cartesia_agent_id: agentRef, engine: "sarvam", voice_name: voice.name, published_at: new Date().toISOString(), instructions, keyterms,
      } as any);
      return Response.json({ ok: true, script: updated, agentId: agentRef, engine: "sarvam", voice: voice.name, chars: instructions.length });
    } catch (err: any) {
      return Response.json({ error: err?.message || "Couldn't publish this employee." }, { status: 500 });
    }
  }

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

    const { instructions, keyterms } = await compile(script);

    const cfg = {
      name: script.name,
      instructions,
      keyterms,
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
    let agentId = script.cartesia_agent_id && !String(script.cartesia_agent_id).startsWith("sarvam:") ? script.cartesia_agent_id : null;
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

    await claimResource(session.clientId, "agent", agentId!, script.name).catch(() => {});
    await audit(session, "employee_published", { req, targetType: "employee", targetId: script.id, detail: { name: script.name, agentId } });

    const updated = await updateScript(params.id, {
      cartesia_agent_id: agentId,
      speaker: resolvedVoiceId,
      model_id: resolvedModelId,
      published_at: new Date().toISOString(),
      instructions,
    });

    return Response.json({ ok: true, script: updated, agentId, voiceId: resolvedVoiceId, modelId: resolvedModelId, language });
  } catch (err: any) {
    console.error("[script publish] failed", err?.message);
    return Response.json({ error: err?.message || "Failed to publish this agent to Cartesia" }, { status: 500 });
  }
}
