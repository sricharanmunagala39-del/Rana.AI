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
      speaker: body.speaker ?? template?.speaker ?? "anand",
      speech_rate: body.speech_rate ?? 1.0,
      speech_pitch: body.speech_pitch ?? 1.0,
      starting_language: body.starting_language ?? template?.language ?? "en-IN",
      status: "draft",
    });
    return Response.json({ script }, { status: 201 });
  } catch (err: any) { return Response.json({ error: err.message }, { status: 500 }); }
}
