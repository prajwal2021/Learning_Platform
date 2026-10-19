import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { bootScript } from "@/lib/prefs";

/** <html> and <body> for every root layout: fonts, and the theme and appearance applied before the first paint. */
export default function RootDocument({ children, legacyFonts = false }: { children: React.ReactNode; legacyFonts?: boolean }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
        <meta name="theme-color" content="#06070d" />
        {legacyFonts ? (
          <>
            {/* the legacy pages use IBM Plex Mono for their command blocks */}
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
            {/* eslint-disable-next-line @next/next/no-page-custom-font */}
            <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
          </>
        ) : null}
      </head>
      <body>{children}</body>
    </html>
  );
}
