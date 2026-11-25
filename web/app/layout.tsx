import type { Metadata } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import type { ReactNode } from "react";
import { Header } from "@/components/Header";
import { Providers } from "@/components/Providers";
import "./globals.css";

const barlow = Barlow({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-barlow" });
const sign = Barlow_Condensed({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-sign" });

export const metadata: Metadata = {
  title: "Mandrail",
  description: "On-chain guard for AI agents that trade tokenized real-world assets. Testnet demo with test assets.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${barlow.variable} ${sign.variable}`}>
      <body>
        <Providers>
          <Header />
          {children}
        </Providers>
      </body>
    </html>
  );
}
