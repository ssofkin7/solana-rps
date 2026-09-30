// One-time setup after a devnet deploy: creates the global Config account.
// Must be run by the program's upgrade authority (~/.config/solana/id.json).
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
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";
if (!RPC_URL.includes("devnet")) {
  throw new Error(`Refusing to run against ${RPC_URL}: this script is devnet only.`);
}

const BPF_LOADER_UPGRADEABLE = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");

const FEE_BPS = 250;
const MIN_STAKE_LAMPORTS = 10_000_000;
const REVEAL_TIMEOUT_SECONDS = 600;
// Keeps the buyback wallet rent-exempt so small fees are never waived.
const TREASURY_FLOAT_LAMPORTS = 0.01 * LAMPORTS_PER_SOL;

function loadKeypair(path: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
}

const solanaDir = join(homedir(), ".config", "solana");
const authority = loadKeypair(join(solanaDir, "id.json"));
const treasury = loadKeypair(join(solanaDir, "rps-buyback-devnet.json")).publicKey;

const connection = new Connection(RPC_URL, "confirmed");
const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(authority), {
  commitment: "confirmed",
});
const idl = JSON.parse(readFileSync("target/idl/rps.json", "utf8"));
const program = new anchor.Program(idl as anchor.Idl, provider);

const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
const [programData] = PublicKey.findProgramAddressSync(
  [program.programId.toBuffer()],
  BPF_LOADER_UPGRADEABLE,
);

console.log("Program: ", program.programId.toBase58());
console.log("Config:  ", config.toBase58());
console.log("Admin:   ", authority.publicKey.toBase58());
console.log("Treasury:", treasury.toBase58());

if (await connection.getAccountInfo(config)) {
  console.log("Config already exists; nothing to do.");
  process.exit(0);
}

if ((await connection.getBalance(treasury)) < TREASURY_FLOAT_LAMPORTS) {
  const fundTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: authority.publicKey,
      toPubkey: treasury,
      lamports: TREASURY_FLOAT_LAMPORTS,
    }),
  );
  const fundSig = await sendAndConfirmTransaction(connection, fundTx, [authority]);
  console.log("Funded treasury:", fundSig);
}

const signature = await program.methods
  .initializeConfig({
    feeBps: FEE_BPS,
    minStake: new BN(MIN_STAKE_LAMPORTS),
    revealTimeout: new BN(REVEAL_TIMEOUT_SECONDS),
  })
  .accountsStrict({
    authority: authority.publicKey,
    config,
    program: program.programId,
    programData,
    treasury,
    systemProgram: SystemProgram.programId,
  })
  .rpc();

console.log("Initialized config:", signature);
console.log(`https://explorer.solana.com/tx/${signature}?cluster=devnet`);
