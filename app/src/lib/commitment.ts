import type { PublicKey } from "@solana/web3.js";
import type { Move } from "./moves";

/**
 * sha256(move_byte || salt || creator_pubkey), exactly what the program
 * recomputes at reveal. The creator key stops anyone reusing this commitment
 * in a game of their own.
 */
export async function commitmentFor(
  move: Move,
  salt: Uint8Array,
  creator: PublicKey,
): Promise<Uint8Array> {
  if (salt.length !== 32) {
    throw new Error("The salt must be exactly 32 bytes.");
  }
  const preimage = new Uint8Array(1 + 32 + 32);
  preimage[0] = move;
  preimage.set(salt, 1);
  preimage.set(creator.toBytes(), 33);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", preimage));
}
