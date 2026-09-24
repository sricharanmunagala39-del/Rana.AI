import type { Metadata } from "next";

// Change this once the ranaai.in mailbox is live.
const CONTACT_EMAIL = "hello@ranaai.in";
const DEMO_MAILTO = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("RANA AI demo")}&body=${encodeURIComponent(
  "Hi, I'd like to see RANA AI on our calls.\n\nCompany:\nWhat calls we get / make:\nRough monthly call volume:\nPhone:"
)}`;

export const metadata: Metadata = {
  title: "RANA AI — AI voice agents for Indian businesses",
  description:
    "RANA AI answers and places your business calls in Telugu, Hindi and English, captures every lead, and hands hot ones to your sales team in seconds.",
};

const PhoneIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.95.36 1.87.68 2.75a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.33-1.34a2 2 0 0 1 2.11-.45c.88.32 1.8.55 2.75.68A2 2 0 0 1 22 16.92z" />
  </svg>
);

const STEPS = [
  { n: "01", title: "The call comes in — or goes out", body: "Your existing number forwards to the agent, or the agent dials your lead list. It picks up in the caller's language and keeps the conversation natural, not scripted-sounding." },
  { n: "02", title: "It qualifies while it talks", body: "Name, course or product interest, budget, timeline, college, year — whatever your sales team asks first. Every call is recorded, transcribed and summarised." },
  { n: "03", title: "Hot leads reach a human fast", body: "“Ready to close” pings your team on Slack or WhatsApp instantly. Everything lands in your sheet or CRM, and the caller gets a follow-up message automatically." },
];

const FEATURES = [
  { title: "Telugu, Hindi, English", body: "Follows whichever language the caller opens in — including everyday colloquial Telugu, not textbook Telugu." },
  { title: "Inbound and outbound", body: "Answer every enquiry 24×7, and run outbound campaigns to your own lead lists without adding telecallers." },
  { title: "Your Indian number", body: "Works on your business line through a compliant Indian telephony setup. Customers see the number they already know." },
  { title: "Built into your workflow", body: "Google Sheets, Slack, WhatsApp, email, your CRM. Leads are classified hot / warm / cold before anyone touches them." },
  { title: "A dashboard you'll open", body: "Every call, transcript, outcome and campaign in one place. Change the agent's script and voice yourself." },
  { title: "Set up for you", body: "We don't hand you a tool and leave. We write the call flow with your team, test it on real calls, and tune it weekly." },
];

const FOR = [
  "Coaching & exam-prep institutes",
  "Clinics & diagnostic centres",
  "Real estate",
  "Colleges & admissions",
  "Local services & franchises",
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* Nav */}
      <header className="max-w-[1080px] mx-auto px-4 sm:px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-signal text-white flex items-center justify-center"><PhoneIcon size={15} /></div>
          <span className="text-[18px] font-display font-bold tracking-tight">RANA AI</span>
        </div>
        <nav className="flex items-center gap-4 sm:gap-6 text-[13px]">
          <a href="#how" className="hidden sm:inline text-ink-soft hover:text-ink">How it works</a>
          <a href="#features" className="hidden sm:inline text-ink-soft hover:text-ink">What you get</a>
          <a href="/login" className="font-semibold text-signal">Client login</a>
        </nav>
      </header>

      {/* Hero */}
      <section className="max-w-[1080px] mx-auto px-4 sm:px-6 pt-10 sm:pt-16 pb-16 grid md:grid-cols-[1.15fr_1fr] gap-10 items-center">
        <div>
          <div className="inline-block text-[11.5px] font-semibold tracking-wide uppercase text-signal bg-signal-tint rounded-full px-3 py-1 mb-5">
            AI voice agents · made for India
          </div>
          <h1 className="font-display font-bold tracking-tight text-[36px] sm:text-[48px] leading-[1.05]">
            Every call answered.<br />Every lead followed up.
          </h1>
          <p className="text-[16px] sm:text-[17px] text-ink-soft mt-5 leading-relaxed max-w-[520px]">
            RANA AI picks up and places your business calls in Telugu, Hindi and English, captures what each caller needs,
            and hands the serious ones to your sales team within seconds — so nobody waits and nothing slips.
          </p>
          <div className="flex flex-wrap gap-3 mt-8">
            <a href={DEMO_MAILTO} className="bg-signal text-white rounded-lg px-5 py-3 text-[14px] font-semibold hover:opacity-90">Book a demo</a>
            <a href="#how" className="border border-line bg-raised rounded-lg px-5 py-3 text-[14px] font-semibold hover:border-ink-soft">See how it works</a>
          </div>
        </div>

        {/* Call card */}
        <div className="bg-raised border border-line rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-[12.5px] font-semibold">
              <span className="w-2 h-2 rounded-full bg-signal animate-pulse" /> Live call · Telugu
            </div>
            <span className="text-[11.5px] text-ink-soft">02:14</span>
          </div>
          <div className="flex flex-col gap-2.5 text-[13px] leading-relaxed">
            <div className="self-start max-w-[85%] bg-paper rounded-xl rounded-tl-sm px-3 py-2">Namaskaram! Cheppandi, ela help cheyyagalanu?</div>
            <div className="self-end max-w-[85%] bg-signal-tint rounded-xl rounded-tr-sm px-3 py-2">Next batch eppudu start avtundi? Fees entha?</div>
            <div className="self-start max-w-[85%] bg-paper rounded-xl rounded-tl-sm px-3 py-2">Next batch 6th October nundi. Mee year of passing cheptara?</div>
          </div>
          <div className="mt-4 border-t border-line pt-4 grid grid-cols-3 gap-2 text-[11.5px]">
            <div><div className="text-ink-soft">Interest</div><div className="font-semibold mt-0.5">Oct batch</div></div>
            <div><div className="text-ink-soft">Lead</div><div className="font-semibold mt-0.5 text-hot">Hot</div></div>
            <div><div className="text-ink-soft">Sent to</div><div className="font-semibold mt-0.5">Sales · Slack</div></div>
          </div>
        </div>
      </section>

      {/* Problem strip */}
      <section className="bg-ink text-white">
        <div className="max-w-[1080px] mx-auto px-4 sm:px-6 py-12 grid sm:grid-cols-3 gap-8">
          {[
            ["Missed after hours", "Enquiries that ring out at 9 pm go to whoever picks up first — often a competitor."],
            ["Slow callbacks", "A lead called back tomorrow is a lead that has already asked three other places."],
            ["Nothing written down", "Telecallers rarely log every call, so managers can't see what's being lost."],
          ].map(([t, b]) => (
            <div key={t}>
              <div className="font-display font-semibold text-[17px]">{t}</div>
              <div className="text-[13.5px] text-white/70 mt-2 leading-relaxed">{b}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How */}
      <section id="how" className="max-w-[1080px] mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <h2 className="font-display font-bold tracking-tight text-[28px] sm:text-[34px]">How it works</h2>
        <div className="grid md:grid-cols-3 gap-5 mt-8">
          {STEPS.map((s) => (
            <div key={s.n} className="bg-raised border border-line rounded-2xl p-6">
              <div className="font-display text-signal font-bold text-[14px]">{s.n}</div>
              <div className="font-semibold text-[16px] mt-2">{s.title}</div>
              <div className="text-[13.5px] text-ink-soft mt-2 leading-relaxed">{s.body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-line">
        <div className="max-w-[1080px] mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <h2 className="font-display font-bold tracking-tight text-[28px] sm:text-[34px]">What you get</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-8 mt-8">
            {FEATURES.map((f) => (
              <div key={f.title} className="border-l-2 border-signal pl-4">
                <div className="font-semibold text-[15px]">{f.title}</div>
                <div className="text-[13.5px] text-ink-soft mt-1.5 leading-relaxed">{f.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Who for */}
      <section className="max-w-[1080px] mx-auto px-4 sm:px-6 pb-16">
        <div className="bg-raised border border-line rounded-2xl p-6 sm:p-8">
          <div className="font-display font-semibold text-[18px]">Built for businesses that live on the phone</div>
          <div className="flex flex-wrap gap-2 mt-4">
            {FOR.map((f) => (
              <span key={f} className="text-[12.5px] border border-line bg-paper rounded-full px-3 py-1.5">{f}</span>
            ))}
          </div>
          <p className="text-[13.5px] text-ink-soft mt-5 leading-relaxed max-w-[640px]">
            Currently running a pilot with a medical-education coaching network in Hyderabad, handling inbound enquiries and
            outbound follow-ups to working doctors.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-signal text-white">
        <div className="max-w-[1080px] mx-auto px-4 sm:px-6 py-14 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div>
            <div className="font-display font-bold text-[26px] sm:text-[30px] tracking-tight">Hear it on your own calls.</div>
            <div className="text-white/80 text-[14px] mt-2">A 20-minute demo, set up with your script and your language.</div>
          </div>
          <a href={DEMO_MAILTO} className="bg-white text-signal rounded-lg px-5 py-3 text-[14px] font-semibold self-start sm:self-auto">Book a demo</a>
        </div>
      </section>

      <footer className="max-w-[1080px] mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row gap-2 justify-between text-[12px] text-ink-soft">
        <span>© {new Date().getFullYear()} RANA AI · Hyderabad</span>
        <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-ink">{CONTACT_EMAIL}</a>
      </footer>
    </div>
  );
}
