// @ts-nocheck
export const runtime = "nodejs";
import { getScriptsForClient, createScript } from "@/lib/supabase";
import { parseSession } from "../auth/me/route";
import { INDUSTRY_TEMPLATES } from "@/lib/industryTemplates";
export async function GET(req: Request) {
  const session = parseSession(req);
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const scripts = await getScriptsForClient(session.clientId);
    return Response.json({ scripts });
  } catch (err: any) { return Response.json({ error: err.message }, { status: 500 }); }
}
export async function POST(req: Request) {
  const session = parseSession(req);
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const body = await req.json();
    const { name, industry = "edtech", fromTemplate = true } = body;
    if (!name?.trim()) return Response.json({ error: "Script name is required" }, { status: 400 });
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
      status: "draft",
    });
    return Response.json({ script }, { status: 201 });
  } catch (err: any) { return Response.json({ error: err.message }, { status: 500 }); }
}
