// Rough language detection from Unicode script ranges — used to decide which
// language the agent should switch to based on what the caller just said.
const SCRIPT_RANGES: [string, number, number][] = [
  ["hi-IN", 0x0900, 0x097f], // Devanagari (Hindi / Marathi)
  ["bn-IN", 0x0980, 0x09ff], // Bengali
  ["pa-IN", 0x0a00, 0x0a7f], // Gurmukhi (Punjabi)
  ["gu-IN", 0x0a80, 0x0aff], // Gujarati
  ["ta-IN", 0x0b80, 0x0bff], // Tamil
  ["te-IN", 0x0c00, 0x0c7f], // Telugu
  ["kn-IN", 0x0c80, 0x0cff], // Kannada
  ["ml-IN", 0x0d00, 0x0d7f], // Malayalam
];

export function detectScriptLanguage(text: string): string | null {
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (!code) continue;
    for (const [lang, start, end] of SCRIPT_RANGES) {
      if (code >= start && code <= end) return lang;
    }
  }
  if (/[a-zA-Z]/.test(text)) return "en-IN";
  return null;
}

export type PronunciationOverride = { word: string; sayAs: string };

export function applyPronunciations(text: string, overrides: PronunciationOverride[]): string {
  let result = text;
  for (const { word, sayAs } of overrides) {
    if (!word.trim() || !sayAs.trim()) continue;
    const escaped = word.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`\\b${escaped}\\b`, "gi"), sayAs);
  }
  return result;
}
