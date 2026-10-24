import type { Metadata } from "next";
import { Doc, Sec, LEGAL } from "../legal";

export const metadata: Metadata = { title: "Contact Us", description: "Contact RANA AI — sales, customer support and billing emails, business details and grievance officer.", alternates: { canonical: "/legal/contact" } };

export default function Contact() {
  const rows: [string, string, string][] = [
    ["Sales & demos", LEGAL.salesEmail, "New business, pricing and demos"],
    ["Customer support", LEGAL.email, "Help with your account, calls and AI employees"],
    ["Billing", LEGAL.billingEmail, "Invoices, payments, refunds and cancellations"],
  ];
  return (
    <Doc title="Contact Us" intro={`${LEGAL.brand} is based in ${LEGAL.city}. We reply to every email within 1 working day (Monday–Saturday, 10 am – 7 pm IST).`}>
      <div className="grid sm:grid-cols-3 gap-4">
        {rows.map(([t, e, d]) => (
          <a key={e} href={`mailto:${e}`} className="card p-5 block">
            <div className="eyebrow">{t}</div>
            <div className="font-display text-[17px] font-semibold text-ink mt-2 break-all">{e}</div>
            <p className="text-[13px] text-ink-soft mt-1.5 leading-5">{d}</p>
          </a>
        ))}
      </div>
      <div className="card p-5 mt-4 flex flex-wrap items-center gap-x-6 gap-y-2" data-testid="contact-phone">
        <div className="eyebrow">Phone &amp; WhatsApp</div>
        <a href={`tel:${LEGAL.phoneTel}`} className="font-display text-[17px] font-semibold text-ink">{LEGAL.phone}</a>
        <a href={LEGAL.whatsapp} target="_blank" rel="noopener noreferrer" className="text-[13.5px] text-signal">Message on WhatsApp</a>
        <span className="text-[13px] text-ink-soft">Monday–Saturday, 10 am – 7 pm IST</span>
      </div>
      <Sec h="Business details">
        <ul>
          <li>Legal name: {LEGAL.owner}</li>
          <li>Brand: {LEGAL.brand}</li>
          <li>Location: {LEGAL.city}</li>
          <li>Phone: <a href={`tel:${LEGAL.phoneTel}`}>{LEGAL.phone}</a></li>
          <li>Website: <a href={LEGAL.site}>{LEGAL.site}</a></li>
        </ul>
      </Sec>
      <Sec h="Complaints">
        <p>For complaints about the service or your personal data, write to our Grievance Officer at <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.</p>
      </Sec>
    </Doc>
  );
}
