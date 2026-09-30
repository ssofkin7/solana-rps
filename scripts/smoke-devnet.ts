// Plays one real game on devnet with two throwaway wallets to prove the
// deployed program works end to end: create (rock), join (paper), reveal.
// Funds come from ~/.config/solana/id.json and the leftovers are swept back.
import * as anchor from "@anchor-lang/core";
import BN from "bn.js";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";
if (!RPC_URL.includes("devnet")) {
  throw new Error(`Refusing to run against ${RPC_URL}: this script is devnet only.`);
}

const ROCK = 0;
const PAPER = 1;
const STAKE = 0.01 * LAMPORTS_PER_SOL;
const WALLET_FLOAT = 0.03 * LAMPORTS_PER_SOL;
const TX_FEE = 5_000;

const funder = Keypair.fromSecretKey(
  Uint8Array.from(
    JSON.parse(readFileSync(join(homedir(), ".config", "solana", "id.json"), "utf8")),
  ),
);
const connection = new Connection(RPC_URL, "confirmed");
const idl = JSON.parse(readFileSync("target/idl/rps.json", "utf8"));

function programFor(signer: Keypair) {
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(signer), {
    commitment: "confirmed",
  });
  return new anchor.Program(idl as anchor.Idl, provider);
}

function link(signature: string) {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

const creator = Keypair.generate();
const opponent = Keypair.generate();

const fundSig = await sendAndConfirmTransaction(
  connection,
  new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: funder.publicKey,
      toPubkey: creator.publicKey,
      lamports: WALLET_FLOAT,
    }),
    SystemProgram.transfer({
      fromPubkey: funder.publicKey,
      toPubkey: opponent.publicKey,
      lamports: WALLET_FLOAT,
    }),
  ),
  [funder],
);
console.log("fund    ", link(fundSig));

const program = programFor(creator);
const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
const configAccount = await (program.account as any).config.fetch(config);
const treasury: PublicKey = configAccount.treasury;

const gameId = new BN(randomBytes(8), "le");
const [game] = PublicKey.findProgramAddressSync(
  [Buffer.from("game"), creator.publicKey.toBuffer(), gameId.toArrayLike(Buffer, "le", 8)],
  program.programId,
);
const salt = randomBytes(32);
const commitment = createHash("sha256")
  .update(Buffer.from([ROCK]))
  .update(salt)
  .update(creator.publicKey.toBuffer())
  .digest();

const createSig = await program.methods
  .createGame(gameId, new BN(STAKE), [...commitment])
  .accountsStrict({
    creator: creator.publicKey,
    config,
    game,
    systemProgram: SystemProgram.programId,
  })
  .rpc();
console.log("create  ", link(createSig));

const joinSig = await programFor(opponent)
  .methods.joinGame(PAPER, new BN(STAKE), [...commitment])
  .accountsStrict({
    opponent: opponent.publicKey,
    config,
    game,
    systemProgram: SystemProgram.programId,
  })
  .rpc();
console.log("join    ", link(joinSig));

const opponentBefore = await connection.getBalance(opponent.publicKey);
const treasuryBefore = await connection.getBalance(treasury);

const revealSig = await program.methods
  .reveal(ROCK, [...salt])
  .accountsStrict({
    creator: creator.publicKey,
    game,
    opponent: opponent.publicKey,
    treasury,
  })
  .rpc();
console.log("reveal  ", link(revealSig));

const pot = 2 * STAKE;
const expectedFee = Math.floor((pot * configAccount.feeBps) / 10_000);
const opponentGain = (await connection.getBalance(opponent.publicKey)) - opponentBefore;
const treasuryGain = (await connection.getBalance(treasury)) - treasuryBefore;
const gameGone = (await connection.getAccountInfo(game)) === null;

console.log(`opponent gained ${opponentGain} lamports (expected ${pot - expectedFee})`);
console.log(`treasury gained ${treasuryGain} lamports (expected ${expectedFee})`);
console.log(`game account closed: ${gameGone}`);

// Sweep what is left back to the funder.
for (const wallet of [creator, opponent]) {
  const balance = await connection.getBalance(wallet.publicKey);
  if (balance > TX_FEE) {
    await sendAndConfirmTransaction(
      connection,
      new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: funder.publicKey,
          lamports: balance - TX_FEE,
        }),
      ),
      [wallet],
    );
  }
}

if (opponentGain !== pot - expectedFee || treasuryGain !== expectedFee || !gameGone) {
  throw new Error("Smoke test FAILED: balances or game state are not what the program promises.");
}
console.log("Smoke test passed.");
