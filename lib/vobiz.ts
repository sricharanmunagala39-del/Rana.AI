// Vobiz (Indian telephony) — number inventory and purchase for the "Get a number" screen.
// Switches on when VOBIZ_AUTH_ID + VOBIZ_AUTH_TOKEN are set in Vercel (RANA's Vobiz account).
// API checked against vobiz.ai/docs/account-phone-number (1 Oct 2026): base https://api.vobiz.ai/api/v1,
// paths under /Account/{auth_id}/, headers X-Auth-ID / X-Auth-Token.
//   GET    /Account/{id}/inventory/numbers?country=IN&search=&exclude=&page=&per_page=(max 100)
//   POST   /Account/{id}/numbers/purchase-from-inventory  { e164 }   — debits setup_fee + monthly_fee from RANA's wallet
//   DELETE /Account/{id}/numbers/{e164 with %2B}                     — release (account-specific release fee)

const BASE = () => (process.env.VOBIZ_API_BASE || "https://api.vobiz.ai/api/v1").replace(/\/$/, "");
const AID = () => encodeURIComponent(process.env.VOBIZ_AUTH_ID || "");
export const vobizConfigured = () => !!(process.env.VOBIZ_AUTH_ID && process.env.VOBIZ_AUTH_TOKEN);

async function call<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE() + "/Account/" + AID() + path, {
    ...init,
    cache: "no-store",
    headers: { "X-Auth-ID": process.env.VOBIZ_AUTH_ID || "", "X-Auth-Token": process.env.VOBIZ_AUTH_TOKEN || "", "Content-Type": "application/json", ...(init.headers || {}) },
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 300) }; }
  if (!res.ok) throw new Error("Vobiz " + res.status + ": " + JSON.stringify(body).slice(0, 300));
  return body as T;
}

export type InventoryNumber = { number: string; city: string | null; type: string | null; series: string | null; monthly: number | null; setup: number | null };

const num = (v: any) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const e164 = (n: string) => { const d = String(n || "").replace(/[^\d]/g, ""); return d.length === 10 ? "+91" + d : "+" + d; };

function toInventory(x: any): InventoryNumber | null {
  const raw = String(x?.e164 ?? x?.number ?? x?.phone_number ?? "");
  if (!raw.replace(/\D/g, "")) return null;
  if (x?.is_blocked === true || x?.voice_enabled === false || x?.is_trial_number === true) return null;
  return {
    number: e164(raw),
    city: x?.region ?? null, // Vobiz gives the state here; the screen prefers the city from the STD code
    type: x?.type ?? null,
    series: null,
    monthly: num(x?.monthly_fee ?? x?.monthly_rental),
    setup: num(x?.setup_fee),
  };
}

/** Indian numbers Vobiz can sell right now. stdCode ("040", "0891") narrows to one city. 140/1600 series are left out. */
export async function listInventory(o: { stdCode?: string; page?: number; perPage?: number } = {}): Promise<InventoryNumber[]> {
  const prefix = o.stdCode ? "91" + o.stdCode.replace(/^0/, "") : "";
  const q = new URLSearchParams({ country: "IN", exclude: "91140,911600", page: String(o.page || 1), per_page: String(Math.min(100, o.perPage || 100)) });
  if (prefix) q.set("search", prefix);
  const d = await call<any>("/inventory/numbers?" + q.toString());
  const rows: any[] = Array.isArray(d) ? d : d?.items ?? d?.objects ?? d?.data ?? [];
  return rows.map(toInventory).filter((x): x is InventoryNumber => !!x).filter((x) => !prefix || x.number.startsWith("+" + prefix));
}

/** Buy one number from inventory into RANA's Vobiz account (debits RANA's Vobiz wallet). */
export async function purchaseNumber(number: string): Promise<any> {
  return call("/numbers/purchase-from-inventory", { method: "POST", body: JSON.stringify({ e164: e164(number), currency: "INR" }) });
}

/** Give a number back to Vobiz (standard 24-hour cancellable release). */
export async function releaseNumber(number: string): Promise<any> {
  return call("/numbers/" + encodeURIComponent(e164(number)), { method: "DELETE" });
}
