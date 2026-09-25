export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { unauthorized, forbidUnless } from "@/lib/auth";
import { getClientById } from "@/lib/supabase";
import { sb } from "@/lib/db";
import { audit } from "@/lib/audit";
import { vobizConfigured } from "@/lib/vobiz";
import { CITIES, PRICING, catalog, listClientNumbers, invoiceForNumber, prettyNumber } from "@/lib/numbers";
import { sendEmail, emailHtml, hqInbox, APP_URL, esc } from "@/lib/notify";

const view = (r: any) => ({
  id: r.id, number: r.number, pretty: r.number ? prettyNumber(r.number) : null, city: r.city, tier: r.tier, pattern: r.pattern,
  monthlyPrice: Number(r.monthly_price), fancyFee: Number(r.fancy_fee), status: r.status, paidUntil: r.paid_until, isDefault: r.is_default,
  request: r.request ? { city: r.request.city, style: r.request.style, digits: r.request.digits, note: r.request.note } : null,
  invoiceId: r.invoice_id, createdAt: r.created_at, activatedAt: r.activated_at,
});

function canBuy(c: any): string | null {
  if (!c) return "Workspace not found.";
  if (c.status === "pending") return "Your workspace is waiting for approval.";
  if (c.status === "suspended") return "Calling is paused on this workspace.";
  if ((c.plan || "trial") === "trial") return "Your own number comes with any paid plan. During the trial you call from RANA's shared number.";
  return null;
}

/** GET — this workspace's numbers, and what it can buy. */
export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  const c: any = await getClientById(session.clientId);
  const rows = await listClientNumbers(session.clientId);
  const invIds = rows.map((r) => r.invoice_id).filter(Boolean);
  const invs = invIds.length ? (await sb<any[]>(`/invoices?id=in.(${invIds.join(",")})&select=id,status,rzp_link_url,total`).catch(() => [])) || [] : [];
  return Response.json({
    numbers: rows.map((r) => { const inv = invs.find((i) => i.id === r.invoice_id); return { ...view(r), payUrl: inv?.status === "issued" ? inv.rzp_link_url || null : null, invoiceTotal: inv ? Number(inv.total) : null }; }),
    blocked: canBuy(c), catalogLive: vobizConfigured(), cities: CITIES,
    pricing: { monthlyFrom: PRICING.monthlyBase(), goldFee: PRICING.goldFee(), platinumFee: PRICING.platinumFee() },
    business: { legalName: c?.billing_name || c?.company_name || c?.name || "", gstin: c?.billing_gstin || "" },
  });
}

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN = /^[A-Z]{5}\d{4}[A-Z]$/;

/**
 * POST { action: "buy", number, city, business, consent }  — pick a number from the catalog → invoice to pay.
 * POST { action: "request", city, style, digits?, note?, business, consent } — ask RANA to find one (fancy or plain).
 */
