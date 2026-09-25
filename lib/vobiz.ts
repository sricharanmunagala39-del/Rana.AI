// Vobiz (Indian telephony) — number inventory and purchase for the "Get a number" screen.
// Switches on when VOBIZ_AUTH_ID + VOBIZ_AUTH_TOKEN are set in Vercel (RANA's Vobiz partner account).
// Docs: https://vobiz.ai/docs/account-phone-number — base https://api.vobiz.ai/api, headers X-Auth-ID / X-Auth-Token.
// Field names are read defensively (number/phone_number, monthly_rental/monthly_rent, …) until verified against the live API.

const BASE = () => (process.env.VOBIZ_API_BASE || "https://api.vobiz.ai/api").replace(/\/$/, "");
export const vobizConfigured = () => !!(process.env.VOBIZ_AUTH_ID && process.env.VOBIZ_AUTH_TOKEN);

async function call<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE()}${path}`, {
    ...init,
    cache: "no-store",
    headers: { "X-Auth-ID": process.env.VOBIZ_AUTH_ID || "", "X-Auth-Token": process.env.VOBIZ_AUTH_TOKEN || "", "Content-Type": "application/json", ...(init.headers || {}) },
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 300) }; }
  if (!res.ok) throw new Error(`Vobiz ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  return body as T;
}

export type InventoryNumber = { number: string; city: string | null; type: string | null; series: string | null; monthly: number | null; setup: number | null };

const num = (v: any) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

function toInventory(x: any): InventoryNumber | null {
  const n = String(x?.number ?? x?.phone_number ?? x?.did ?? x?.e164 ?? "").replace(/[^\d+]/g, "");
  if (!n) return null;
  return {
    number: n.startsWith("+") ? n : n.length === 10 ? `+91${n}` : `+${n}`,
    city: x?.city ?? x?.region ?? x?.location ?? null,
    type: x?.type ?? x?.number_type ?? null,
    series: x?.series ?? null,
    monthly: num(x?.monthly_rental ?? x?.monthly_rent ?? x?.monthly_rental_rate ?? x?.rental ?? x?.price),
    setup: num(x?.setup_fee ?? x?.setup_rate ?? x?.one_time_fee),
  };
}

/** Numbers Vobiz can sell right now, optionally in one city. Regular city numbers only (not 140/160 series). */
export async function listInventory(o: { city?: string; page?: number; perPage?: number } = {}): Promise<InventoryNumber[]> {
  const q = new URLSearchParams();
  if (o.city) q.set("city", o.city);
  q.set("page", String(o.page || 1));
  q.set("per_page", String(o.perPage || 100));
  const d = await call<any>(`/account-phone-number/inventory?${q}`);
  const rows: any[] = Array.isArray(d) ? d : d?.objects ?? d?.data ?? d?.numbers ?? d?.results ?? d?.items ?? [];
  return rows.map(toInventory).filter((x): x is InventoryNumber => !!x).filter((x) => !x.series || !/^(140|160)/.test(String(x.series)));
}

/** Buy one number from inventory into RANA's Vobiz account. */
export async function purchaseNumber(number: string): Promise<any> {
  const bare = number.replace(/^\+/, "");
  return call(`/account-phone-number/purchase`, { method: "POST", body: JSON.stringify({ number: bare, phone_number: bare }) });
}

/** Give a number back to Vobiz. */
export async function releaseNumber(number: string): Promise<any> {
  return call(`/account-phone-number/${encodeURIComponent(number.replace(/^\+/, ""))}`, { method: "DELETE" });
}
