import type { Metadata } from "next";
import { Doc, Sec, LEGAL } from "../legal";

export const metadata: Metadata = { title: "Privacy Policy", description: "How RANA AI collects, uses, shares and protects personal data under India's DPDP Act, 2023 — your rights and our grievance officer.", alternates: { canonical: "/legal/privacy" } };

export default function Privacy() {
  return (
    <Doc
      title="Privacy Policy"
      intro={`This policy explains what personal data ${LEGAL.brand} (operated by ${LEGAL.owner}, ${LEGAL.city}) collects, why, and the choices you have. It is written to meet the Digital Personal Data Protection Act, 2023 and the Information Technology Act, 2000.`}
    >
      <Sec h="What we collect">
        <ul>
          <li><b>Account details</b> — name, business name, email, phone number, billing address and GSTIN you give us.</li>
          <li><b>Call data</b> — phone numbers called or calling in, call recordings, transcripts, summaries and lead scores created while providing the service.</li>
          <li><b>Contact lists</b> — the leads you upload so your AI employee can call them.</li>
          <li><b>Usage data</b> — log-ins, pages used and technical logs needed to run and secure the service.</li>
          <li><b>Payments</b> — handled by Razorpay. We receive payment status and reference numbers; we never see or store your card, UPI PIN or bank passwords.</li>
        </ul>
      </Sec>
      <Sec h="Why we use it">
        <ul>
          <li>To provide the service: make and receive calls, transcribe and score them, and show results in your dashboard.</li>
          <li>To bill you, send invoices, receipts and service emails (for example trial and usage alerts).</li>
          <li>To keep the service secure, prevent misuse, and meet legal and tax obligations.</li>
        </ul>
        <p>We do not sell personal data and we do not use your call recordings to advertise to anyone.</p>
      </Sec>
      <Sec h="Who we share it with">
        <p>Only with service providers that help us run {LEGAL.brand}, under confidentiality and only for that purpose: Sarvam AI (speech and voice AI), our telephony provider, Supabase (database), Vercel (hosting), Resend (email delivery) and Razorpay (payments). We may disclose data when the law requires it.</p>
      </Sec>
      <Sec h="Customer data and callers">
        <p>For the leads and callers you contact through {LEGAL.brand}, you (our customer) decide what is collected and why, and we process that data on your behalf. You are responsible for having a lawful basis, such as the person's enquiry or consent, before we call them for you.</p>
      </Sec>
      <Sec h="How long we keep it">
        <p>Account and call data are kept while your account is active. After closure we delete or anonymise it within 90 days, except invoices and records we must keep under tax law (up to 8 years).</p>
      </Sec>
      <Sec h="Security">
        <p>Data is encrypted in transit, access is limited to people who need it, logins are protected with signed sessions and optional two-step verification, and support access to a customer workspace is logged.</p>
      </Sec>
      <Sec h="Cookies and similar technology">
        <p>We use only what the service needs to work: a sign-in cookie that keeps you logged in, and a setting saved in your browser for light or dark mode. We do not use advertising cookies or sell browsing data. If we add analytics in future, we will update this section and ask for consent where the law requires it.</p>
      </Sec>
      <Sec h="Your rights">
        <p>You can ask to access, correct or delete your personal data, withdraw consent, or nominate someone to act for you, by emailing <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>. We reply within 30 days. If you are not satisfied with our response, you may complain to the Data Protection Board of India.</p>
      </Sec>
      <Sec h="Grievance officer">
        <p>{LEGAL.owner}, {LEGAL.brand}, {LEGAL.city}. Email: <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>. We acknowledge complaints within 48 hours and aim to resolve them within 30 days.</p>
      </Sec>
      <Sec h="Changes">
        <p>If we change this policy we will update the date above and, for significant changes, tell customers by email.</p>
      </Sec>
    </Doc>
  );
}
