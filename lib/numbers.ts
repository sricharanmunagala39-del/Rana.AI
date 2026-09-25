// Own business numbers for clients: browse (Vobiz inventory) or request, pay through a RANA invoice, go live.
// Regular city numbers only (040 Hyderabad, 080 Bengaluru, …). These are fine for inbound calls and for calling people
// who enquired or are customers; cold promotional campaigns need a 140-series number (separate request to HQ).
import { sb } from "./db";
import { vobizConfigured, listInventory, purchaseNumber, releaseNumber, type InventoryNumber } from "./vobiz";

export const CITIES: { key: string; name: string; code: string }[] = [
  { key: "hyderabad", name: "Hyderabad", code: "040" },
  { key: "bengaluru", name: "Bengaluru", code: "080" },
  { key: "chennai", name: "Chennai", code: "044" },
  { key: "mumbai", name: "Mumbai", code: "022" },
  { key: "delhi", name: "Delhi NCR", code: "011" },
  { key: "pune", name: "Pune", code: "020" },
  { key: "kolkata", name: "Kolkata", code: "033" },
  { key: "ahmedabad", name: "Ahmedabad", code: "079" },
  { key: "visakhapatnam", name: "Visakhapatnam", code: "0891" },
  { key: "vijayawada", name: "Vijayawada", code: "0866" },
];

const envNum = (k: string, d: number) => (Number.isFinite(Number(process.env[k])) && Number(process.env[k]) > 0 ? Number(process.env[k]) : d);
/** RANA's prices (₹, before GST). Monthly rent never goes below the base; fancy numbers carry a one-time fee. */
export const PRICING = {
  monthlyBase: () => envNum("RANA_NUMBER_MONTHLY", 999),
  markup: () => envNum("RANA_NUMBER_MARKUP", 1.6),
  goldFee: () => envNum("RANA_NUMBER_GOLD_FEE", 4999),
  platinumFee: () => envNum("RANA_NUMBER_PLATINUM_FEE", 14999),
};

export type Tier = "standard" | "gold" | "platinum";

/** Spots "fancy" numbers from the subscriber digits: 7777, 12345, 123321, …000, 786 and friends. */
export function fancyOf(number: string): { tier: Tier; pattern: string | null } {
  const d = String(number || "").replace(/\D/g, "");
  const tail = d.slice(-7); // subscriber part of a city number
  const last4 = d.slice(-4), last6 = d.slice(-6);
  const run = (s: string) => { let best = 1, cur = 1; for (let i = 1; i < s.length; i++) { cur = s[i] === s[i - 1] ? cur + 1 : 1; best = Math.max(best, cur); } return best; };
  const seq = (s: string, n: number) => { for (let i = 0; i + n <= s.length; i++) { const c = s.slice(i, i + n); const up = [...c].every((ch, j) => j === 0 || +ch === +c[j - 1] + 1); const dn = [...c].every((ch, j) => j === 0 || +ch === +c[j - 1] - 1); if (up || dn) return c; } return null; };
  const mirror = (s: string) => s === [...s].reverse().join("");
  if (/(\d)\1{3}$/.test(d)) return { tier: "platinum", pattern: `Ends in ${last4}` };
  if (run(tail) >= 5) return { tier: "platinum", pattern: "Five of the same digit" };
  if (/0000$/.test(d)) return { tier: "platinum", pattern: "Ends in 0000" };
  for (let n = tail.length; n >= 5; n--) { const s = seq(tail, n); if (s) return { tier: "platinum", pattern: `Sequence ${s}` }; }
  if (mirror(last6)) return { tier: "platinum", pattern: `Mirror ${last6}` };
  if (/^(\d\d)\1\1$/.test(last6)) return { tier: "platinum", pattern: `Repeat ${last6}` };
  if (/(\d)\1{2}$/.test(d)) return { tier: "gold", pattern: `Ends in ${d.slice(-3)}` };
  if (/000$/.test(d)) return { tier: "gold", pattern: "Ends in 000" };
  if (/786$/.test(d)) return { tier: "gold", pattern: "Ends in 786" };
  const s4 = seq(last4, 4); if (s4) return { tier: "gold", pattern: `Ends in ${s4}` };
  if (/^(\d)\1(\d)\2$/.test(last4) || /^(\d\d)\1$/.test(last4)) return { tier: "gold", pattern: `Easy ending ${last4}` };
  if (mirror(last4)) return { tier: "gold", pattern: `Mirror ${last4}` };
  if (run(tail) >= 4) return { tier: "gold", pattern: "Four of the same digit" };
  return { tier: "standard", pattern: null };
}

const roundPrice = (x: number) => Math.max(99, Math.ceil(x / 100) * 100 - 1); // ₹1,299-style prices

