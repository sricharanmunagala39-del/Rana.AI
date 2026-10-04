// Industry experience pages (ranaai.in/for/<slug>): the data each industry fills in. Pure data — safe in the browser.

/** One job RANA can do inside an industry, with a sample call and the brief for a live demo of it. */
export type UseCase = {
  key: string;
  title: string;
  /** One line for the card. */
  line: string;
  /** "out": Rana calls the person. "in": the person calls the business. */
  dir: "in" | "out";
  /** Who the visitor plays in the live demo, e.g. "a job candidate". */
  who: string;
  /** What Rana must achieve on the call. */
  goal: string;
  /** Questions Rana asks, one at a time. */
  asks: string[];
  /** Outbound only: Rana's first line, no personal names. {biz} = the business name. */
  open?: string;
  /** Sample call. "ai" = Rana, "them" = the other person. {biz} = the business name. */
  sample: ["ai" | "them", string][];
  /** The CRM tag the sample call ends with. */
  outcome: string;
};

export type Industry = {
  slug: string;
  label: string;
  /** Two-letter mark shown in the industry menu. */
  mark: string;
  short: string;
  h1a: string; h1b: string; sub: string;
  /** The sample business used in samples and live demos when the visitor gives no website. */
  biz: string; bizLine: string;
  /** What the other side is called: candidate, buyer, parent, patient … */
  them: string;
  challenges: [string, string][];
  /** The journey RANA covers, left to right. */
  flow: string[];
  useCases: UseCase[];
  customize: string[];
  faq: [string, string][];
  seo: { title: string; description: string; keywords: string[] };
};

export const fill = (s: string, biz: string) => s.replace(/\{biz\}/g, biz);
