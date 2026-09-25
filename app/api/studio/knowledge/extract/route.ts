export const runtime = "nodejs";
export const maxDuration = 120;
import { studioGuard } from "@/lib/studioAuth";
import { chatJson, llmProvider } from "@/lib/llm";
import { extractMessages } from "@/lib/playbook";
import { getKnowledge, thinHint } from "@/lib/knowledge";

const lines = (v: any, n = 40) => (Array.isArray(v) ? v.map((x) => String(x || "").trim().slice(0, 400)).filter(Boolean).slice(0, n) : []);

/** POST { scriptId, id, openingLanguage } → facts / FAQs / pitch points from one document, for the owner to add to the script. */
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const g = await studioGuard(req, b.scriptId);
  if (g instanceof Response) return g;
  if (!g.script) return Response.json({ error: "Save the employee first." }, { status: 400 });
  const k = await getKnowledge(g.script.id, String(b.id || ""));
  if (!k) return Response.json({ error: "That document isn't there any more." }, { status: 404 });
  if (!llmProvider()) return Response.json({ error: "AI reading isn't available right now — RANA support has been notified." }, { status: 400 });
  try {
    const out: any = await chatJson(extractMessages(k.title, k.content || "", String(b.openingLanguage || "en")), { maxTokens: 3000, temperature: 0.1 });
    return Response.json({
      summary: String(out.summary || "").slice(0, 300),
      facts: lines(out.facts),
      faqs: (Array.isArray(out.faqs) ? out.faqs : []).map((f: any) => ({ question: String(f?.question || "").trim().slice(0, 300), answer: String(f?.answer || "").trim().slice(0, 800) })).filter((f: any) => f.question && f.answer).slice(0, 30),
      pitch: lines(out.pitch, 10),
      missing: lines(out.missing, 10),
      hint: thinHint(k),
    });
  } catch (e: any) {
    console.error("[knowledge extract]", e?.message || e);
    return Response.json({ error: "The AI couldn't read this document right now. Please try again in a minute." }, { status: 502 });
  }
}
