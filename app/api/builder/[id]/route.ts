export const runtime = "nodejs";
import { studioGuard } from "@/lib/studioAuth";
import { updateScript } from "@/lib/supabase";
import { sb } from "@/lib/db";
import { normalizeSections, emptySections, isExact } from "@/lib/agentBuilder";

const view = (s: any) => ({
  id: s.id, name: s.name, greeting: s.greeting || "", language: s.starting_language || "en-IN", voice: s.voice_name || "Priya",
  sections: s.prompt_sections ? normalizeSections(s.prompt_sections) : emptySections(), exact: isExact(s),
  publishedAt: s.published_at || null, readyMade: !!s.engine_agent, hasOldScript: !isExact(s) && !!String(s.instructions || "").trim(),
});

/** GET → the employee in Agent Builder form, plus its saved versions (newest first). */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const g = await studioGuard(req, params.id);
  if (g instanceof Response) return g;
  const versions = (await sb<any[]>(`/script_versions?script_id=eq.${params.id}&select=version,note,greeting,sections,starting_language,voice_name,created_by,created_at&order=version.desc&limit=50`).catch(() => [])) || [];
  const s: any = g.script;
  // An employee made in the old studio: offer its current script so it can be imported in one click.
  return Response.json({ agent: view(s), versions, oldScript: !isExact(s) ? String(s.instructions || "").slice(0, 30000) : "" });
}

/** PATCH { name?, greeting?, sections?, language?, voice? } → save the draft (calls keep using the last published version). */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const g = await studioGuard(req, params.id);
  if (g instanceof Response) return g;
  const b = await req.json().catch(() => ({} as any));
  const patch: any = {};
  if (typeof b.name === "string" && b.name.trim()) patch.name = b.name.trim().slice(0, 80);
  if (typeof b.greeting === "string") patch.greeting = b.greeting.slice(0, 600);
  if (b.sections) patch.prompt_sections = normalizeSections(b.sections);
  if (/^[a-z]{2}(-[A-Z]{2})?$/.test(String(b.language || ""))) patch.starting_language = b.language;
  if (typeof b.voice === "string" && b.voice.trim()) patch.voice_name = b.voice.trim().slice(0, 80);
  const s = await updateScript(params.id, patch);
  return Response.json({ ok: true, agent: view(s) });
}
