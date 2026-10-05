import type { TalkLang } from "./talkContent";

/** Every language a visitor can pick on the website. `indian` = runs on R1 too; global ones need R3 (natural voices). */
export const TALK_LANGS: { code: TalkLang; label: string; name: string; indian: boolean }[] = [
  { code: "en", label: "English", name: "English", indian: true },
  { code: "hi", label: "हिन्दी", name: "Hindi", indian: true },
  { code: "te", label: "తెలుగు", name: "Telugu", indian: true },
  { code: "ta", label: "தமிழ்", name: "Tamil", indian: true },
  { code: "kn", label: "ಕನ್ನಡ", name: "Kannada", indian: true },
  { code: "ml", label: "മലയാളം", name: "Malayalam", indian: true },
  { code: "mr", label: "मराठी", name: "Marathi", indian: true },
  { code: "bn", label: "বাংলা", name: "Bengali", indian: true },
  { code: "gu", label: "ગુજરાતી", name: "Gujarati", indian: true },
  { code: "pa", label: "ਪੰਜਾਬੀ", name: "Punjabi", indian: true },
  { code: "or", label: "ଓଡ଼ିଆ", name: "Odia", indian: true },
  { code: "ar", label: "العربية", name: "Arabic", indian: false },
  { code: "es", label: "Español", name: "Spanish", indian: false },
  { code: "fr", label: "Français", name: "French", indian: false },
  { code: "de", label: "Deutsch", name: "German", indian: false },
  { code: "ja", label: "日本語", name: "Japanese", indian: false },
];
export const isTalkLang = (x: any): x is TalkLang => TALK_LANGS.some((l) => l.code === x);
export const langLabel = (c: string) => TALK_LANGS.find((l) => l.code === c)?.label || "English";
export const langName = (c: string) => TALK_LANGS.find((l) => l.code === c)?.name || "English";
