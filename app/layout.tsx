import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

/**
 * Inter is the fallback the brand direction names for an internal tool, used
 * here because the repository carries no licensed copy of eToro's official
 * product typeface. Swapping it is a change to this declaration and the
 * `--font-sans` token in `globals.css`, nothing else.
 *
 * `display: "swap"` renders the fallback stack immediately rather than
 * blocking first paint on a webfont - a briefing page that arrives blank is
 * worse than one that reflows.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "eToro M&A Intelligence Agent",
  description:
    "Internal M&A intelligence for eToro Corporate Development: monitored fintech targets, evidence-backed profiles and deterministic strategic scoring.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-canvas text-primary">{children}</body>
    </html>
  );
}
