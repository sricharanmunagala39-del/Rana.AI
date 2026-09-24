// Voice previews: every voice says the same short sales line in the chosen language, so a client can
// hear the real difference between voices (tone, warmth, pace) instead of comparing different clips.
// Audio comes from Cartesia TTS (POST /tts/bytes) and is cached in memory per voice + language + text.

const CARTESIA_BASE = "https://api.cartesia.ai";
const CARTESIA_VERSION = "2026-08-14";
const MODEL = "sonic-3.6";

type Gender = "feminine" | "masculine" | string | null | undefined;

/** One line per language, in native script. {name} is the voice's own name. */
const LINES: Record<string, string | { f: string; m: string }> = {
  en: "Hi, this is {name} from RANA. I'm calling about the new batch you asked about. Do you have two minutes to talk?",
  te: "నమస్కారం! నేను RANA నుంచి {name} మాట్లాడుతున్నాను. మీరు అడిగిన కొత్త బ్యాచ్ గురించి రెండు నిమిషాలు మాట్లాడవచ్చా?",
  hi: {
    f: "नमस्ते! मैं RANA से {name} बोल रही हूँ। आपने जिस नए बैच के बारे में पूछा था, क्या हम दो मिनट बात कर सकते हैं?",
    m: "नमस्ते! मैं RANA से {name} बोल रहा हूँ। आपने जिस नए बैच के बारे में पूछा था, क्या हम दो मिनट बात कर सकते हैं?",
  },
  ta: "வணக்கம்! நான் RANA-விலிருந்து {name} பேசுகிறேன். நீங்கள் கேட்ட புதிய பேட்ச் பற்றி இரண்டு நிமிடம் பேசலாமா?",
  kn: "ನಮಸ್ಕಾರ! ನಾನು RANA ಇಂದ {name} ಮಾತಾಡ್ತಾ ಇದ್ದೀನಿ. ನೀವು ಕೇಳಿದ ಹೊಸ ಬ್ಯಾಚ್ ಬಗ್ಗೆ ಎರಡು ನಿಮಿಷ ಮಾತಾಡಬಹುದಾ?",
  ml: "നമസ്കാരം! ഞാൻ RANA-യിൽ നിന്ന് {name} ആണ് സംസാരിക്കുന്നത്. നിങ്ങൾ ചോദിച്ച പുതിയ ബാച്ചിനെ കുറിച്ച് രണ്ട് മിനിറ്റ് സംസാരിക്കാമോ?",
  mr: "नमस्कार! मी RANA कडून {name} बोलत आहे. तुम्ही विचारलेल्या नवीन बॅचबद्दल दोन मिनिटं बोलू शकतो का?",
  bn: "নমস্কার! আমি RANA থেকে {name} বলছি। আপনি যে নতুন ব্যাচের কথা জিজ্ঞেস করেছিলেন, সেটা নিয়ে দুই মিনিট কথা বলা যাবে?",
  gu: "નમસ્તે! હું RANA તરફથી {name} બોલું છું. તમે પૂછેલી નવી બેચ વિશે બે મિનિટ વાત કરી શકીએ?",
  pa: {
    f: "ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਮੈਂ RANA ਤੋਂ {name} ਬੋਲ ਰਹੀ ਹਾਂ। ਤੁਸੀਂ ਜਿਸ ਨਵੇਂ ਬੈਚ ਬਾਰੇ ਪੁੱਛਿਆ ਸੀ, ਕੀ ਅਸੀਂ ਦੋ ਮਿੰਟ ਗੱਲ ਕਰ ਸਕਦੇ ਹਾਂ?",
    m: "ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਮੈਂ RANA ਤੋਂ {name} ਬੋਲ ਰਿਹਾ ਹਾਂ। ਤੁਸੀਂ ਜਿਸ ਨਵੇਂ ਬੈਚ ਬਾਰੇ ਪੁੱਛਿਆ ਸੀ, ਕੀ ਅਸੀਂ ਦੋ ਮਿੰਟ ਗੱਲ ਕਰ ਸਕਦੇ ਹਾਂ?",
  },
  ur: {
    f: "السلام علیکم! میں RANA سے {name} بول رہی ہوں۔ کیا ہم دو منٹ بات کر سکتے ہیں؟",
    m: "السلام علیکم! میں RANA سے {name} بول رہا ہوں۔ کیا ہم دو منٹ بات کر سکتے ہیں؟",
  },
  ar: "مرحباً! معك {name} من RANA. هل لديك دقيقتان للحديث عن الدورة الجديدة التي سألت عنها؟",
  es: "¡Hola! Soy {name}, de RANA. Te llamo por el nuevo curso que consultaste. ¿Tienes dos minutos?",
  fr: "Bonjour ! Ici {name}, de RANA. Je vous appelle au sujet de la nouvelle formation qui vous intéressait. Vous avez deux minutes ?",
  de: "Hallo! Hier ist {name} von RANA. Ich rufe wegen des neuen Kurses an, nach dem Sie gefragt haben. Haben Sie zwei Minuten?",
  pt: "Olá! Aqui é {name}, da RANA. Estou ligando sobre a nova turma que você perguntou. Tem dois minutos?",
};

export function previewLanguage(raw: string | null | undefined): string {
  const code = String(raw || "").toLowerCase().split(/[-_]/)[0];
  return /^[a-z]{2}$/.test(code) ? code : "en";
}

export function sampleLine(lang: string, name: string, gender: Gender): string {
  const entry = LINES[lang] ?? LINES.en;
  const text = typeof entry === "string" ? entry : gender === "masculine" ? entry.m : entry.f;
  const clean = String(name || "").replace(/[^\p{L}\p{N} .'-]/gu, "").slice(0, 30).trim() || "Riya";
  return text.replace("{name}", clean);
}

const cache = new Map<string, ArrayBuffer>();
const MAX_CACHE = 150;

export async function synthesizePreview(opts: { voiceId: string; text: string; language: string; speed?: number }): Promise<ArrayBuffer> {
  const key = `${opts.voiceId}|${opts.language}|${opts.speed ?? 1}|${opts.text}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) throw new Error("CARTESIA_API_KEY is not set");

  const body: any = {
    model_id: MODEL,
    transcript: opts.text,
    voice: opts.voiceId,
    output_format: { container: "mp3", sample_rate: 44100, bit_rate: 128000 },
    language: opts.language,
  };
  if (opts.speed && opts.speed !== 1) body.generation_config = { speed: Math.min(1.5, Math.max(0.6, opts.speed)) };

  let res = await fetch(`${CARTESIA_BASE}/tts/bytes`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Cartesia-Version": CARTESIA_VERSION, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  // Some voices/models reject a language they weren't built for — retry letting Cartesia pick.
  if (res.status === 400 && body.language) {
    delete body.language;
    res = await fetch(`${CARTESIA_BASE}/tts/bytes`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Cartesia-Version": CARTESIA_VERSION, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  if (!res.ok) throw new Error(`Cartesia TTS ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const audio = await res.arrayBuffer();
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
  cache.set(key, audio);
  return audio;
}
