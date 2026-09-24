export const runtime = "nodejs";
import { studioGuard } from "@/lib/studioAuth";
import { chat } from "@/lib/llm";
import { translateMessages } from "@/lib/playbook";

/** POST { text, to } → { text } in natural spoken language `to` (e.g. te, hi). */
export async function POST(req: Request) {
  const g = await studioGuard(req);
  if (g instanceof Response) return g;
  const b = await req.json().catch(() => ({}));
  const text = String(b.text || "").trim();
  if (!text) return Response.json({ error: "Nothing to translate." }, { status: 400 });
  try {
    const out = await chat(translateMessages(text, String(b.to || "en")), { maxTokens: 800, temperature: 0.2 });
    return Response.json({ text: out.replace(/^["']|["']$/g, "").trim() });
  } catch (e: any) {
    return Response.json({ error: `Translation failed: ${e?.message || e}` }, { status: 502 });
  }
}
