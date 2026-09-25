// Auto-recharge: when the wallet drops below the client's level, RANA issues a recharge invoice and Razorpay emails/SMSes
// the payment link (plus our own email). One pending auto-recharge at a time. When Razorpay enables UPI Autopay /
// e-mandates on the account, the same trigger can charge the saved mandate instead of sending a link.
import { sb } from "./db";
import { createInvoice, seller, todayIST, addDays } from "./billing";
import { sendEmail, ownerEmails, tpl } from "./notify";

export async function rechargeInvoice(client: any, amount: number, o: { origin?: string; createdBy?: string; notify?: boolean; auto?: boolean } = {}) {
  const { walletOf } = await import("./wallet");
  const w = await walletOf(client);
  const rate = w.rate || 8;
  const s = seller();
  return createInvoice(client, {
    kind: "recharge", origin: o.origin, createdBy: o.createdBy || "client", notify: o.notify ?? false, dueDate: addDays(todayIST(), 3),
    items: [{ description: `Prepaid calling credit${o.auto ? " (auto-recharge)" : ""} — about ${Math.floor(amount / rate).toLocaleString("en-IN")} minutes at ₹${rate}/min`, sac: s.sac, qty: 1, rate: amount, amount }],
  });
}

export async function maybeAutoRecharge(client: any, wallet?: any) {
  if (!client?.wallet_enabled || !client.auto_recharge_below || !client.auto_recharge_amount) return null;
  const { walletOf } = await import("./wallet");
  const w = wallet || (await walletOf(client));
  if (w.planMinutesLeft > 0 || w.balance >= Number(client.auto_recharge_below)) return null;
  // Only one open auto-recharge at a time.
  const open = (await sb<any[]>(`/invoices?client_id=eq.${client.id}&kind=eq.recharge&status=eq.issued&select=id,created_at&order=created_at.desc&limit=1`).catch(() => [])) || [];
  if (open.length) return null; // the cron voids unpaid ones after 10 days; a DB unique index also blocks doubles
  const r = await rechargeInvoice(client, Number(client.auto_recharge_amount), { createdBy: "auto-recharge", notify: true, auto: true });
  const to = await ownerEmails(client.id, client.billing_email || client.login_email);
  const m = tpl.autoRecharge(client.name, Number(client.auto_recharge_amount), r.invoice.rzp_link_url || null);
  await sendEmail({ to, subject: m.subject, html: m.html, clientId: client.id, kind: "auto_recharge" });
  return r.invoice;
}
