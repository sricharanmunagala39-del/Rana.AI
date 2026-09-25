import type { Metadata } from "next";
import { Doc, Sec, LEGAL } from "../legal";

export const metadata: Metadata = { title: "Contact Us" };

export default function Contact() {
  const rows: [string, string, string][] = [
    ["Sales & demos", LEGAL.salesEmail, "New business, pricing and demos"],
    ["Customer support", LEGAL.email, "Help with your account, calls and AI employees"],
    ["Billing", LEGAL.billingEmail, "Invoices, payments, refunds and cancellations"],
  ];
  return (
    <Doc title="Contact Us" intro={`${LEGAL.brand} is operated by ${LEGAL.owner} (sole proprietor), ${LEGAL.city}. We reply to every email within 1 working day (Monday–Saturday, 10 am – 7 pm IST).`}>
      <div className="grid sm:grid-cols-3 gap-4">
        {rows.map(([t, e, d]) => (
          <a key={e} href={`mailto:${e}`} className="card p-5 block">
            <div className="eyebrow">{t}</div>
            <div className="font-display text-[17px] font-semibold text-ink mt-2 break-all">{e}</div>
            <p className="text-[13px] text-ink-soft mt-1.5 leading-5">{d}</p>
          </a>
        ))}
      </div>
      <Sec h="Business details">
        <ul>
          <li>Legal name: {LEGAL.owner}</li>
          <li>Brand: {LEGAL.brand}</li>
          <li>Location: {LEGAL.city}</li>
          <li>Website: <a href={LEGAL.site}>{LEGAL.site}</a></li>
        </ul>
      </Sec>
      <Sec h="Complaints">
        <p>For complaints about the service or your personal data, write to our grievance officer, {LEGAL.owner}, at <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.</p>
      </Sec>
    </Doc>
  );
}
