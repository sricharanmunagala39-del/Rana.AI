export const runtime = "nodejs";
import crypto from "crypto";
import { friendly } from "@/lib/sarvamHealth";
import { sarvamConfig, signedSessionUrl, voiceFor, withVoice } from "@/lib/sarvamAgent";
import { speakableGreeting } from "@/lib/acronym";
import { webTalkScript, webTalkBlock, startWebTalk, translateLine, LANG_NAME, R1_LANGS } from "@/lib/webTalk";
import { SCENARIOS } from "@/app/landing/talkContent";
import { isMarket } from "@/app/landing/markets";
import { industryOf, useCaseOf } from "@/app/industries";
import { useCaseScript, WRITTEN_GREETING_LANGS } from "@/lib/industryDemo";
import { cleanProfile } from "@/lib/siteProfile";
import { cleanFirstName } from "@/lib/callStyle";
import { elevenReady, elevenSession, getWebVoice, defaultMaleVoice } from "@/lib/elevenlabs";
import { getSession } from "@/lib/session";
import { hqCan } from "@/lib/hq";

/**
 * Public (no login): POST { kind: "talk" | "demo" | "usecase", scenario?, industry?, useCase?, profile?, lang, market } → a single-use R1 voice session for the
 * website's "Talk to Rana" and Instant demos. Instructions are built on the server (lib/webTalk); limits keep cost bounded.
 */
const burst = new Map<string, number[]>();