export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  const denied = forbidUnless(session, "admin"); if (denied) return denied;
  const c: any = await getClientById(session.clientId);
  const block = canBuy(c); if (block) return Response.json({ error: block }, { status: 402 });
  const b = await req.json().catch(() => ({}));

  // Numbers are registered in the business's name (telecom KYC), so we need who the business is.
  const legalName = String(b.business?.legalName || "").trim().slice(0, 120);
  const gstin = String(b.business?.gstin || "").trim().toUpperCase();
  const pan = String(b.business?.pan || "").trim().toUpperCase();
  const signatory = String(b.business?.signatory || "").trim().slice(0, 80);
  if (legalName.length < 2) return Response.json({ error: "Enter the business's legal name — the number is registered to it." }, { status: 400 });
  if (!(GSTIN.test(gstin) || PAN.test(pan))) return Response.json({ error: "Enter the business GSTIN (or PAN if you don't have GST)." }, { status: 400 });
  if (b.consent !== true) return Response.json({ error: "Please accept the calling rules to continue." }, { status: 400 });
  const consent = { accepted: true, by: session.email, at: new Date().toISOString(), ip: req.headers.get("x-forwarded-for")?.split(",")[0] || null,
    text: "Use this number for inbound calls and for calling people who enquired or are customers. No cold promotional calls from this number (TRAI rules need a 140-series number for those)." };
  const business = { legalName, gstin: gstin || null, pan: pan || null, signatory: signatory || null };
  if (!c.billing_name || (!c.billing_gstin && gstin)) {
    await sb(`/clients?id=eq.${c.id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ ...(c.billing_name ? {} : { billing_name: legalName }), ...(c.billing_gstin || !gstin ? {} : { billing_gstin: gstin }) }) }).catch(() => {});
  }
  const origin = new URL(req.url).origin;

  if (b.action === "buy") {
    if (!vobizConfigured()) return Response.json({ error: "Choosing from the live list isn't switched on yet — use \"Ask RANA for a number\"." }, { status: 400 });
    const number = String(b.number || "").trim();
    const cat = await catalog({ city: String(b.city || "") });
    const pick = cat.numbers.find((x: any) => x.number === number);
    if (!pick) return Response.json({ error: "That number was just taken. Please pick another." }, { status: 409 });
    let row: any;
    try {
      [row] = await sb<any[]>(`/phone_numbers`, { method: "POST", body: JSON.stringify({
        client_id: c.id, number, city: pick.city, tier: pick.tier, pattern: pick.pattern, monthly_price: pick.monthly, fancy_fee: pick.fancyFee,
        vendor_monthly: pick.vendorMonthly, vendor_setup: pick.vendorSetup, status: "awaiting_payment", consent, request: { business } }) });
    } catch { return Response.json({ error: "Someone is buying that number right now. Please pick another." }, { status: 409 }); }
    const inv = await invoiceForNumber({ ...c, billing_name: c.billing_name || legalName, billing_gstin: c.billing_gstin || gstin || null }, row, { origin });
    await audit(session, "number_checkout", { req, targetType: "phone_number", targetId: row.id, detail: { number, tier: pick.tier, monthly: pick.monthly, fancyFee: pick.fancyFee } }).catch(() => {});
    return Response.json({ ok: true, id: row.id, payUrl: inv.invoice.rzp_link_url || null, invoiceId: inv.invoice.id, total: Number(inv.invoice.total) }, { status: 201 });
  }

  if (b.action === "request") {
    const city = String(b.city || "").trim().slice(0, 40);
    const style = ["any", "fancy", "digits", "series140"].includes(b.style) ? b.style : "any";
    const digits = String(b.digits || "").replace(/\D/g, "").slice(0, 6);
    const note = String(b.note || "").trim().slice(0, 300);
    if (!city) return Response.json({ error: "Pick a city." }, { status: 400 });
    if (style === "digits" && digits.length < 2) return Response.json({ error: "Enter the digits you'd like the number to end with (2–6 digits)." }, { status: 400 });
    const open = (await sb<any[]>(`/phone_numbers?client_id=eq.${c.id}&status=eq.requested&select=id`).catch(() => [])) || [];
    if (open.length >= 3) return Response.json({ error: "You already have 3 number requests open. RANA will get back to you on those first." }, { status: 429 });
    const [row] = await sb<any[]>(`/phone_numbers`, { method: "POST", body: JSON.stringify({
      client_id: c.id, city, status: "requested", consent, request: { city, style, digits: digits || null, note: note || null, business } }) });
    await audit(session, "number_requested", { req, targetType: "phone_number", targetId: row.id, detail: { city, style, digits } }).catch(() => {});
    await sendEmail({ to: hqInbox(), kind: "number_request", clientId: c.id, subject: `Number request: ${c.name} · ${city}`,
      html: emailHtml({ title: `${c.name} wants a business number`, lines: [
        `City: ${esc(city)} · ${style === "fancy" ? "Fancy number" : style === "digits" ? `Ending in ${esc(digits)}` : style === "series140" ? "140-series number for promotional campaigns (needs Tata DLT registration + company documents)" : "Any good number"}`,
        note ? `Note: ${esc(note)}` : "", `Business: ${esc(legalName)} · ${esc(gstin || pan)}`,
        "Find one in Sarvam or Vobiz, then offer it from RANA HQ → Phone numbers." ].filter(Boolean), button: { label: "Open RANA HQ", url: `${APP_URL()}/hq` } }) }).catch(() => {});
    return Response.json({ ok: true, id: row.id }, { status: 201 });
  }
  return Response.json({ error: "Unknown action" }, { status: 400 });
}
