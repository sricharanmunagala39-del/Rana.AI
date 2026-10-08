export const runtime = "nodejs";
import { studioGuard } from "@/lib/studioAuth";
import { updateScript } from "@/lib/supabase";
import { sb } from "@/lib/db";
import { audit } from "@/lib/audit";
import { sarvamConfig, routeVoice } from "@/lib/sarvamAgent";
import { compileSections, normalizeSections } from "@/lib/agentBuilder";

/** POST { note?, greeting?, sections?, name?, language?, voice? } → save, compile exactly as written, publish and keep a version. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const g = await studioGuard(req, params.id);
  if (g instanceof Response) return g;
  const b = await req.json().catch(() => ({} as any));
  const s: any = g.script;
  const sections = normalizeSections(b.sections ?? s.prompt_sections);
  const greeting = String(b.greeting ?? s.greeting ?? "").slice(0, 600).trim();
  if (!Object.values(sections).some((v) => v.trim())) return Response.json({ error: "Write the script first (at least one section)." }, { status: 400 });
  if (!greeting) return Response.json({ error: "Add the greeting — the first line the agent says." }, { status: 400 });
  const language = /^[a-z]{2}(-[A-Z]{2})?$/.test(String(b.language || "")) ? b.language : s.starting_language || "en-IN";
  const voice = String(b.voice || s.voice_name || "Priya").slice(0, 80);
  const name = String(b.name || s.name || "").trim().slice(0, 80) || s.name;
  const cfg = sarvamConfig();
  const routed = cfg ? await routeVoice(cfg, voice) : null;
  const instructions = compileSections(sections);
  const prev = (await sb<any[]>(`/script_versions?script_id=eq.${s.id}&select=version&order=version.desc&limit=1`).catch(() => [])) || [];
  const version = (prev[0]?.version || 0) + 1;
  await sb(`/script_versions`, { method: "POST", prefer: "return=minimal", body: JSON.stringify({ script_id: s.id, client_id: s.client_id, version, note: String(b.note || "").slice(0, 200) || null, greeting, sections, starting_language: language, voice_name: voice, created_by: g.session.email || null }) });
  const updated = await updateScript(s.id, {
    name, greeting, prompt_sections: sections, prompt_mode: "exact", instructions, instructions_inbound: null, engine: "sarvam", engine_agent: null,
    starting_language: language, voice_name: voice, published_at: new Date().toISOString(), ...(routed?.cfg?.appId ? { cartesia_agent_id: `sarvam:${routed.cfg.appId}` } : {}),
  } as any);
  await audit(g.session, "employee_published", { req, targetType: "employee", targetId: s.id, detail: { name, engine: "sarvam", builder: true, version } }).catch(() => {});
  return Response.json({ ok: true, version, publishedAt: (updated as any)?.published_at, voiceLive: routed ? routed.live : true, voiceUsed: routed?.via?.name || voice });
}