export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "?";
  const now = Date.now();
  // Signed-in RANA HQ staff test demos all day: no visitor limits for them.
  const staff = hqCan(await getSession(req).catch(() => null), "view");
  const recent = (burst.get(ip) || []).filter((t) => now - t < 60e3);
  if (!staff && recent.length >= 3) return Response.json({ error: "One moment — please wait a minute before starting another conversation." }, { status: 429 });
  recent.push(now); burst.set(ip, recent);

  const b = await req.json().catch(() => ({} as any));
  if (b.website) return Response.json({ error: "Not available." }, { status: 400 }); // honeypot
  const kind: "talk" | "demo" | "usecase" = b.kind === "demo" ? "demo" : b.kind === "usecase" ? "usecase" : "talk";
  const ind = kind === "usecase" ? industryOf(String(b.industry || "")) : undefined;
  const uc = ind ? useCaseOf(ind, String(b.useCase || "")) : undefined;
  if (kind === "usecase" && (!ind || !uc)) return Response.json({ error: "Pick a use case first." }, { status: 400 });
  const scenario = kind === "demo" ? (SCENARIOS.some((s) => s.key === b.scenario) ? String(b.scenario) : null) : null;
  if (kind === "demo" && !scenario) return Response.json({ error: "Pick a demo first." }, { status: 400 });
  const lang = (LANG_NAME as any)[b.lang] ? b.lang : "en";
  const market = isMarket(b.market) ? b.market : "in";

  const cfg = sarvamConfig();
  if (!cfg) return Response.json({ error: "Live conversations are paused right now. Watch a sample call or book a demo." }, { status: 503 });
  const blocked = staff ? null : await webTalkBlock(ip);
  if (blocked) return Response.json({ error: blocked, code: "limit" }, { status: 429 });

  const profile = kind === "usecase" ? cleanProfile(b.profile) : null;
  const base = kind === "usecase" ? { ...useCaseScript(ind!, uc!, { lang, profile, name: cleanFirstName(b.name) }), lang, voice: "priya" as const, translateGreeting: !WRITTEN_GREETING_LANGS.includes(lang) } : webTalkScript(kind, { scenario, lang, market });
  // Opening lines are hand-written for the main languages; any other language gets an AI translation (cached).
  const s0 = { ...base, greeting: (base as any).translateGreeting ? await translateLine(base.greeting, lang) : base.greeting };
  // Visitors choose a female (default) or male voice. A male voice also speaks with masculine grammar.
  const male = b.voice === "male";
  const s = male ? { ...s0, voice: "aditya", greeting: masculine(s0.greeting), instructions: `${s0.instructions}\n\n# Your voice\nYou speak with a man's voice. Your name is still Rana. In languages where verbs or adjectives change with gender (Hindi, Marathi, Gujarati, Punjabi, Bengali, Odia, Arabic, Spanish, French and others), always use the masculine first-person forms for yourself.` } : s0;
  const secret = crypto.randomBytes(18).toString("base64url");
  const record = () => startWebTalk({ kind, scenario: kind === "usecase" ? `${ind!.slug}:${uc!.key}` : scenario, language: lang, market, ip, max_seconds: s.maxSeconds, secret,
    ...(kind === "usecase" ? { context: { industry: ind!.slug, useCase: uc!.key, title: uc!.title, company: profile?.company || null, url: profile?.url || null } } : {}) });

  // HQ → Voice engines can switch the website to R3 (natural voices). Any problem there falls back to R1.
  const wv = await getWebVoice();
  // Global languages (Arabic, Spanish, ...) only run on R3, whatever the website default is.
  const needsR3 = !R1_LANGS.includes(lang);
  if (needsR3 && !(wv.voiceId && elevenReady())) return Response.json({ error: "This language isn't available right now. Please pick English or an Indian language." }, { status: 400 });
  if ((wv.engine === "elevenlabs" || needsR3) && wv.voiceId && elevenReady()) {
    try {
      const m = male ? (wv.maleVoiceId ? { id: wv.maleVoiceId, name: wv.maleVoiceName || "Rana" } : await defaultMaleVoice()) : null;
      // No male voice on R3 yet: Indian languages fall back to R1's male voice; global ones keep the default voice.
      if (male && !m && !needsR3) throw new Error("no male R3 voice");
      const el = await elevenSession({ instructions: s.instructions, greeting: s.greeting, lang: s.lang, voiceId: m?.id || wv.voiceId, agentVoiceId: wv.voiceId, model: wv.model });
      const id = await record();
      if (!id) throw new Error("could not record session");
      return Response.json({ engine: "elevenlabs", url: el.url, init: el.init, talkId: id, secret, maxSeconds: s.maxSeconds, voice: m?.name || wv.voiceName || "Rana" });
    } catch (e: any) {
      console.error("[web talk] R3 failed, using R1", e?.message || e);
      if (needsR3) return Response.json({ error: "Rana couldn't pick up in this language just now. Please try again, or pick English." }, { status: 502 });
    }
  }

  try {
    const signed = await signedSessionUrl(withVoice(cfg, s.voice), `rana-web-${kind}-${now}`);
    const id = await startWebTalk({ kind, scenario: kind === "usecase" ? `${ind!.slug}:${uc!.key}` : scenario, language: lang, market, ip, max_seconds: s.maxSeconds, secret,
      ...(kind === "usecase" ? { context: { industry: ind!.slug, useCase: uc!.key, title: uc!.title, company: profile?.company || null, url: profile?.url || null } } : {}) });
    if (!id) throw new Error("could not record session");
    const greeting = speakableGreeting(s.greeting, [], lang) || s.greeting;
    return Response.json({
      url: signed.url,
      start: {
        type: "client.action.interaction_start", origin: "client",
        agent_variables: { rana_instructions: s.instructions }, initial_bot_message: greeting, initial_language_name: LANG_NAME[s.lang as keyof typeof LANG_NAME],
        speech_hotwords: ["RANA", "RANA AI", "Rana"],
      },
      talkId: id, secret, maxSeconds: s.maxSeconds, voice: voiceFor(s.voice).name,
    });
  } catch (e: any) {
    console.error("[web talk]", e?.message || e);
    return Response.json({ error: friendly(e, "Rana couldn't pick up just now. Please try again in a minute.") }, { status: 502 });
  }
}

/** Hindi / Marathi first-person forms in the written opening lines are feminine; flip them for the male voice. */
function masculine(t: string): string {
  return t.replace(/रही हूँ/g, "रहा हूँ").replace(/सकती हूँ/g, "सकता हूँ").replace(/सकती/g, "सकता").replace(/बोलतेय/g, "बोलतोय");
}
