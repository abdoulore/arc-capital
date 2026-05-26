import "./globals.css";
import { Providers } from "./providers";
import { AppShell } from "@/components/app-shell";
import type { Metadata } from "next";
import { DM_Mono, DM_Serif_Display, Geist } from "next/font/google";
import type { ReactNode } from "react";

const dmSerif = DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-display",
});

const geist = Geist({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-body",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Arc Capital",
  description: "Private banking, onchain.",
  icons: {
    icon: "/arc-capital-logo.png",
    apple: "/arc-capital-logo.png",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${dmSerif.variable} ${geist.variable} ${dmMono.variable}`}>
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
