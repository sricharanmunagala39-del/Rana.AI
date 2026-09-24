// Shared money formatting (client + server safe).
export const inr = (n: number | null | undefined, paise = false) =>
  n === null || n === undefined ? "Custom" : `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: paise ? 2 : 0, maximumFractionDigits: paise ? 2 : 0 })}`;

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
function two(n: number) { return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? " " + ONES[n % 10] : ""}`; }
function three(n: number) { const h = Math.floor(n / 100), r = n % 100; return [h ? `${ONES[h]} Hundred` : "", r ? two(r) : ""].filter(Boolean).join(" "); }

/** 35398.82 → "Rupees Thirty Five Thousand Three Hundred Ninety Eight and Eighty Two Paise Only" (Indian grouping). */
export function rupeesInWords(amount: number): string {
  const total = Math.round(Math.abs(amount) * 100);
  let r = Math.floor(total / 100); const p = total % 100;
  if (r === 0 && p === 0) return "Rupees Zero Only";
  const parts: string[] = [];
  const crore = Math.floor(r / 1e7); r %= 1e7;
  const lakh = Math.floor(r / 1e5); r %= 1e5;
  const thousand = Math.floor(r / 1e3); r %= 1e3;
  if (crore) parts.push(`${crore >= 100 ? three(crore) : two(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (r) parts.push(three(r));
  return `Rupees ${parts.join(" ") || "Zero"}${p ? ` and ${two(p)} Paise` : ""} Only`;
}
