import type { Metadata } from "next";
import Link from "next/link";
import { Doc, Sec, LEGAL } from "../legal";

export const metadata: Metadata = { title: "Terms & Conditions", description: "Terms & Conditions for RANA AI, the AI voice calling service for Indian businesses: plans, payments, calling responsibilities, data and liability.", alternates: { canonical: "/legal/terms" } };

export default function Terms() {
  return (
    <Doc
      title="Terms & Conditions"
      intro={`These terms govern your use of ${LEGAL.brand} (${LEGAL.site}), a service operated by ${LEGAL.owner}, a sole proprietor based in ${LEGAL.city} ("we", "us"). By creating an account or paying for a plan you ("the customer") agree to these terms.`}
    >
      <Sec h="1. The service">
        <p>{LEGAL.brand} provides AI voice agents ("AI employees") that answer and place phone calls for your business, record and transcribe those calls, score leads and show the results in an online dashboard. The service is delivered online as software-as-a-service; nothing is shipped physically.</p>
      </Sec>
      <Sec h="2. Accounts">
        <ul>
          <li>You must give accurate business details and keep your login secure. You are responsible for everything done under your account.</li>
          <li>New sign-ups are reviewed before calling is switched on. We may refuse or close an account that breaks these terms.</li>
        </ul>
      </Sec>
      <Sec h="3. Plans, trial and payment">
        <ul>
          <li>New workspaces get a 14-day free trial with limited minutes. No payment is taken for the trial.</li>
          <li>Paid plans are billed monthly or annually in advance, in Indian Rupees. Prices on the website exclude GST, which is added where applicable. A one-time onboarding fee applies to some plans unless waived.</li>
          <li>Usage is measured in connected call minutes, each call rounded up to the next 30 seconds. Minutes above your plan are charged at your plan's overage rate or taken from your prepaid wallet.</li>
          <li>Payments are processed by Razorpay. If an invoice stays unpaid 7 days after its due date, calling may be paused until it is paid.</li>
          <li>Refunds and cancellations follow our <Link href="/legal/refunds">Refund & Cancellation Policy</Link>.</li>
        </ul>
      </Sec>
      <Sec h="4. Your responsibilities when calling">
        <ul>
          <li>You must only call people who have enquired with you or agreed to be contacted, and you must follow Indian telecom rules, including TRAI's commercial-communication (DND/DLT) regulations.</li>
          <li>You are responsible for the lists you upload, the scripts and prompts you give the AI employee, and any promises it makes on your behalf based on your instructions.</li>
          <li>You must not use the service for spam, fraud, harassment, impersonation, illegal content, or calls to emergency numbers.</li>
          <li>Callers may be told that they are speaking with an AI assistant and that calls may be recorded.</li>
        </ul>
      </Sec>
      <Sec h="5. Your data">
        <p>You own your contact lists, call recordings, transcripts and lead data. We process them only to provide the service, as described in our <Link href="/legal/privacy">Privacy Policy</Link>. You can export or ask us to delete your data at any time.</p>
      </Sec>
      <Sec h="6. Availability and changes">
        <p>We aim to keep the service available around the clock, but it depends on telephony, AI and cloud providers and may occasionally be interrupted for maintenance or reasons outside our control. We may improve or change features; we will tell you in advance of any change that materially reduces what your paid plan includes.</p>
      </Sec>
      <Sec h="7. Limitation of liability">
        <p>AI conversations can occasionally be inaccurate; you should review important outcomes. To the extent permitted by law, we are not liable for indirect or consequential losses (such as lost profits or lost leads), and our total liability for any claim is limited to the fees you paid us in the three months before the claim.</p>
      </Sec>
      <Sec h="8. Ending the service">
        <p>You can stop using the service at any time. We may suspend or end an account that breaks these terms or misuses the service. On closure you may request an export of your data within 30 days.</p>
      </Sec>
      <Sec h="9. Law and disputes">
        <p>These terms are governed by the laws of India. Courts at Hyderabad, Telangana have exclusive jurisdiction.</p>
      </Sec>
      <Sec h="10. Contact">
        <p>Questions about these terms: <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.</p>
      </Sec>
    </Doc>
  );
}
