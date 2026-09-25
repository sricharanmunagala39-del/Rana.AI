import type { Metadata } from "next";
import { Doc, Sec, LEGAL } from "../legal";

export const metadata: Metadata = { title: "Shipping & Delivery Policy" };

export default function Delivery() {
  return (
    <Doc
      title="Shipping & Delivery Policy"
      intro={`${LEGAL.brand} (operated by ${LEGAL.owner}) is an online software service. We do not sell or ship physical goods.`}
    >
      <Sec h="How the service is delivered">
        <ul>
          <li>Access is delivered online at <a href={LEGAL.site}>{LEGAL.site}</a> using the login you create at sign-up.</li>
          <li>Trial workspaces are reviewed and switched on within 1 working day of sign-up.</li>
          <li>A paid plan is activated immediately after successful payment; you receive an invoice and receipt by email.</li>
          <li>Where a plan includes onboarding, we set up your AI employee (script, voice, languages and phone number) within 3–7 working days of payment, depending on the information you provide and telecom approvals for a dedicated number.</li>
        </ul>
      </Sec>
      <Sec h="If something is delayed">
        <p>If your access or setup is delayed beyond these times, email <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a> and we will update you within 1 working day.</p>
      </Sec>
    </Doc>
  );
}
