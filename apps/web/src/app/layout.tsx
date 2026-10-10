import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Instrument_Sans, Newsreader } from "next/font/google";
import "./globals.css";

const serif = Newsreader({ subsets: ["latin"], variable: "--font-newsreader", axes: ["opsz"], style: ["normal", "italic"], display: "swap" });
const sans = Instrument_Sans({ subsets: ["latin"], variable: "--font-instrument", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Graspchain — proof of comprehension", template: "%s · Graspchain" },
  description:
    "Read a short article, explain it in your own words, and get a typed, explainable score with feedback — committed on-chain as a receipt anyone can verify.",
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = { themeColor: "#f3f0e8", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-ink focus:px-3 focus:py-2 focus:text-paper"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
