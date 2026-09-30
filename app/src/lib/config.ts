import { PublicKey } from "@solana/web3.js";

/** This app only ever talks to devnet. */
export const CLUSTER = "devnet";

export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";

export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID || "Fmi151zsEHFgRJeUXNgDjbo4aLA6PRQ63ktWM6sCEgkA",
);

export const FAUCET_URL = "https://faucet.solana.com";

export function explorerTx(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=${CLUSTER}`;
}

export function explorerAddress(address: string): string {
  return `https://explorer.solana.com/address/${address}?cluster=${CLUSTER}`;
}
