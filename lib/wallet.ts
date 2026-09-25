// Prepaid calling wallet. Plan minutes are used first each billing period; minutes beyond the plan are paid from the wallet
// at the plan's per-minute rate. Balance = recharges (+ adjustments) − closed-period debits − this period's live overage.
import { sb } from "./db";
import { usageOf, limitsOf } from "./plans";
import { r2 } from "./billing";

export const RECHARGE_PACKS = [5000, 10000, 25000];
export const MIN_RECHARGE = 2000;
export const LOW_WALLET_SHARE = 0.2; // warn when below 20% of the last recharge (min ₹1,000)

export async function ledgerOf(clientId: string, limit = 200) {
  return (await sb<any[]>(`/wallet_ledger?client_id=eq.${clientId}&order=created_at.desc&limit=${limit}`).catch(() => [])) || [];
}

export async function walletOf(client: any, usage?: any) {
  const u = usage || (await usageOf(client));
  const lim = limitsOf(client);
  const rate = lim.plan.overagePerMin || 0;
  const ledger = await ledgerOf(client.id, 500);
  const credits = ledger.filter((e) => e.kind !== "debit").reduce((a, e) => a + Number(e.amount), 0);
  const debits = ledger.filter((e) => e.kind === "debit").reduce((a, e) => a + Number(e.amount), 0);
  const liveOverage = client.wallet_enabled && rate ? r2(Math.max(0, u.minutesUsed - u.minutesIncluded) * rate) : 0;
  const balance = r2(credits - debits - liveOverage);
  const lastCredit = ledger.find((e) => e.kind === "credit");
  const lowAt = Math.max(1000, (lastCredit ? Number(lastCredit.amount) : 5000) * LOW_WALLET_SHARE);
  const planLeft = Math.max(0, u.minutesIncluded - u.minutesUsed);
  return {
    enabled: !!client.wallet_enabled, rate, balance, liveOverage,
    planMinutesLeft: planLeft,
    walletMinutesLeft: rate ? Math.max(0, Math.floor(balance / rate)) : 0,
    minutesLeft: planLeft + (rate ? Math.max(0, Math.floor(balance / rate)) : 0),
    low: !!client.wallet_enabled && planLeft === 0 && balance < lowAt,
    empty: !!client.wallet_enabled && planLeft === 0 && balance <= 0,
    lowAt,
    autoRecharge: client.auto_recharge_below && client.auto_recharge_amount ? { below: Number(client.auto_recharge_below), amount: Number(client.auto_recharge_amount) } : null,
    ledger: ledger.slice(0, 30),
  };
}
