import type { Metadata } from "next";
import "./landing.css";
import Site from "./Site";

export const metadata: Metadata = {
  title: { absolute: "RANA AI — We build what answers back" },
  description:
    "AI employees that answer and place your business calls in 11 Indian languages, qualify every lead as hot, warm or cold, and hand your team only the calls worth making. 14-day free trial.",
  openGraph: {
    title: "RANA AI — We build what answers back",
    description: "AI phone employees for Indian businesses. 11 languages. Inbound + outbound. Live in days.",
    type: "website",
  },
};

export default function LandingPage() {
  return <Site />;
}
