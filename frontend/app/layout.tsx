import "./globals.css";
import { Providers } from "./providers";
import { AppShell } from "@/components/app-shell";
import type { Metadata } from "next";
import type { ReactNode } from "react";

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
    <html lang="en">
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
