// Shared facts for the public policy pages. The legal name must match the Razorpay account (Business details).
export const LEGAL = {
  brand: "RANA AI",
  owner: "Munagala Sri Charan",
  city: "Hyderabad, Telangana, India",
  email: "support@ranaai.in",
  salesEmail: "hello@ranaai.in",
  billingEmail: "billing@ranaai.in",
  site: "https://ranaai.in",
  updated: "25 September 2026",
};

export const LEGAL_LINKS: [string, string][] = [
  ["Terms", "/legal/terms"],
  ["Privacy", "/legal/privacy"],
  ["Refunds & cancellation", "/legal/refunds"],
  ["Shipping & delivery", "/legal/delivery"],
  ["Contact", "/legal/contact"],
];

export function Doc({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
  return (
    <article>
      <p className="eyebrow">// LEGAL</p>
      <h1 className="font-display text-[34px] sm:text-[42px] font-semibold tracking-tight mt-3">{title}</h1>
      <p className="text-ink-soft text-[14px] mt-2">Last updated: {LEGAL.updated}</p>
      {intro && <p className="text-[16px] leading-7 mt-6 text-ink/90">{intro}</p>}
      <div className="mt-8 space-y-8 text-[15px] leading-7 text-ink/85">{children}</div>
    </article>
  );
}

export function Sec({ h, children }: { h: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-[20px] font-semibold text-ink mb-2">{h}</h2>
      <div className="space-y-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_a]:text-signal">{children}</div>
    </section>
  );
}
