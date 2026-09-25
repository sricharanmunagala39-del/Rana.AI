import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Start your free trial — AI voice agent in 11 Indian languages",
  description: "Create your RANA AI workspace: 14 days and 100 minutes free, no card needed. Build and test an AI calling agent in Telugu, Hindi, Tamil and more.",
  alternates: { canonical: "/signup" },
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
