import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://ranaai.in"),
  title: { default: "RANA AI — AI Voice Agents for Indian Businesses", template: "%s · RANA AI" },
  description: "RANA AI answers and places your business calls in 11 Indian languages, qualifies every lead and hands the hot ones to your team.",
  applicationName: "RANA AI",
  openGraph: { type: "website", siteName: "RANA AI", locale: "en_IN" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#090C13",
};

// Runs before paint so there is no flash of the wrong theme.
const THEME_BOOT = `document.documentElement.classList.add('js');try{var t=localStorage.getItem('rana_theme');if(t==='light')document.documentElement.setAttribute('data-theme','light');}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  );
}
