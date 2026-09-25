export const runtime = "nodejs";
export const maxDuration = 300;
import { studioGuard } from "@/lib/studioAuth";
import { chatJson, llmProvider } from "@/lib/llm";
import { analyzeMessages, heuristicPlaybook, normalizePlaybook, normalizeLinks, normalizePronunciations, splitScript, mergeAnalyses } from "@/lib/playbook";
import { listKnowledge } from "@/lib/knowledge";

/**
 * POST { script, agentName, openingLanguage, scriptId? } → playbook + greeting + links + keyterms + pronunciations.
 * Long scripts are read in parts (in parallel) and merged, so a 5,000-word script doesn't overflow one AI reply.
 */
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const g = await studioGuard(req, b.scriptId || null);
  if (g instanceof Response) return g;
  const script = String(b.script || "").trim().slice(0, 60000);
  if (script.length < 40) return Response.json({ error: "Paste the full call script (at least a few lines)." }, { status: 400 });

  // Uploaded documents help the AI fill FAQs and facts.
  const notes = g.script ? (await listKnowledge(g.script.id).catch(() => [])).map((k: any) => `## ${k.title}\n${k.summary || k.content.slice(0, 1500)}`).join("\n\n") : "";

  if (!llmProvider()) {
    const h = heuristicPlaybook(script);
    return Response.json({ ...h, greeting: "", keyterms: [], pronunciations: [], fallback: true, warning: "No AI key is set up, so the script was split by its headings. Check each card." });
  }

  const parts = splitScript(script, 9000, 6);
  const agentName = String(b.agentName || "");
  const openingLanguage = String(b.openingLanguage || "en");
  const results = await Promise.allSettled(parts.map((part, i) =>
    chatJson(analyzeMessages({ script: part, agentName, openingLanguage, businessNotes: i === 0 ? notes : "", part: i + 1, parts: parts.length }),
      { maxTokens: 6000, temperature: 0.2, timeoutMs: 170000 })));
  const ok = results.filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled").map((r) => r.value);
  const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  failed.forEach((f) => console.error("[studio analyze] part failed:", f.reason?.message || f.reason));

  if (!ok.length) {

    const h = heuristicPlaybook(script);
    return Response.json({ ...h, greeting: "", keyterms: [], pronunciations: [], fallback: true,
      warning: `The AI couldn't read this script just now, so it was split by headings. Click "Read it again" to retry.` });
  }

  const merged = mergeAnalyses(ok);
  const scriptLinks = (script.match(/https?:\/\/[^\s)]+|www\.[^\s)]+/gi) || []).map((u) => ({ url: u, label: "Link", purpose: /pay|razorpay|checkout|instamojo|payu/i.test(u) ? "payment" : "website" }));
  const links = normalizeLinks([...merged.links, ...scriptLinks].filter((l: any, i, a) => a.findIndex((x: any) => x.url === l.url) === i));
  return Response.json({
    playbook: normalizePlaybook(merged.playbook),
    greeting: merged.greeting.slice(0, 600),
    links,
    keyterms: merged.keyterms.map((k) => k.slice(0, 60)).filter(Boolean).slice(0, 40),
    pronunciations: normalizePronunciations(merged.pronunciations),
    parts: parts.length,
    ...(failed.length ? { warning: `${failed.length} of ${parts.length} parts of this long script couldn't be read, so some items may be missing. Click "Read it again" to retry.` } : {}),
  });
}
