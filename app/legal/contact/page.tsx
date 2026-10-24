import type { Metadata } from "next";
import { Doc, Sec, LEGAL } from "../legal";

export const metadata: Metadata = { title: "Contact Us", description: "Contact RANA AI — sales phone +91 78997 93001, WhatsApp, support and billing emails, business details and grievance officer.", alternates: { canonical: "/legal/contact" } };

export default function Contact() {
  const rows: [string, string, string, string][] = [
    ["Sales (phone)", LEGAL.phone, "Pricing, demos and new business · " + LEGAL.hours, `tel:${LEGAL.phoneTel}`],
    ["WhatsApp", LEGAL.phone, "Chat with our team in working hours", LEGAL.whatsapp],
    ["Sales & demos", LEGAL.salesEmail, "New business, pricing and demos", `mailto:${LEGAL.salesEmail}`],
    ["Customer support", LEGAL.email, "Help with your account, calls and AI employees", `mailto:${LEGAL.email}`],
    ["Billing", LEGAL.billingEmail, "Invoices, payments, refunds and cancellations", `mailto:${LEGAL.billingEmail}`],
  ];
  return (
    <Doc title="Contact Us" intro={`${LEGAL.brand} is based in ${LEGAL.city}. Call or WhatsApp sales on ${LEGAL.phone} (${LEGAL.hours}). We reply to every email within 1 working day.`}>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="contact-phone">
        {rows.map(([t, e, d, href]) => (
          <a key={t} href={href} {...(href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})} className="card p-5 block">
            <div className="eyebrow">{t}</div>
            <div className="font-display text-[17px] font-semibold text-ink mt-2 break-all tabular-nums">{e}</div>
            <p className="text-[13px] text-ink-soft mt-1.5 leading-5">{d}</p>
          </a>
        ))}
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
