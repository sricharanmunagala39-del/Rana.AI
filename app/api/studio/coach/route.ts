export const runtime = "nodejs";
export const maxDuration = 90;
import { studioGuard } from "@/lib/studioAuth";
import { chatJson } from "@/lib/llm";
import { buildAgentPrompt, normalizePlaybook, normalizePolicy, normalizeLinks, normalizePronunciations } from "@/lib/playbook";
import { normalizeHandoff } from "@/lib/handoff";
import { STRICTNESS_LABELS } from "@/lib/storage";
import { auditMessages, rewriteMessages, simulateMessages, customerMessages, cleanAnalysis, businessSummary, OBJECTION_TYPES, REWRITE_KINDS, PERSONAS, type Turn } from "@/lib/coach";

const REF = /^(objection|pitch|discovery|faq) \d{1,2}$|^(opening|closing|greeting)$/;
const str = (v: any, n: number) => String(v ?? "").slice(0, n);

/**
 * POST { mode, … } — the Review step's AI coach. Works on the unsaved script in the wizard.
 *  audit    → { score, summary, findings[{ref,type,problem,suggestion}], missing[{objection,type,response}] }
 *  rewrite  → { options: string[] }                     (text, kind, language, context)
 *  simulate → { reply, analysis }                       (history of {role:"customer"|"agent", text})
 *  customer → { line, done }                            (persona, history) — the AI plays the caller
 */
export async function POST(req: Request) {
  const g = await studioGuard(req);
  if (g instanceof Response) return g;
  const b = await req.json().catch(() => ({}));
  const mode = String(b.mode || "");
  const playbook = normalizePlaybook(b.playbook);
  const openingLanguage = str(b.openingLanguage || "en-IN", 10);
  const policy = normalizePolicy(b.policy, openingLanguage);
  const greeting = str(b.greeting, 600);
  const history: Turn[] = (Array.isArray(b.history) ? b.history : []).slice(-24)
    .map((t: any) => ({ role: t?.role === "agent" ? "agent" : "customer", text: str(t?.text, 600) } as Turn)).filter((t: Turn) => t.text.trim());

  try {
    if (mode === "audit") {
      const out: any = await chatJson(auditMessages({ playbook, greeting, openingLanguage, policy, name: str(b.name, 60) }), { maxTokens: 3500, temperature: 0.3, timeoutMs: 80000 });
      const findings = (Array.isArray(out.findings) ? out.findings : []).map((f: any) => ({
        ref: REF.test(String(f?.ref || "").trim()) ? String(f.ref).trim() : "flow",
        type: OBJECTION_TYPES[f?.type] ? f.type : "flow",
        problem: str(f?.problem, 200), suggestion: str(f?.suggestion, 600),
      })).filter((f: any) => f.suggestion.trim()).slice(0, 8);
      const missing = (Array.isArray(out.missing) ? out.missing : []).map((m: any) => ({
        objection: str(m?.objection, 200), type: OBJECTION_TYPES[m?.type] ? m.type : "other", response: str(m?.response, 600),
      })).filter((m: any) => m.objection.trim() && m.response.trim()).slice(0, 5);
      const score = Math.max(0, Math.min(100, Math.round(Number(out.score) || 0)));
      return Response.json({ score, summary: str(out.summary, 240), findings, missing });
    }

    if (mode === "rewrite") {
      const text = str(b.text, 1200).trim();
      if (!text) return Response.json({ error: "Nothing to rewrite." }, { status: 400 });
      const kind = REWRITE_KINDS[b.kind] ? b.kind : "improve";
      const out: any = await chatJson(rewriteMessages({ text, kind, language: str(b.language || "auto", 8), context: str(b.context, 300), facts: playbook.facts, openingLanguage, policy }), { maxTokens: 1200, temperature: kind === "alternatives" ? 0.8 : 0.5, timeoutMs: 60000 });
      const options = (Array.isArray(out.options) ? out.options : [out.text || out.line].filter(Boolean)).map((o: any) => str(o, 800).trim().replace(/^["“]|["”]$/g, "")).filter(Boolean).slice(0, 3);
      if (!options.length) throw new Error("empty");
      return Response.json({ options });
    }

    if (mode === "simulate") {
      if (!history.length || history[history.length - 1].role !== "customer") return Response.json({ error: "Type what the customer says." }, { status: 400 });
      const tier = STRICTNESS_LABELS.find((t) => t.value === Number(b.strictness)) ?? STRICTNESS_LABELS[2];
      const system = buildAgentPrompt({
        name: str(b.name, 60) || "the agent", greeting, startingLanguage: openingLanguage, strictnessText: tier.description,
        playbook, policy, links: normalizeLinks(b.links), pronunciations: normalizePronunciations(b.pronunciations), knowledge: [],
        handoff: normalizeHandoff(b.handoff),
      });
      const out: any = await chatJson(simulateMessages({ system, greeting, history }), { maxTokens: 900, temperature: 0.4, timeoutMs: 60000 });
      const reply = str(out.reply ?? out.agent ?? out.text, 800).trim();
      if (!reply) throw new Error("empty reply");
      return Response.json({ reply, analysis: cleanAnalysis(out.analysis || {}) });
    }

    if (mode === "customer") {
      const persona = PERSONAS[b.persona] ? b.persona : "price";
      const out: any = await chatJson(customerMessages({ persona, business: businessSummary(playbook, greeting), openingLanguage, history, greeting }), { maxTokens: 400, temperature: 0.9, timeoutMs: 45000 });
      const line = str(out.line ?? out.text, 400).trim();
      if (!line) throw new Error("empty line");
      return Response.json({ line, done: !!out.done });
    }

    return Response.json({ error: "Unknown mode" }, { status: 400 });
  } catch (e: any) {
    console.error("[studio coach]", mode, e?.message || e);
    const noAi = /No AI model is configured/.test(String(e?.message));
    return Response.json({ error: noAi ? "The AI coach isn't set up yet — RANA support has been told." : "The AI coach couldn't answer just now. Please try again." }, { status: noAi ? 503 : 502 });
  }
}