export function priceFor(n: { number: string; monthly?: number | null }) {
  const f = fancyOf(n.number);
  const monthly = Math.max(PRICING.monthlyBase(), n.monthly ? roundPrice(n.monthly * PRICING.markup()) : 0);
  const fancyFee = f.tier === "platinum" ? PRICING.platinumFee() : f.tier === "gold" ? PRICING.goldFee() : 0;
  return { tier: f.tier, pattern: f.pattern, monthly, fancyFee };
}

/** "+914012345678" → "+91 40 1234 5678" (city code kept together). */
export function prettyNumber(n: string): string {
  const d = String(n || "").replace(/\D/g, "");
  const local = d.startsWith("91") && d.length === 12 ? d.slice(2) : d;
  if (local.length !== 10) return n;
  const two = ["11", "20", "22", "33", "40", "44", "79", "80"].find((c) => local.startsWith(c));
  if (two) return `+91 ${two} ${local.slice(2, 6)} ${local.slice(6)}`;
  return `+91 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
}

export function cityOfNumber(n: string): string | null {
  const d = String(n || "").replace(/\D/g, "");
  const local = d.startsWith("91") && d.length === 12 ? d.slice(2) : d;
  const c = CITIES.slice().sort((a, b) => b.code.length - a.code.length).find((c) => local.startsWith(c.code.slice(1)));
  return c?.name ?? null;
}

/** Catalog for the Get-a-number screen. Taken/being-bought numbers are hidden. */
export async function catalog(o: { city?: string; fancyOnly?: boolean } = {}) {
  if (!vobizConfigured()) return { live: false, numbers: [] as any[] };
  const city = CITIES.find((c) => c.key === o.city);
  const inv: InventoryNumber[] = await listInventory({ city: city?.name, perPage: 200 });
  const held = new Set(((await sb<any[]>(`/phone_numbers?status=in.(awaiting_payment,provisioning,active,lapsed)&select=number`).catch(() => [])) || []).map((r) => r.number));
  const out = inv.filter((x) => !held.has(x.number)).map((x) => ({ number: x.number, pretty: prettyNumber(x.number), city: x.city || cityOfNumber(x.number), ...priceFor(x), vendorMonthly: x.monthly, vendorSetup: x.setup }));
  const rank = { platinum: 0, gold: 1, standard: 2 } as const;
  return { live: true, numbers: out.filter((x) => !o.fancyOnly || x.tier !== "standard").sort((a, b) => rank[a.tier] - rank[b.tier]).slice(0, 120) };
}

export async function listClientNumbers(clientId: string) {
  return (await sb<any[]>(`/phone_numbers?client_id=eq.${clientId}&status=neq.expired&order=created_at.desc`).catch(() => [])) || [];
}

export async function getNumber(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return (await sb<any[]>(`/phone_numbers?id=eq.${id}&limit=1`))?.[0] ?? null;
}

export async function patchNumber(id: string, patch: Record<string, any>) {
  const [r] = await sb<any[]>(`/phone_numbers?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) });
  return r;
}

