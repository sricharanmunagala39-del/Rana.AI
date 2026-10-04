// ranaai.in/for — pick your industry.
import type { Metadata } from "next";
import "../landing/landing.css";
import { INDUSTRY_LIST } from "../industries";
import IndustryHub from "../industries/ui/IndustryHub";

export const metadata: Metadata = {
  title: { absolute: "Industries — AI Voice Agents for Your Industry | RANA AI" },
  description: "Pick your industry — HR & recruitment, real estate, education, healthcare, BFSI, retail, hospitality, automotive or IT — and see, hear and try exactly what RANA AI does for it.",
  alternates: { canonical: "/for" },
};

export default function IndustriesPage() {
  const items = INDUSTRY_LIST.map((i) => ({ slug: i.slug, label: i.label, mark: i.mark, short: i.short, h1a: i.h1a, count: i.useCases.length, top: i.useCases.slice(0, 3).map((u) => u.title) }));
  return <IndustryHub items={items} />;
}
