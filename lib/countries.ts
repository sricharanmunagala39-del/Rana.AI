// Countries for the sign-up form: ISO code, name, phone dialling code, and which RANA market (pricing and
// calling rules) the workspace starts in. India first, then the Gulf, then the rest A–Z. Safe in the browser.

export type Country = { code: string; name: string; dial: string; market: "in" | "us" | "ae" | "eu" | "jp" | "global" };

const C = (code: string, name: string, dial: string, market: Country["market"] = "global"): Country => ({ code, name, dial, market });

export const COUNTRIES: Country[] = [
  C("IN", "India", "91", "in"),
  C("AE", "United Arab Emirates", "971", "ae"),
  C("SA", "Saudi Arabia", "966", "ae"),
  C("QA", "Qatar", "974", "ae"),
  C("KW", "Kuwait", "965", "ae"),
  C("BH", "Bahrain", "973", "ae"),
  C("OM", "Oman", "968", "ae"),
  C("US", "United States", "1", "us"),
  C("GB", "United Kingdom", "44", "eu"),
  ...[
    C("AU", "Australia", "61"), C("AT", "Austria", "43", "eu"), C("BD", "Bangladesh", "880"), C("BE", "Belgium", "32", "eu"),
    C("BR", "Brazil", "55"), C("CA", "Canada", "1", "us"), C("CN", "China", "86"), C("CY", "Cyprus", "357", "eu"),
    C("CZ", "Czechia", "420", "eu"), C("DK", "Denmark", "45", "eu"), C("EG", "Egypt", "20"), C("FI", "Finland", "358", "eu"),
    C("FR", "France", "33", "eu"), C("DE", "Germany", "49", "eu"), C("GR", "Greece", "30", "eu"), C("HK", "Hong Kong", "852"),
    C("ID", "Indonesia", "62"), C("IE", "Ireland", "353", "eu"), C("IL", "Israel", "972"), C("IT", "Italy", "39", "eu"),
    C("JP", "Japan", "81", "jp"), C("JO", "Jordan", "962"), C("KE", "Kenya", "254"), C("LB", "Lebanon", "961"),
    C("MY", "Malaysia", "60"), C("MV", "Maldives", "960"), C("MU", "Mauritius", "230"), C("MX", "Mexico", "52"),
    C("NP", "Nepal", "977"), C("NL", "Netherlands", "31", "eu"), C("NZ", "New Zealand", "64"), C("NG", "Nigeria", "234"),
    C("NO", "Norway", "47", "eu"), C("PK", "Pakistan", "92"), C("PH", "Philippines", "63"), C("PL", "Poland", "48", "eu"),
    C("PT", "Portugal", "351", "eu"), C("RO", "Romania", "40", "eu"), C("SG", "Singapore", "65"), C("ZA", "South Africa", "27"),
    C("KR", "South Korea", "82"), C("ES", "Spain", "34", "eu"), C("LK", "Sri Lanka", "94"), C("SE", "Sweden", "46", "eu"),
    C("CH", "Switzerland", "41", "eu"), C("TW", "Taiwan", "886"), C("TZ", "Tanzania", "255"), C("TH", "Thailand", "66"),
    C("TR", "Türkiye", "90"), C("UG", "Uganda", "256"), C("VN", "Vietnam", "84"),
  ].sort((a, b) => a.name.localeCompare(b.name)),
];

export const countryOf = (code?: string | null): Country | undefined => COUNTRIES.find((c) => c.code === String(code || "").toUpperCase());

/** Flag emoji from an ISO code (e.g. IN → 🇮🇳). */
export const flagOf = (code: string) => String.fromCodePoint(...[...code.toUpperCase()].map((ch) => 0x1f1a5 + ch.charCodeAt(0)));

/** Best first guess at the visitor's country: the website market they came from, then their browser time zone. */
export function guessCountry(market?: string | null, timeZone?: string | null): string {
  const tz = String(timeZone || "");
  const byZone: Record<string, string> = {
    "Asia/Kolkata": "IN", "Asia/Calcutta": "IN", "Asia/Dubai": "AE", "Asia/Riyadh": "SA", "Asia/Qatar": "QA", "Asia/Kuwait": "KW",
    "Asia/Bahrain": "BH", "Asia/Muscat": "OM", "Europe/London": "GB", "Asia/Tokyo": "JP", "Asia/Singapore": "SG", "Australia/Sydney": "AU",
    "Australia/Melbourne": "AU", "Asia/Kathmandu": "NP", "Asia/Colombo": "LK", "Asia/Dhaka": "BD", "Asia/Karachi": "PK", "Europe/Berlin": "DE",
    "Europe/Paris": "FR", "Europe/Madrid": "ES", "Europe/Rome": "IT", "Europe/Amsterdam": "NL", "Europe/Dublin": "IE", "America/Toronto": "CA",
  };
  if (byZone[tz]) return byZone[tz];
  if (tz.startsWith("America/")) return "US";
  const byMarket: Record<string, string> = { in: "IN", ae: "AE", us: "US", eu: "GB", jp: "JP", global: "US" };
  return byMarket[String(market || "in")] || "IN";
}
