"use client";
import { useEffect, useState } from "react";
import { inr, rupeesInWords } from "@/lib/money";

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");

/** Printable GST invoice. Opens from the Billing page and from RANA HQ; "Download PDF" = the browser's Save as PDF. */
export default function InvoicePage({ params }: { params: { id: string } }) {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    fetch(`/api/billing/invoices/${params.id}`).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Invoice not found"); setD(j); }).catch((e) => setErr(e.message));
  }, [params.id]);
  if (err) return <div className="p-10 text-[14px] text-miss">{err}</div>;
  if (!d) return <div className="p-10 text-[14px] text-ink-soft">Loading…</div>;
  const i = d.invoice, s = i.seller || {}, by = i.buyer || {};
  const taxed = Number(i.cgst) + Number(i.sgst) + Number(i.igst) > 0;
  const title = s.gstin ? "Tax Invoice" : "Invoice";
  return (
    <div className="min-h-screen bg-paper print:bg-raised py-8 print:py-0">
      <style>{`@media print { @page { size: A4; margin: 14mm; } .no-print { display: none !important; } }`}</style>
      <div className="max-w-[820px] mx-auto no-print flex justify-end gap-2 mb-3 px-4">
        {i.status === "issued" && i.rzp_link_url && <a href={i.rzp_link_url} className="bg-signal text-on-accent rounded-lg px-4 py-2 text-[13px] font-semibold">Pay {inr(i.total, true)}</a>}
        <button onClick={() => window.print()} className="bg-ink text-paper rounded-lg px-4 py-2 text-[13px] font-semibold" data-testid="print">Download PDF / Print</button>
      </div>
      <div className="max-w-[820px] mx-auto bg-raised border border-line print:border-0 rounded-xl print:rounded-none p-10 print:p-0 text-[12.5px] text-ink relative" data-testid="invoice">
        {i.status !== "issued" && <div className={`absolute left-10 bottom-36 rotate-[-12deg] border-4 rounded-lg px-4 py-1 text-[26px] font-bold tracking-widest opacity-70 ${i.status === "paid" ? "border-signal text-signal" : "border-miss text-miss"}`} data-testid="stamp">{i.status === "paid" ? "PAID" : "CANCELLED"}</div>}
        <div className="flex justify-between items-start gap-6">
          <div>
            <div className="text-[22px] font-display font-bold">{s.name}</div>
            {s.address && <div className="whitespace-pre-line text-ink-soft mt-1">{s.address}</div>}
            <div className="text-ink-soft">{[s.state, s.email].filter(Boolean).join(" · ")}</div>
            {s.gstin && <div className="mt-1">GSTIN <b>{s.gstin}</b></div>}
            {s.pan && <div>PAN {s.pan}</div>}
          </div>
          <div className="text-right">
            <div className="text-[20px] font-semibold uppercase tracking-wide">{title}</div>
            <div className="mt-2">No. <b data-testid="inv-number">{i.number}</b></div>
            <div>Date {fmt(i.created_at)}</div>
            {i.status === "issued" && i.due_date && <div>Due {fmt(i.due_date)}</div>}
            {i.period_start && <div className="text-ink-soft">Period {fmt(i.period_start)} – {fmt(i.period_end)}</div>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 mt-8 border-t border-line pt-5">
          <div>
            <div className="text-[10.5px] uppercase tracking-wide text-ink-soft font-semibold">Bill to</div>
            <div className="font-semibold mt-1">{by.name}</div>
            {by.address && <div className="whitespace-pre-line text-ink-soft">{by.address}</div>}
            {by.gstin && <div>GSTIN <b>{by.gstin}</b></div>}
            <div className="text-ink-soft">{[by.email, by.phone].filter(Boolean).join(" · ")}</div>
          </div>
          <div className="text-right">
            {s.gstin && <><div className="text-[10.5px] uppercase tracking-wide text-ink-soft font-semibold">Place of supply</div><div className="mt-1">{by.state || s.state || "—"}</div></>}
          </div>
        </div>

        <table className="w-full mt-6 border-collapse">
          <thead>
            <tr className="text-left text-[10.5px] uppercase tracking-wide text-ink-soft border-y border-line">
              <th className="py-2 pr-2 w-8">#</th><th className="py-2 pr-2">Description</th><th className="py-2 pr-2">SAC</th><th className="py-2 pr-2 text-right">Qty</th><th className="py-2 pr-2 text-right">Rate</th><th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(i.items || []).map((it: any, n: number) => (
              <tr key={n} className="border-b border-line align-top">
                <td className="py-2 pr-2">{n + 1}</td><td className="py-2 pr-2">{it.description}</td><td className="py-2 pr-2">{it.sac}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{it.qty}</td><td className="py-2 pr-2 text-right tabular-nums">{inr(it.rate, true)}</td><td className="py-2 text-right tabular-nums">{inr(it.amount, true)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end mt-4">
          <div className="w-[300px] flex flex-col gap-1">
            <div className="flex justify-between"><span>{taxed ? "Taxable value" : "Subtotal"}</span><span className="tabular-nums">{inr(i.subtotal, true)}</span></div>
            {Number(i.cgst) > 0 && <div className="flex justify-between"><span>CGST @ 9%</span><span className="tabular-nums">{inr(i.cgst, true)}</span></div>}
            {Number(i.sgst) > 0 && <div className="flex justify-between"><span>SGST @ 9%</span><span className="tabular-nums">{inr(i.sgst, true)}</span></div>}
            {Number(i.igst) > 0 && <div className="flex justify-between"><span>IGST @ 18%</span><span className="tabular-nums">{inr(i.igst, true)}</span></div>}
            <div className="flex justify-between border-t border-line pt-2 mt-1 text-[14px] font-bold"><span>Total</span><span className="tabular-nums" data-testid="inv-total">{inr(i.total, true)}</span></div>
          </div>
        </div>
        <div className="mt-2 text-right text-ink-soft italic">{rupeesInWords(Number(i.total))}</div>

        <div className="mt-8 border-t border-line pt-4 grid grid-cols-2 gap-6 text-ink-soft">
          <div>
            {i.status === "paid" ? (
              <div>Paid on {fmt(i.paid_at)} via {i.paid_via}{i.rzp_payment_id ? ` · ${i.rzp_payment_id}` : i.paid_ref ? ` · ${i.paid_ref}` : ""}.</div>
            ) : i.status === "issued" ? (
              <div className="whitespace-pre-line">
                {i.rzp_link_url && <div>Pay online: <span className="text-ink">{i.rzp_link_url}</span></div>}
                {d.offline?.upi && <div>UPI: <span className="text-ink">{d.offline.upi}</span></div>}
                {d.offline?.bank && <div className="mt-1">{d.offline.bank}</div>}
                <div className="mt-1">Please quote {i.number} with your payment.</div>
              </div>
            ) : <div>This invoice was cancelled.</div>}
            {i.notes && <div className="mt-2 whitespace-pre-line">{i.notes}</div>}
          </div>
          <div className="text-right">
            {!s.gstin && <div>Supplier not registered under GST; no GST charged.</div>}
            {s.gstin && <div>Tax payable on reverse charge: No</div>}
            <div className="mt-6">For {s.name}</div>
            <div className="text-[11px]">Computer-generated invoice; no signature required.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
