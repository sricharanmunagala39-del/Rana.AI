import type { Metadata } from "next";
import { Doc, Sec, LEGAL } from "../legal";

export const metadata: Metadata = { title: "Refund & Cancellation Policy" };

export default function Refunds() {
  return (
    <Doc
      title="Refund & Cancellation Policy"
      intro={`${LEGAL.brand} is operated by ${LEGAL.owner}. Every new workspace starts with a 14-day free trial, so you can test the service fully before paying anything. This policy covers what happens after you pay.`}
    >
      <Sec h="Cancelling a plan">
        <ul>
          <li>You can cancel a monthly or annual plan at any time by emailing <a href={`mailto:${LEGAL.billingEmail}`}>{LEGAL.billingEmail}</a> from your account email. No cancellation fee applies.</li>
          <li>After cancellation your plan will not renew. Calling stays on until the end of the period you have already paid for.</li>
        </ul>
      </Sec>
      <Sec h="Refunds">
        <ul>
          <li><b>Monthly plans:</b> fees for a billing month that has started are not refundable.</li>
          <li><b>Annual plans:</b> if you cancel within 7 days of payment, we refund the annual fee minus the monthly price for each month started and any overage used. After 7 days annual fees are not refundable.</li>
          <li><b>Onboarding fee:</b> refundable in full if you cancel before setup work begins; not refundable once your AI employee has been configured.</li>
          <li><b>Prepaid wallet recharges:</b> not refundable, except that unused balance is refunded when you close your account on request.</li>
          <li><b>Duplicate or wrong charges:</b> always refunded in full.</li>
          <li>If the service is unavailable for a long period because of a fault on our side, we will credit or refund the affected days.</li>
        </ul>
      </Sec>
      <Sec h="How refunds are paid">
        <p>Approved refunds are made to the original payment method through Razorpay within 5–7 working days of approval. Your bank may take a few more days to show the credit. GST charged on the refunded amount is refunded too.</p>
      </Sec>
      <Sec h="How to ask">
        <p>Email <a href={`mailto:${LEGAL.billingEmail}`}>{LEGAL.billingEmail}</a> with your invoice number and reason. We reply within 2 working days.</p>
      </Sec>
    </Doc>
  );
}
