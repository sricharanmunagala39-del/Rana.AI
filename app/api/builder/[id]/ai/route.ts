export const runtime = "nodejs";
export const maxDuration = 120;
import { studioGuard } from "@/lib/studioAuth";
import { getClientById } from "@/lib/supabase";
import { chatJson } from "@/lib/llm";
import { friendly } from "@/lib/sarvamHealth";
import { importMessages, changeMessages, normalizeSections, SECTION_KEYS } from "@/lib/agentBuilder";

/**
 * POST { mode: "import", text } → { greeting, sections } built from a pasted script.
 * POST { mode: "change", request, sections, greeting } → { changes: {section: newText}, greeting|null, summary }.
 * Nothing is saved here — the page shows the proposal and the owner accepts it.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const g = await studioGuard(req, params.id);
  if (g instanceof Response) return g;
  const b = await req.json().catch(() => ({} as any));
  const client: any = await getClientById(g.session.clientId).catch(() => null);
  const business = String(client?.company_name || client?.name || "").trim();
  try {
    if (b.mode === "import") {
      const text = String(b.text || "").trim();
      if (text.length < 20) return Response.json({ error: "Paste the script first." }, { status: 400 });
      const out: any = await chatJson(importMessages(text, business), { maxTokens: 9000, temperature: 0.1, timeoutMs: 110000 });
      return Response.json({ greeting: String(out?.greeting || "").slice(0, 600), sections: normalizeSections(out?.sections) });
    }
    const request = String(b.request || "").trim();
    if (!request) return Response.json({ error: "Type what you want to change." }, { status: 400 });
    const sections = normalizeSections(b.sections);
    const out: any = await chatJson(changeMessages({ sections, greeting: String(b.greeting || ""), request, business }), { maxTokens: 8000, temperature: 0.1, timeoutMs: 110000 });
    const changes: Record<string, string> = {};
    for (const [k, v] of Object.entries(out?.changes || {})) if ((SECTION_KEYS as string[]).includes(k) && typeof v === "string" && v.trim() !== (sections as any)[k].trim()) changes[k] = v.trim().slice(0, 12000);
    const greeting = typeof out?.greeting === "string" && out.greeting.trim() && out.greeting.trim() !== String(b.greeting || "").trim() ? out.greeting.trim().slice(0, 600) : null;
    return Response.json({ changes, greeting, summary: String(out?.summary || (Object.keys(changes).length || greeting ? "Updated the script." : "Nothing needed to change.")).slice(0, 400) });
  } catch (e: any) {
    console.error("[builder ai]", e?.message || e);
    return Response.json({ error: friendly(e, "The AI couldn't do that just now. Please try again in a minute.") }, { status: 502 });
  }
}
