import type { Metadata } from "next";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import { RevealWatcher } from "@/components/reveal-watcher";
import { SiteHeader } from "@/components/site-header";
import { explorerAddress, PROGRAM_ID } from "@/lib/config";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
});

const instrument = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument",
});

export const metadata: Metadata = {
  title: "Solana RPS: rock, paper, scissors for SOL (devnet)",
  description:
    "Wager devnet SOL on rock, paper, scissors. Moves are sealed with a commit-reveal scheme, so nobody can peek.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${bricolage.variable} ${instrument.variable}`}>
      <body className="min-h-screen antialiased">
        <Providers>
          <SiteHeader />
          <main className="mx-auto max-w-4xl px-4 pb-24 pt-10">{children}</main>
          <footer className="mx-auto max-w-4xl px-4 pb-10 text-[0.95rem] text-muted">
            Unaudited software running on Solana devnet.{" "}
            <a
              className="underline underline-offset-4"
              href={explorerAddress(PROGRAM_ID.toBase58())}
              target="_blank"
              rel="noreferrer"
            >
              View the program on Solana Explorer
            </a>
          </footer>
          <RevealWatcher />
        </Providers>
      </body>
    </html>
  );
}
