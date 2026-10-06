// Call types RANA files every call under (pure data: safe in the browser).
export type CallCategory = "lead" | "customer" | "support" | "marketing" | "spam" | "junk" | "wrong_number";
export const CATEGORY_LABEL: Record<CallCategory, string> = {
  lead: "New customer enquiry", customer: "Existing customer", support: "Complaint / support", marketing: "Sales pitch to us",
  spam: "Spam", junk: "Junk / no conversation", wrong_number: "Wrong number",
};
/** Calls that are never worth an alert (unless a channel asked for every call). */
export const NOISE: CallCategory[] = ["marketing", "spam", "junk", "wrong_number"];
