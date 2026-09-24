export const runtime = "nodejs";
export const maxDuration = 120;
import { studioGuard } from "@/lib/studioAuth";
import { chatJson, llmProvider } from "@/lib/llm";
import { analyzeMessages, heuristicPlaybook, normalizePlaybook, normalizeLinks, normalizePronunciations } from "@/lib/playbook";
import { listKnowledge } from "@/lib/knowledge";

/** POST { script, agentName, openingLanguage, scriptId? } → playbook + greeting + links + keyterms + pronunciations. */
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const g = await studioGuard(req, b.scriptId || null);
  if (g instanceof Response) return g;
  const script = String(b.script || "").trim();
  if (script.length < 40) return Response.json({ error: "Paste the full call script (at least a few lines)." }, { status: 400 });

  // Uploaded documents help the AI fill FAQs and facts.
  const notes = g.script ? (await listKnowledge(g.script.id).catch(() => [])).map((k: any) => `## ${k.title}\n${k.summary || k.content.slice(0, 1500)}`).join("\n\n") : "";

  if (!llmProvider()) {
    const h = heuristicPlaybook(script);
    return Response.json({ ...h, greeting: "", keyterms: [], pronunciations: [], fallback: true });
  }
  try {
    const out: any = await chatJson(analyzeMessages({ script, agentName: String(b.agentName || ""), openingLanguage: String(b.openingLanguage || "en"), businessNotes: notes }), { maxTokens: 4000, temperature: 0.2 });
    const scriptLinks = (script.match(/https?:\/\/[^\s)]+|www\.[^\s)]+/gi) || []).map((u) => ({ url: u, label: "Link", purpose: /pay|razorpay|checkout|instamojo|payu/i.test(u) ? "payment" : "website" }));
    const links = normalizeLinks([...(out.links || []), ...scriptLinks].filter((l, i, a) => a.findIndex((x: any) => x.url === l.url) === i));
    return Response.json({
      playbook: normalizePlaybook(out.playbook),
      greeting: String(out.greeting || "").slice(0, 600),
      links,
      keyterms: (Array.isArray(out.keyterms) ? out.keyterms : []).map((k: any) => String(k).slice(0, 60)).filter(Boolean).slice(0, 40),
      pronunciations: normalizePronunciations(out.pronunciations),
    });
  } catch (e: any) {
    console.error("[studio analyze]", e?.message);
    const h = heuristicPlaybook(script);
    return Response.json({ ...h, greeting: "", keyterms: [], pronunciations: [], fallback: true, warning: "The AI couldn't read this script just now, so it was split by headings. Try again in a minute." });
  }
}
