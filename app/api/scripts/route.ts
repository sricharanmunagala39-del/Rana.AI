// @ts-nocheck
export const runtime = "nodejs";
import { normalizeHandoff } from "@/lib/handoff";
import { getScriptsForClient, createScript } from "@/lib/supabase";
import { parseSession } from "@/lib/auth";
import { INDUSTRY_TEMPLATES } from "@/lib/industryTemplates";
import { getSession } from "@/lib/session";
import { forbidUnless } from "@/lib/auth";
import { employeeBlock } from "@/lib/plans";
import { getClientById as getClientRow } from "@/lib/supabase";
import { audit } from "@/lib/audit";
import { claimResource } from "@/lib/ownership";
import { isForeignVoice } from "@/lib/voiceClone";
import { normalizePlaybook, normalizeLinks, normalizePronunciations, normalizePolicy } from "@/lib/playbook";
export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const scripts = await getScriptsForClient(session.clientId);
    return Response.json({ scripts });
  } catch (err: any) { return Response.json({ error: err.message }, { status: 500 }); }
}
export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const denied = forbidUnless(session, "admin"); if (denied) return denied;
  try {
    const body = await req.json();
    const { name, industry = "edtech", fromTemplate = true } = body;
    if (!name?.trim()) return Response.json({ error: "Script name is required" }, { status: 400 });
    const empBlock = await employeeBlock(await getClientRow(session.clientId));
    if (empBlock) return Response.json({ error: empBlock, code: "plan_limit" }, { status: 402 });
  if (await isForeignVoice(session.clientId, body.speaker)) return Response.json({ error: "That voice isn't available to your account." }, { status: 403 });

    const template = fromTemplate ? INDUSTRY_TEMPLATES[industry] : null;
    const script = await createScript({
      client_id: session.clientId,
      name: name.trim(),
      greeting: body.greeting ?? template?.greeting ?? "",
      instructions: body.instructions ?? template?.instructions ?? "",
      facts: body.facts ?? template?.facts ?? [],
      steps: body.steps ?? [],
      variables: body.variables ?? [],
      strictness: typeof body.strictness === "number" ? body.strictness : 3,
      speaker: body.speaker ?? template?.speaker ?? "anand",
      voice_name: body.voice_name ?? null,
      speech_rate: body.speech_rate ?? 1.0,
      speech_pitch: body.speech_pitch ?? 1.0,
      starting_language: body.starting_language ?? template?.language ?? "en-IN",
      model_id: body.model_id ?? null,
      background_sound_id: body.background_sound_id ?? null,
      background_volume: typeof body.background_volume === "number" ? body.background_volume : 1,
      noise_suppression: body.noise_suppression ?? "auto",
      engine: "sarvam", // Sarvam is the only engine offered
      playbook: body.playbook ? normalizePlaybook(body.playbook) : null,
      source_script: body.source_script ? String(body.source_script).slice(0, 60000) : null,
      links: normalizeLinks(body.links),
      pronunciations: normalizePronunciations(body.pronunciations),
      language_policy: normalizePolicy(body.language_policy, body.starting_language ?? "en-IN"),
      handoff: normalizeHandoff(body.handoff),
      keyterms: (Array.isArray(body.keyterms) ? body.keyterms : []).map((k: any) => String(k).slice(0, 60)).filter(Boolean).slice(0, 100),
      status: "draft",
    });
    return Response.json({ script }, { status: 201 });
  } catch (err: any) { return Response.json({ error: err.message }, { status: 500 }); }
}
