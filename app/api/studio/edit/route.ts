export const runtime = "nodejs";
export const maxDuration = 120;
import { studioGuard } from "@/lib/studioAuth";
import { chatJson } from "@/lib/llm";
import { editMessages, normalizePlaybook, normalizeLinks } from "@/lib/playbook";

/** POST { playbook, greeting, links, instruction, openingLanguage } → the edited playbook and a one-line summary. */
export async function POST(req: Request) {
  const g = await studioGuard(req);
  if (g instanceof Response) return g;
  const b = await req.json().catch(() => ({}));
  const instruction = String(b.instruction || "").trim();
  if (!instruction) return Response.json({ error: "Tell the AI what to change." }, { status: 400 });
  try {
    const out: any = await chatJson(editMessages({
      playbook: normalizePlaybook(b.playbook), greeting: String(b.greeting || ""), links: normalizeLinks(b.links), instruction, openingLanguage: String(b.openingLanguage || "en"),
    }), { maxTokens: 4000, temperature: 0.2 });
    return Response.json({
      playbook: normalizePlaybook(out.playbook),
      greeting: typeof out.greeting === "string" ? out.greeting.slice(0, 600) : String(b.greeting || ""),
      links: normalizeLinks(out.links ?? b.links),
      summary: String(out.summary || "Updated the script.").slice(0, 300),
    });
  } catch (e: any) {
    return Response.json({ error: `The AI couldn't make that change: ${e?.message || e}` }, { status: 502 });
  }
}
