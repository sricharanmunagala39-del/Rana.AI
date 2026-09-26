// Spell short capital-letter names (DBMCI, FMGE, PG) letter by letter in the caller's own script, so an Indian
// voice says "డి బి ఎం సి ఐ" instead of trying to read "DBMCI" as a word. Free and instant — no AI call.

const LETTERS: Record<string, string[]> = {
  te: ["ఏ", "బి", "సి", "డి", "ఈ", "ఎఫ్", "జి", "హెచ్", "ఐ", "జె", "కె", "ఎల్", "ఎం", "ఎన్", "ఓ", "పి", "క్యూ", "ఆర్", "ఎస్", "టి", "యు", "వి", "డబ్ల్యూ", "ఎక్స్", "వై", "జెడ్"],
  hi: ["ए", "बी", "सी", "डी", "ई", "एफ", "जी", "एच", "आई", "जे", "के", "एल", "एम", "एन", "ओ", "पी", "क्यू", "आर", "एस", "टी", "यू", "वी", "डब्ल्यू", "एक्स", "वाई", "ज़ेड"],
  mr: ["ए", "बी", "सी", "डी", "ई", "एफ", "जी", "एच", "आय", "जे", "के", "एल", "एम", "एन", "ओ", "पी", "क्यू", "आर", "एस", "टी", "यू", "व्ही", "डब्ल्यू", "एक्स", "वाय", "झेड"],
  ta: ["ஏ", "பி", "சி", "டி", "ஈ", "எஃப்", "ஜி", "ஹெச்", "ஐ", "ஜே", "கே", "எல்", "எம்", "என்", "ஓ", "பி", "க்யூ", "ஆர்", "எஸ்", "டி", "யூ", "வி", "டபிள்யூ", "எக்ஸ்", "ஒய்", "இசட்"],
  kn: ["ಎ", "ಬಿ", "ಸಿ", "ಡಿ", "ಇ", "ಎಫ್", "ಜಿ", "ಎಚ್", "ಐ", "ಜೆ", "ಕೆ", "ಎಲ್", "ಎಂ", "ಎನ್", "ಒ", "ಪಿ", "ಕ್ಯೂ", "ಆರ್", "ಎಸ್", "ಟಿ", "ಯು", "ವಿ", "ಡಬ್ಲ್ಯೂ", "ಎಕ್ಸ್", "ವೈ", "ಝೆಡ್"],
  ml: ["എ", "ബി", "സി", "ഡി", "ഇ", "എഫ്", "ജി", "എച്ച്", "ഐ", "ജെ", "കെ", "എൽ", "എം", "എൻ", "ഒ", "പി", "ക്യു", "ആർ", "എസ്", "ടി", "യു", "വി", "ഡബ്ല്യു", "എക്സ്", "വൈ", "സെഡ്"],
  bn: ["এ", "বি", "সি", "ডি", "ই", "এফ", "জি", "এইচ", "আই", "জে", "কে", "এল", "এম", "এন", "ও", "পি", "কিউ", "আর", "এস", "টি", "ইউ", "ভি", "ডব্লিউ", "এক্স", "ওয়াই", "জেড"],
  gu: ["એ", "બી", "સી", "ડી", "ઈ", "એફ", "જી", "એચ", "આઈ", "જે", "કે", "એલ", "એમ", "એન", "ઓ", "પી", "ક્યૂ", "આર", "એસ", "ટી", "યુ", "વી", "ડબલ્યુ", "એક્સ", "વાય", "ઝેડ"],
};

/** True for things people say letter by letter: DBMCI, PG, FMGE, IIT — not NEET or AIIMS-like words. */
export function looksLikeAcronym(word: string): boolean {
  const w = String(word || "").replace(/\./g, "").trim();
  if (!/^[A-Z]{2,7}$/.test(w)) return false;
  if (w.length <= 3) return true;
  const vowels = (w.match(/[AEIOU]/g) || []).length;
  return vowels === 0 || /[^AEIOU]{3,}/.test(w) || vowels / w.length < 0.25;
}

/** Spell every acronym in `text` in `lang` script (e.g. "DBMCI Hyderabad" → "డి బి ఎం సి ఐ Hyderabad"). Null if nothing to spell. */
export function spellAcronyms(text: string, lang: string): string | null {
  const code = String(lang || "en").split("-")[0];
  let changed = false;
  const out = String(text || "").replace(/\b[A-Z](?:\.?[A-Z]){1,6}\.?\b/g, (m) => {
    if (!looksLikeAcronym(m)) return m;
    changed = true;
    const letters = m.replace(/\./g, "").split("");
    const table = LETTERS[code];
    return table ? letters.map((c) => table[c.charCodeAt(0) - 65]).join(" ") : letters.join(" ");
  });
  return changed ? out : null;
}

/** The greeting is spoken word-for-word by the voice: apply the client's own "say it as" fixes, then spell any
 *  remaining capital-letter names in the greeting's language. */
export function speakableGreeting(greeting: string, pronunciations: { word: string; sayAs: string }[], lang: string): string {
  let out = String(greeting || "");
  for (const p of pronunciations || []) {
    if (!p?.word || !p?.sayAs) continue;
    out = out.split(p.word).join(p.sayAs);
  }
  const code = String(lang || "en").split("-")[0];
  if (code === "en") return out;
  return spellAcronyms(out, code) ?? out;
}

/** Extra pronunciation lines for acronyms the client didn't list, in every non-English language the agent may speak. */
export function autoAcronymRules(texts: string[], langs: string[], known: string[], names: Record<string, string> = {}): { word: string; sayAs: string }[] {
  const found = new Set<string>();
  for (const t of texts) for (const m of String(t || "").match(/\b[A-Z]{2,7}\b/g) || []) if (looksLikeAcronym(m) && !known.includes(m)) found.add(m);
  const out: { word: string; sayAs: string }[] = [];
  for (const w of Array.from(found).slice(0, 20)) {
    const forms = langs.filter((l) => l !== "en").map((l) => [l, spellAcronyms(w, l)] as const).filter(([, f]) => !!f);
    if (forms.length) out.push({ word: w, sayAs: forms.length === 1 ? String(forms[0][1]) : forms.map(([l, f]) => `${f} (in ${names[l] || l})`).join(", ") });
  }
  return out;
}
