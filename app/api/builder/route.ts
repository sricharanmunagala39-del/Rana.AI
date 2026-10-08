export const runtime = "nodejs";
import { studioGuard } from "@/lib/studioAuth";
import { createScript } from "@/lib/supabase";
import { emptySections } from "@/lib/agentBuilder";

/** POST { name, language? } → a new Agent Builder employee (draft). */
export async function POST(req: Request) {
  const g = await studioGuard(req);
  if (g instanceof Response) return g;
  const b = await req.json().catch(() => ({} as any));
  const name = String(b.name || "").trim().slice(0, 80) || "New agent";
  const lang = /^[a-z]{2}(-[A-Z]{2})?$/.test(String(b.language || "")) ? String(b.language) : "en-IN";
  const s: any = await createScript({ client_id: g.session.clientId, name, engine: "sarvam", starting_language: lang, voice_name: "Priya", prompt_mode: "exact", prompt_sections: emptySections() });
  return Response.json({ id: s.id });
}
