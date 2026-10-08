export const runtime = "nodejs";
export const maxDuration = 120;
import { studioGuard } from "@/lib/studioAuth";
import { getClientById } from "@/lib/supabase";
import { chatJson } from "@/lib/llm";
import { friendly } from "@/lib/sarvamHealth";
import { importMessages, changeMessages, chatMessages, normalizeSections, SECTION_KEYS, type ChatTurn } from "@/lib/agentBuilder";
import { fetchPageText } from "@/lib/knowledge";

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
    if (b.mode === "chat") {
      const message = String(b.message || "").trim();
      if (!message) return Response.json({ error: "Type a message, paste a website link or a script." }, { status: 400 });
      const sections = normalizeSections(b.sections);
      const history: ChatTurn[] = (Array.isArray(b.history) ? b.history : []).slice(-10).map((t: any) => ({ role: t?.role === "ai" ? "ai" : "owner", text: String(t?.text || "").slice(0, 2000) }));
      // Website links in the message are read and given to the AI (up to 2 pages).
      const urls = Array.from(new Set((message.match(/\b(?:https?:\/\/|www\.)[^\s<>"')]+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|in|co\.in|org|net|io|ai|co|biz|info|store|shop)(?:\/[^\s<>"')]*)?/gi) || []).map((u) => u.replace(/[.,;]+$/, "")))).slice(0, 2);
      const sources: { url: string; title: string; text: string }[] = []; const sourceErrors: string[] = [];
      await Promise.all(urls.map(async (u) => {
        try { const pg = await fetchPageText(u); sources.push({ url: u, title: pg.title, text: pg.text }); }
        catch (e: any) { sourceErrors.push(`${u} (${String(e?.message || "unreadable").slice(0, 120)})`); }
      }));
      const out: any = await chatJson(chatMessages({ sections, greeting: String(b.greeting || ""), history, message, sources, sourceErrors, business }), { maxTokens: 9000, temperature: 0.2, timeoutMs: 110000 });
      const changes: Record<string, string> = {};
      for (const [k, v] of Object.entries(out?.changes || {})) if ((SECTION_KEYS as string[]).includes(k) && typeof v === "string" && v.trim() !== (sections as any)[k].trim()) changes[k] = v.trim().slice(0, 12000);
      const greeting = typeof out?.greeting === "string" && out.greeting.trim() && out.greeting.trim() !== String(b.greeting || "").trim() ? out.greeting.trim().slice(0, 600) : null;
      const questions = (Array.isArray(out?.questions) ? out.questions : []).map((q: any) => String(q || "").trim()).filter(Boolean).slice(0, 4).map((q: string) => q.slice(0, 240));
      const read = sources.map((x) => x.title || x.url);
      return Response.json({ reply: String(out?.reply || (Object.keys(changes).length ? "I updated the script." : "Noted.")).slice(0, 600), questions, changes, greeting, read, unread: sourceErrors });
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
