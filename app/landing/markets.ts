// The countries/regions the website is shown for. Each market has its own URL (for Google), currency and copy.
// India is the home market at "/"; the others are English-first pages at /global, /us, /ae, /eu and /jp.
import type { Currency } from "@/lib/pricing";

export type MarketKey = "in" | "global" | "us" | "ae" | "eu" | "jp";

export type Market = {
  key: MarketKey;
  path: string;
  /** Shown in the country switcher. */
  name: string;
  short: string;
  currency: Currency;
  /** Working days used by the missed-call calculator. */
  workDays: number;
  /** Where to set the phone number expectations. */
  numbers: string;
  taxNote: string;
  /** Timezones that suggest a visitor belongs to this market (for the "see prices in …" hint). */
  zones: RegExp | null;
};

export const MARKETS: Record<MarketKey, Market> = {
  in: {
    key: "in", path: "/", name: "India", short: "IN", currency: "INR", workDays: 26,
    numbers: "Indian numbers", taxNote: "Prices exclude GST, which is added where applicable.",
    zones: /^Asia\/(Kolkata|Calcutta)$/,
  },
  global: {
    key: "global", path: "/global", name: "Global", short: "GLOBAL", currency: "USD", workDays: 22,
    numbers: "local numbers", taxNote: "Prices in US dollars and exclude local taxes where applicable.",
    zones: null,
  },
  us: {
    key: "us", path: "/us", name: "United States", short: "US", currency: "USD", workDays: 22,
    numbers: "US numbers", taxNote: "Prices in US dollars and exclude sales tax where applicable.",
    zones: /^America\//,
  },
  ae: {
    key: "ae", path: "/ae", name: "UAE & Gulf", short: "AE", currency: "USD", workDays: 24,
    numbers: "local numbers", taxNote: "Prices in US dollars and exclude VAT where applicable.",
    zones: /^Asia\/(Dubai|Muscat|Riyadh|Qatar|Bahrain|Kuwait)$/,
  },
  eu: {
    key: "eu", path: "/eu", name: "Europe", short: "EU", currency: "EUR", workDays: 21,
    numbers: "local numbers", taxNote: "Prices in euros and exclude VAT where applicable.",
    zones: /^Europe\//,
  },
  jp: {
    key: "jp", path: "/jp", name: "Japan", short: "JP", currency: "JPY", workDays: 21,
    numbers: "local numbers", taxNote: "Prices in Japanese yen and exclude consumption tax where applicable.",
    zones: /^Asia\/Tokyo$/,
  },
};
export const MARKET_KEYS = Object.keys(MARKETS) as MarketKey[];
export const isMarket = (x: any): x is MarketKey => typeof x === "string" && x in MARKETS;

/** Market a visitor's timezone points to (null = can't tell). */
export function marketForZone(tz: string): MarketKey | null {
  for (const k of MARKET_KEYS) { const z = MARKETS[k].zones; if (z && z.test(tz)) return k; }
  return tz ? "global" : null;
}

/** hreflang map — identical on every market page, so Google shows each country its own page. */
export const HREFLANG: Record<string, string> = {
  "en-IN": "/",
  "en-US": "/us",
  "en-AE": "/ae", "en-SA": "/ae", "en-QA": "/ae", "en-KW": "/ae", "en-OM": "/ae", "en-BH": "/ae",
  "en-DE": "/eu", "en-FR": "/eu", "en-ES": "/eu", "en-IT": "/eu", "en-NL": "/eu", "en-IE": "/eu", "en-BE": "/eu", "en-PT": "/eu", "en-AT": "/eu",
  "en-JP": "/jp",
  "x-default": "/global",
};

/** Cookie that remembers the visitor's chosen market (read by sign-up so Billing shows the right currency). */
export const MARKET_COOKIE = "rana_market";
