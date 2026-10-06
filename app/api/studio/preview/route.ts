export const runtime = "nodejs";
export const maxDuration = 60;
import { studioGuard } from "@/lib/studioAuth";
import { chatJson } from "@/lib/llm";
import { previewMessages, normalizePlaybook, baseLang, LANG_NAMES } from "@/lib/playbook";
import { friendly } from "@/lib/sarvamHealth";

/**
 * POST { playbook, greeting, to } → { lines: [{ id, section, en, text }], sample: [{ who, text, en }] }
 * Every card of the call plan in the language the employee speaks (e.g. Telugu), plus a sample call, so the owner can
 * read and hear exactly how it will sound and lock any line to their own wording.
 */
export async function POST(req: Request) {
  const g = await studioGuard(req);
  if (g instanceof Response) return g;
  const b = await req.json().catch(() => ({} as any));
  const to = baseLang(b.to);
  if (!LANG_NAMES[to]) return Response.json({ error: "Pick a language." }, { status: 400 });
  const pb = normalizePlaybook(b.playbook);
  const lines: { id: string; section: string; en: string }[] = [];
  const add = (id: string, section: string, en: string) => { if (String(en || "").trim()) lines.push({ id, section, en: String(en).trim() }); };
  add("opening", "Opening", pb.opening);
  pb.discovery.forEach((t, i) => add(`discovery.${i}`, `Question ${i + 1}`, t));
  pb.pitch.forEach((t, i) => add(`pitch.${i}`, `Pitch ${i + 1}`, t));
  pb.objections.forEach((o, i) => add(`objections.${i}`, `If they say “${o.objection}”`, o.response));
  add("closing", "Closing", pb.closing);
  add("followUp", "If not ready", pb.followUp);
  pb.faqs.forEach((f, i) => add(`faqs.${i}`, `Q: ${f.question}`, f.answer));
  if (!lines.length && !String(b.greeting || "").trim()) return Response.json({ error: "Build the call plan first, then preview it." }, { status: 400 });
  try {
    const j = await chatJson<any>(previewMessages(lines.slice(0, 60).map((l) => ({ id: l.id, text: l.en })), String(b.greeting || ""), pb.persona, to), { maxTokens: 6000, temperature: 0.2, timeoutMs: 55000 });
    const byId = new Map<string, string>((Array.isArray(j?.lines) ? j.lines : []).map((x: any) => [String(x?.id), String(x?.text || "").trim()]));
    const sample = (Array.isArray(j?.sample) ? j.sample : []).slice(0, 12).map((t: any) => ({ who: t?.who === "caller" ? "caller" : "agent", text: String(t?.text || "").trim().slice(0, 600), en: String(t?.en || "").trim().slice(0, 300) })).filter((t: any) => t.text);
    return Response.json({ lang: to, lines: lines.map((l) => ({ ...l, text: byId.get(l.id) || "" })), sample });
  } catch (e: any) {
    console.error("[studio preview]", e?.message || e);
    return Response.json({ error: friendly(e, "Couldn't build the preview just now. Please try again in a minute.") }, { status: 502 });
  }
}
