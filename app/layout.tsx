import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "RANA AI — AI employees that call your leads", template: "%s · RANA AI" },
  description: "RANA AI answers and places your business calls in 11 Indian languages, qualifies every lead and hands the hot ones to your team.",
  icons: { icon: "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2DE1C2"/><stop offset="1" stop-color="#9284FF"/></linearGradient></defs><rect width="32" height="32" rx="9" fill="#090C13"/><circle cx="16" cy="16" r="7" fill="none" stroke="url(#g)" stroke-width="3"/><circle cx="16" cy="16" r="2.4" fill="#2DE1C2"/></svg>') },
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