/** Invoice for a number: first month + one-time fancy fee (or a renewal month). */
export async function invoiceForNumber(client: any, row: any, o: { renewal?: boolean; origin?: string; notify?: boolean } = {}) {
  const { createInvoice } = await import("./billing");
  const items: any[] = [{ description: `Business phone number ${prettyNumber(row.number)} — ${o.renewal ? "monthly rent" : "first month"}`, qty: 1, rate: Number(row.monthly_price), amount: Number(row.monthly_price) }];
  if (!o.renewal && Number(row.fancy_fee) > 0) items.push({ description: `${row.tier === "platinum" ? "Platinum" : "Gold"} number fee (one-time)${row.pattern ? ` · ${row.pattern}` : ""}`, qty: 1, rate: Number(row.fancy_fee), amount: Number(row.fancy_fee) });
  const r = await createInvoice(client, { kind: "custom", items, notes: `Phone number ${row.number}`, createdBy: o.renewal ? "auto-number" : "client", origin: o.origin, notify: o.notify ?? false });
  await sb(`/invoices?id=eq.${r.invoice.id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ phone_number_id: row.id }) });
  await patchNumber(row.id, { invoice_id: r.invoice.id });
  return r;
}

const addMonth = (ymd: string) => { const d = new Date(ymd + "T12:00:00Z"); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 10); };
const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);

/** Called from billing.markPaid when an invoice tied to a number is paid. */
export async function onNumberInvoicePaid(inv: any) {
  const row = await getNumber(inv.phone_number_id);
  if (!row) return;
  const from = row.paid_until && row.paid_until > today() ? row.paid_until : today();
  const paid_until = addMonth(from);
  if (row.status === "active" || row.status === "lapsed") { await patchNumber(row.id, { status: "active", paid_until }); return; }
  if (row.status !== "awaiting_payment") return;
  // First payment: buy it from Vobiz now (if connected), then HQ attaches it in Sarvam and marks it live.
  let status = "provisioning", last_error: string | null = null;
  if (vobizConfigured()) {
    try { await purchaseNumber(row.number); }
    catch (e: any) { status = "failed"; last_error = String(e?.message || e).slice(0, 400); }
  }
  await patchNumber(row.id, { status, paid_until, last_error });
}

/** HQ: number is set up in Sarvam → live. The first live number becomes the one the client's employees use. */
export async function markLive(row: any, o: { connectionId?: string | null } = {}) {
  const live = (await sb<any[]>(`/phone_numbers?client_id=eq.${row.client_id}&status=eq.active&select=id`).catch(() => [])) || [];
  const makeDefault = !live.length;
  const updated = await patchNumber(row.id, { status: "active", activated_at: new Date().toISOString(), is_default: makeDefault || row.is_default, sarvam_connection_id: o.connectionId || row.sarvam_connection_id || process.env.RANA_VOBIZ_CONNECTION_ID || null });
  if (makeDefault) await setDefault(updated);
  return updated;
}

/** Make this number the one employees call from (and the client's inbound number). */
export async function setDefault(row: any) {
  await sb(`/phone_numbers?client_id=eq.${row.client_id}&id=neq.${row.id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ is_default: false }) });
  await sb(`/phone_numbers?id=eq.${row.id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ is_default: true }) });
  await sb(`/clients?id=eq.${row.client_id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ sarvam_agent_number: row.number, sarvam_connection_id: row.sarvam_connection_id || null }) });
}

/** Release: stop renting. If it was the default, the client falls back to RANA's shared number. */
export async function release(row: any, o: { vendor?: boolean } = {}) {
  if (o.vendor !== false && vobizConfigured() && row.number && ["active", "lapsed", "provisioning", "failed"].includes(row.status)) await releaseNumber(row.number).catch(() => {});
  if (row.invoice_id) {
    const { getInvoice, voidInvoice } = await import("./billing");
    const inv = await getInvoice(row.invoice_id);
    if (inv?.status === "issued") await voidInvoice(inv).catch(() => {});
  }
  await patchNumber(row.id, { status: "released", released_at: new Date().toISOString(), is_default: false });
  if (row.is_default) await sb(`/clients?id=eq.${row.client_id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ sarvam_agent_number: null, sarvam_connection_id: null }) });
}

/** Daily: renew rent 5 days ahead, flag unpaid ones, expire checkouts nobody paid within 2 days. */
export async function runNumberBilling() {
  const log: any[] = [];
  const t = today();
  const rows = (await sb<any[]>(`/phone_numbers?status=in.(active,lapsed,awaiting_payment)&select=*`).catch(() => [])) || [];
  const { getInvoice, voidInvoice } = await import("./billing");
  for (const r of rows) {
    try {
      if (r.status === "awaiting_payment") {
        if (Date.now() - Date.parse(r.updated_at || r.created_at) > 2 * 86400e3) {
          const inv = r.invoice_id ? await getInvoice(r.invoice_id) : null;
          if (inv?.status === "issued") await voidInvoice(inv).catch(() => {});
          await patchNumber(r.id, { status: "expired" }); log.push({ number: r.number, did: "checkout-expired" });
        }
        continue;
      }
      if (!r.paid_until) continue;
      const days = Math.round((Date.parse(r.paid_until) - Date.parse(t)) / 86400e3);
      const open = r.invoice_id ? await getInvoice(r.invoice_id) : null;
      if (days <= 5 && open?.status !== "issued") {
        const [c] = (await sb<any[]>(`/clients?id=eq.${r.client_id}&limit=1`)) || [];
        if (c) { const inv = await invoiceForNumber(c, r, { renewal: true, notify: true }); log.push({ number: r.number, did: "renewal", invoice: inv.invoice.number }); }
      }
      if (days < -7 && r.status === "active") { await patchNumber(r.id, { status: "lapsed" }); log.push({ number: r.number, did: "lapsed" }); }
    } catch (e: any) { log.push({ number: r.number, error: String(e?.message || e).slice(0, 200) }); }
  }
  return log;
}

/** Everything HQ has to act on, for the command centre. */
export async function numberTasks() {
  return (await sb<any[]>(`/phone_numbers?status=in.(requested,provisioning,failed,lapsed)&order=created_at.asc&select=*`).catch(() => [])) || [];
}
