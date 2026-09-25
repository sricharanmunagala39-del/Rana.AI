export const runtime = "nodejs";
import { getSession } from "@/lib/session";
import { requireHq } from "@/lib/hq";
import { sb } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getNumber, patchNumber, invoiceForNumber, markLive, release, fancyOf, prettyNumber, PRICING, cityOfNumber } from "@/lib/numbers";
import { sendEmail, emailHtml, ownerEmails, APP_URL } from "@/lib/notify";

/** GET — every client number (requests, being set up, live) for RANA HQ. */
export async function GET(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session); if (denied) return denied;
  const rows = (await sb<any[]>(`/phone_numbers?status=neq.expired&order=created_at.desc&limit=300&select=*`).catch(() => [])) || [];
  const ids = Array.from(new Set(rows.map((r) => r.client_id)));
  const clients = ids.length ? (await sb<any[]>(`/clients?id=in.(${ids.join(",")})&select=id,name`).catch(() => [])) || [] : [];
  return Response.json({ numbers: rows.map((r) => ({ ...r, pretty: r.number ? prettyNumber(r.number) : null, clientName: clients.find((c) => c.id === r.client_id)?.name || "—" })), pricing: { monthly: PRICING.monthlyBase(), gold: PRICING.goldFee(), platinum: PRICING.platinumFee() } });
}

/**
 * PATCH { id, action }
 *  offer { number, monthlyPrice?, fancyFee? } — answer a request with a real number → client gets an invoice to pay
 *  live { connectionId? }                       — number is attached in Sarvam → client can call from it
 *  release                                      — stop renting it
 */
export async function PATCH(req: Request) {
  const session = await getSession(req);
  const denied = requireHq(session, "clients"); if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const row = await getNumber(String(b.id || ""));
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });
  const [c] = (await sb<any[]>(`/clients?id=eq.${row.client_id}&limit=1`)) || [];
  const to = c ? await ownerEmails(c.id, c.billing_email || c.login_email) : [];

  if (b.action === "offer") {
    if (row.status !== "requested") return Response.json({ error: "Only open requests can be offered a number." }, { status: 400 });
    const d = String(b.number || "").replace(/[^\d]/g, "").replace(/^0+/, ""); // 040… / 91… / 10 digits
    const number = d.length === 10 ? `+91${d}` : d.length === 12 && d.startsWith("91") ? `+${d}` : null;
    if (!number) return Response.json({ error: "Enter the 10-digit number, e.g. 04071234567." }, { status: 400 });
    const f = fancyOf(number);
    const monthly = Number(b.monthlyPrice) > 0 ? Number(b.monthlyPrice) : PRICING.monthlyBase();
    const fancyFee = b.fancyFee !== undefined && b.fancyFee !== "" ? Math.max(0, Number(b.fancyFee) || 0) : f.tier === "platinum" ? PRICING.platinumFee() : f.tier === "gold" ? PRICING.goldFee() : 0;
    let updated: any;
    try { updated = await patchNumber(row.id, { number, city: row.city || cityOfNumber(number), tier: f.tier, pattern: f.pattern, monthly_price: monthly, fancy_fee: fancyFee, status: "awaiting_payment" }); }
    catch { return Response.json({ error: "That number is already held by another workspace." }, { status: 409 }); }
    const inv = await invoiceForNumber(c, updated, { notify: true });
    await sendEmail({ to, kind: "number_offer", clientId: c.id, subject: `Your RANA number is ready: ${prettyNumber(number)}`,
      html: emailHtml({ title: `We found your number: ${prettyNumber(number)}`, lines: [
        `${f.pattern ? `${f.pattern}. ` : ""}₹${monthly.toLocaleString("en-IN")}/month${fancyFee ? ` + ₹${fancyFee.toLocaleString("en-IN")} one-time` : ""} (+GST).`,
        "Pay to reserve it — it goes live for your AI employees within a working day." ], button: { label: "Pay and reserve", url: inv.invoice.rzp_link_url || `${APP_URL()}/phone-numbers` } }) }).catch(() => {});
    await audit(session!, "hq_number_offered", { req, targetType: "phone_number", targetId: row.id, detail: { client: c?.name, number, monthly, fancyFee } }).catch(() => {});
    return Response.json({ ok: true });
  }

  if (b.action === "live") {
    if (!["provisioning", "failed", "lapsed"].includes(row.status)) return Response.json({ error: "Only a paid number can go live." }, { status: 400 });
    await markLive(row, { connectionId: String(b.connectionId || "").trim() || null });
    await sendEmail({ to, kind: "number_live", clientId: c.id, subject: `${prettyNumber(row.number)} is live`,
      html: emailHtml({ title: `Your number ${prettyNumber(row.number)} is live`, lines: ["Your AI employees now call from and answer on this number. Pick which employee answers it on the Inbound page."], button: { label: "Open RANA", url: `${APP_URL()}/phone-numbers` } }) }).catch(() => {});
    await audit(session!, "hq_number_live", { req, targetType: "phone_number", targetId: row.id, detail: { client: c?.name, number: row.number } }).catch(() => {});
    return Response.json({ ok: true });
  }

  if (b.action === "release") {
    await release(row);
    await audit(session!, "hq_number_released", { req, targetType: "phone_number", targetId: row.id, detail: { client: c?.name, number: row.number } }).catch(() => {});
    return Response.json({ ok: true });
  }
  return Response.json({ error: "Unknown action" }, { status: 400 });
}
