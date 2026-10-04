import type { Metadata } from "next";
import { Doc, Sec, LEGAL } from "../legal";

export const metadata: Metadata = { title: "Privacy Policy", description: "How RANA AI collects, uses, shares and protects personal data under India's DPDP Act, 2023 — your rights and our grievance officer.", alternates: { canonical: "/legal/privacy" } };

export default function Privacy() {
  return (
    <Doc
      title="Privacy Policy"
      updated="27 September 2026"
      intro={`This policy explains what personal data ${LEGAL.brand} (${LEGAL.city}) collects, why, and the choices you have. It is written to meet the Digital Personal Data Protection Act, 2023 and the Information Technology Act, 2000.`}
    >
      <Sec h="What we collect">
        <ul>
          <li><b>Account details</b> — name, business name, email, phone number, billing address and GSTIN you give us.</li>
          <li><b>Call data</b> — phone numbers called or calling in, call recordings, transcripts, summaries and lead scores created while providing the service.</li>
          <li><b>Contact lists</b> — the leads you upload so your AI employee can call them.</li>
          <li><b>Usage data</b> — log-ins, pages used and technical logs needed to run and secure the service.</li>
          <li><b>Website conversations</b> — if you use &ldquo;Talk to Rana&rdquo; or an instant demo on our website, we record the conversation&apos;s transcript and a short summary (and any name, company or contact details you choose to say) so our team can follow up. You can ask us to delete it at any time.</li>
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
        <p>Only with service providers that help us run {LEGAL.brand}, under confidentiality and only for that purpose: our speech and voice AI providers, our telephony provider, Supabase (database), Vercel (hosting), Resend (email delivery) and Razorpay (payments). We may disclose data when the law requires it.</p>
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
        <p>We use only what the service needs to work: a sign-in cookie that keeps you logged in, and a setting saved in your browser for light or dark mode. If you reach our website from a link in one of our social media posts, your browser also remembers that link's campaign tag (for example utm_source=instagram) for up to 30 days and sends it with a demo request or sign-up, so we know which post helped. Nothing else is tracked. We do not use advertising cookies or sell browsing data. If we add analytics in future, we will update this section and ask for consent where the law requires it.</p>
      </Sec>
      <Sec h="YouTube and our social media accounts">
        <p>{LEGAL.brand} uses YouTube API Services to upload and schedule videos on our own YouTube channel, add comments to our own videos and read their statistics (views, likes and comments). We use the official Meta and LinkedIn APIs in the same way for our own Facebook, Instagram and LinkedIn pages. These tools act only on accounts owned by {LEGAL.brand}; we do not access, collect or store data from your YouTube, Google, Facebook, Instagram or LinkedIn account.</p>
        <p>By watching or interacting with our videos on YouTube you are also subject to the <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">YouTube Terms of Service</a>, and Google handles your data under the <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google Privacy Policy</a>.</p>
        <p>Statistics we receive from YouTube API Services are refreshed or deleted within 30 days. If you have ever connected a Google account to {LEGAL.brand}, you can revoke our access at any time on the <a href="https://security.google.com/settings/security/permissions" target="_blank" rel="noopener noreferrer">Google security settings page</a>, and you can ask us to delete any data by emailing <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.</p>
      </Sec>
      <Sec h="Your rights">
        <p>You can ask to access, correct or delete your personal data, withdraw consent, or nominate someone to act for you, by emailing <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>. We reply within 30 days. If you are not satisfied with our response, you may complain to the Data Protection Board of India.</p>
      </Sec>
      <Sec h="Grievance officer">
        <p>Grievance Officer, {LEGAL.brand}, {LEGAL.city}. Email: <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>. We acknowledge complaints within 48 hours and aim to resolve them within 30 days.</p>
      </Sec>
      <Sec h="Changes">
        <p>If we change this policy we will update the date above and, for significant changes, tell customers by email.</p>
      </Sec>
    </Doc>
  );
}
