export const runtime = "nodejs";
import { studioGuard } from "@/lib/studioAuth";
import { chat } from "@/lib/llm";
import { translateMessages, transliterateMessages, nativeScriptMessages } from "@/lib/playbook";
import { friendly } from "@/lib/sarvamHealth";

/** POST { text, to, mode? } → { text } in natural spoken language `to` (e.g. te, hi); mode "transliterate" spells a word by sound in that script;
 *  mode "script" keeps the words but writes typed-in-English-letters Telugu/Hindi… in the native script so the voice reads them right. */
export async function POST(req: Request) {
  const g = await studioGuard(req);
  if (g instanceof Response) return g;
  const b = await req.json().catch(() => ({}));
  const text = String(b.text || "").trim();
  if (!text) return Response.json({ error: "Nothing to translate." }, { status: 400 });
  try {
    const to = String(b.to || "en");
    const msgs = b.mode === "transliterate" ? transliterateMessages(text, to) : b.mode === "script" ? nativeScriptMessages(text, to) : translateMessages(text, to);
    const out = await chat(msgs, { maxTokens: b.mode === "transliterate" ? 200 : 800, temperature: 0.1 });
    return Response.json({ text: out.replace(/^["']|["']$/g, "").trim() });
  } catch (e: any) {
    console.error("[studio translate]", e?.message || e);
    return Response.json({ error: friendly(e, "Translation didn't work this time. Please try again in a minute.") }, { status: 502 });
  }
}
