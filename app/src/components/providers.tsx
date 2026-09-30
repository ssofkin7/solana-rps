"use client";

import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { Buffer } from "buffer";
import { useMemo, type ReactNode } from "react";
import { RPC_URL } from "@/lib/config";

import "@solana/wallet-adapter-react-ui/styles.css";

// The Anchor client expects Node's Buffer to exist as a global.
if (typeof globalThis.Buffer === "undefined") {
  globalThis.Buffer = Buffer;
}

export function Providers({ children }: { children: ReactNode }) {
  // Phantom and Solflare are listed so they show up even before they are
  // installed. Backpack, and any other Wallet Standard wallet, registers itself.
  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={RPC_URL} config={{ commitment: "confirmed" }}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
