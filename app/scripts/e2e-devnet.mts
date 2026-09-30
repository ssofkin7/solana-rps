// Drives the same chain client the browser uses, against devnet, with two
// throwaway wallets: one full game (create, join, reveal) and one cancelled
// game. Funds come from ~/.config/solana/id.json and leftovers are swept back.
import { AnchorProvider, Wallet } from "@anchor-lang/core";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { PROGRAM_ID, RPC_URL, explorerTx } from "../src/lib/config";
import {
  cancelGame,
  createGame,
  fetchConfig,
  fetchGame,
  fetchHistory,
  fetchMyGames,
  fetchOpenGames,
  fetchResult,
  findSettlement,
  joinGame,
  prepareGame,
  programFor,
  revealGame,
} from "../src/lib/rps";
import { actionsFor } from "../src/lib/status";

if (!RPC_URL.includes("devnet")) {
  throw new Error(`Refusing to run against ${RPC_URL}: this script is devnet only.`);
}

const STAKE = BigInt(0.01 * LAMPORTS_PER_SOL);
const WALLET_FLOAT = 0.05 * LAMPORTS_PER_SOL;
const TX_FEE = 5_000;

const connection = new Connection(RPC_URL, "confirmed");
const funder = Keypair.fromSecretKey(
  Uint8Array.from(
    JSON.parse(readFileSync(join(homedir(), ".config", "solana", "id.json"), "utf8")),
  ),
);

function programAs(signer: Keypair) {
  const provider = new AnchorProvider(connection, new Wallet(signer), { commitment: "confirmed" });
  return programFor(provider, PROGRAM_ID);
}

const now = () => Math.floor(Date.now() / 1000);

const creator = Keypair.generate();
const opponent = Keypair.generate();
await sendAndConfirmTransaction(
  connection,
  new Transaction().add(
    ...[creator, opponent].map((wallet) =>
      SystemProgram.transfer({
        fromPubkey: funder.publicKey,
        toPubkey: wallet.publicKey,
        lamports: WALLET_FLOAT,
      }),
    ),
  ),
  [funder],
);

const asCreator = programAs(creator);
const asOpponent = programAs(opponent);

const config = await fetchConfig(asCreator);
console.log("config  ", config);
assert.equal(config.paused, false);
assert.ok(STAKE >= config.minStakeLamports);

// Game 1: creator plays scissors, opponent plays rock, opponent wins.
const secret = prepareGame(PROGRAM_ID, creator.publicKey, 2, STAKE, now());
console.log("create  ", explorerTx(await createGame(asCreator, secret)));

const open = await fetchOpenGames(asOpponent);
const listed = open.find((game) => game.address === secret.game);
assert.ok(listed, "the new game should appear in the lobby");
assert.equal(listed.stakeLamports, STAKE);
assert.equal(actionsFor(listed, opponent.publicKey.toBase58(), now(), false).canJoin, true);
assert.equal(actionsFor(listed, creator.publicKey.toBase58(), now(), true).canCancel, true);

console.log("join    ", explorerTx(await joinGame(asOpponent, opponent.publicKey, listed, 0)));

const mine = await fetchMyGames(asCreator, creator.publicKey);
const joined = mine.find((game) => game.address === secret.game);
assert.ok(joined, "the game should appear in the games of its creator");
assert.equal(joined.status, "joined");
assert.equal(joined.opponent, opponent.publicKey.toBase58());
assert.equal(joined.opponentMove, 0);
assert.ok(
  (await fetchMyGames(asOpponent, opponent.publicKey)).some((g) => g.address === secret.game),
);
assert.equal(actionsFor(joined, creator.publicKey.toBase58(), now(), true).canReveal, true);

const revealSignature = await revealGame(asCreator, joined, secret);
console.log("reveal  ", explorerTx(revealSignature));

const result = await fetchResult(asOpponent, revealSignature);
console.log("result  ", result);
assert.ok(result && result.kind === "settled");
assert.equal(result.outcome, "opponent");
assert.equal(result.creatorMove, 2);
assert.equal(result.opponentMove, 0);
const fee = (STAKE * BigInt(2) * BigInt(config.feeBps)) / BigInt(10_000);
assert.equal(result.fee, fee);
assert.equal(result.opponentPayout, STAKE * BigInt(2) - fee);
assert.equal(result.creatorPayout, BigInt(0));

assert.equal(await fetchGame(asOpponent, new PublicKey(secret.game)), null, "game is closed");
const found = await findSettlement(asOpponent, new PublicKey(secret.game));
assert.equal(found?.signature, revealSignature, "the opponent can find the settlement");
const history = await fetchHistory(asOpponent, new PublicKey(secret.game));
console.log("history ", history.map((entry) => entry.label).join(" > "));
assert.deepEqual(
  history.map((entry) => entry.label),
  ["Created", "Joined", "Revealed"],
);

// Game 2: created, then cancelled.
const second = prepareGame(PROGRAM_ID, creator.publicKey, 1, STAKE, now());
await createGame(asCreator, second);
const secondGame = await fetchGame(asCreator, new PublicKey(second.game));
assert.ok(secondGame);
const cancelSignature = await cancelGame(asCreator, secondGame);
console.log("cancel  ", explorerTx(cancelSignature));
const cancelled = await fetchResult(asCreator, cancelSignature);
assert.ok(cancelled && cancelled.kind === "cancelled");
assert.equal(cancelled.stakeLamports, STAKE);

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
console.log("End-to-end check passed.");
