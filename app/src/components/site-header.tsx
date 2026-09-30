"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Hand } from "./hand";
import { FAUCET_URL } from "@/lib/config";

// The wallet button reads browser state, so it only renders on the client.
const WalletButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((module) => module.WalletMultiButton),
  { ssr: false, loading: () => <span className="button opacity-60">Wallet</span> },
);

const LINKS = [
  { href: "/", label: "Lobby" },
  { href: "/create", label: "Create game" },
  { href: "/games", label: "My games" },
];

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header>
      <div className="bg-stake px-4 py-2 text-center text-[0.95rem] font-medium text-night">
        Devnet only. This is test SOL with no real value.{" "}
        <a
          className="underline underline-offset-4"
          href={FAUCET_URL}
          target="_blank"
          rel="noreferrer"
        >
          Get free devnet SOL from the faucet
        </a>
      </div>
      <div className="on-ink bg-ink text-paper">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4">
          <Link href="/" className="flex items-center gap-1 text-stake" aria-label="Solana RPS, lobby">
            <Hand move={0} size={30} />
            <Hand move={1} size={30} />
            <Hand move={2} size={30} />
          </Link>
          <nav aria-label="Main" className="flex flex-1 flex-wrap gap-x-5 gap-y-1">
            {LINKS.map((link) => {
              const current = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={current ? "page" : undefined}
                  className={`font-display text-lg font-semibold underline-offset-8 hover:underline ${
                    current ? "underline decoration-stake decoration-4" : ""
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
