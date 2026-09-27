// Remembers which social post brought a visitor (utm_* tags from social_utm links) for 30 days,
// so a demo request or sign-up can be attributed to it. Stored only in this browser (localStorage).
const KEY = "rana_utm";
const FIELDS = ["utm_source", "utm_medium", "utm_campaign", "utm_content"];
const MAX_AGE = 30 * 24 * 3600e3;

export function captureUtm() {
  try {
    const q = new URLSearchParams(window.location.search);
    const parts = FIELDS.filter((k) => q.get(k)).map((k) => `${k}=${String(q.get(k)).replace(/[^\w.-]/g, "").slice(0, 60)}`);
    if (parts.length) localStorage.setItem(KEY, JSON.stringify({ v: parts.join("&"), t: Date.now() }));
  } catch { /* storage blocked: skip attribution */ }
}

export function utmTag(): string {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!j || typeof j.v !== "string" || Date.now() - Number(j.t) > MAX_AGE) return "";
    return j.v;
  } catch { return ""; }
}
