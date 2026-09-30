// Everything that talks to the chain. Nothing here knows about React or about
// which wallet is connected: each function takes an Anchor `Program`, so the
// same code runs in the browser and in the devnet end-to-end script.
import { type Idl, Program, type Provider } from "@anchor-lang/core";
import {
  type Connection,
  PublicKey,
  SystemProgram,
  type TransactionSignature,
} from "@solana/web3.js";
import BN from "bn.js";
import { Buffer } from "buffer";
import idl from "../idl/rps.json";
import type { Rps } from "../idl/rps";
import { commitmentFor } from "./commitment";
import type { PlayerStatsView } from "./leaderboard";
import { isMove, type Move, type Outcome } from "./moves";
import { fromHex, newSalt, type Secret, toHex } from "./salt";
import type { GameView } from "./status";

export type RpsProgram = Program<Rps>;

// Byte offsets in the Game account, fixed by the program's field order.
const STATUS_OFFSET = 8;
const CREATOR_OFFSET = 9;
const OPPONENT_OFFSET = 41;
// Base58 of the single byte 0x00, the Open status.
const OPEN_STATUS_BASE58 = "1";

export type ConfigView = {
  treasury: string;
  feeBps: number;
  minStakeLamports: bigint;
  revealTimeout: number;
  paused: boolean;
};

export type GameResult =
  | {
      kind: "settled";
      game: string;
      creator: string;
      opponent: string;
      creatorMove: number;
      opponentMove: number;
      outcome: Outcome;
      stakeLamports: bigint;
      creatorPayout: bigint;
      opponentPayout: bigint;
      fee: bigint;
    }
  | {
      kind: "forfeited";
      game: string;
      creator: string;
      opponent: string;
      pot: bigint;
      payout: bigint;
      fee: bigint;
    }
  | { kind: "cancelled"; game: string; creator: string; stakeLamports: bigint };

export type HistoryEntry = {
  signature: string;
  /** Unix seconds, when the cluster reports it. */
  blockTime: number | null;
  label: "Created" | "Joined" | "Revealed" | "Cancelled" | "Forfeit claimed" | "Transaction";
  failed: boolean;
};

/** `provider` may be a full wallet provider, or just `{ connection }` for reading. */
export function programFor(provider: Provider, programId: PublicKey): RpsProgram {
  return new Program({ ...(idl as Idl), address: programId.toBase58() } as Rps, provider);
}

export function configAddress(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("config")], programId)[0];
}

/** Each player's lifetime stats account, created on their first game. */
export function statsAddress(programId: PublicKey, player: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("stats"), player.toBuffer()], programId)[0];
}

export function gameAddress(programId: PublicKey, creator: PublicKey, gameId: bigint): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("game"), creator.toBuffer(), new BN(gameId.toString()).toArrayLike(Buffer, "le", 8)],
    programId,
  )[0];
}

function toBigInt(value: BN): bigint {
  return BigInt(value.toString());
}

function variantOf(value: unknown): string {
  return typeof value === "object" && value !== null ? (Object.keys(value)[0] ?? "") : "";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Anchor returns decoded accounts loosely typed.
function decodeGame(address: PublicKey, account: any): GameView {
  const joined = variantOf(account.status) === "joined";
  return {
    address: address.toBase58(),
    status: joined ? "joined" : "open",
    creator: account.creator.toBase58(),
    opponent: joined ? account.opponent.toBase58() : null,
    treasury: account.treasury.toBase58(),
    gameId: toBigInt(account.gameId),
    stakeLamports: toBigInt(account.stake),
    commitment: Uint8Array.from(account.commitment),
    opponentMove: joined ? account.opponentMove : null,
    createdAt: account.createdAt.toNumber(),
    joinedAt: account.joinedAt.toNumber(),
    feeBps: account.feeBps,
    revealTimeout: account.revealTimeout.toNumber(),
  };
}

export async function fetchConfig(program: RpsProgram): Promise<ConfigView> {
  const config = await program.account.config.fetch(configAddress(program.programId));
  return {
    treasury: config.treasury.toBase58(),
    feeBps: config.feeBps,
    minStakeLamports: toBigInt(config.minStake),
    revealTimeout: config.revealTimeout.toNumber(),
    paused: config.paused,
  };
}

/** Games nobody has joined yet, newest first. */
export async function fetchOpenGames(program: RpsProgram): Promise<GameView[]> {
  const accounts = await program.account.game.all([
    { memcmp: { offset: STATUS_OFFSET, bytes: OPEN_STATUS_BASE58 } },
  ]);
  return accounts
    .map(({ publicKey, account }) => decodeGame(publicKey, account))
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Live games where `wallet` is the creator or the opponent, newest first. */
export async function fetchMyGames(program: RpsProgram, wallet: PublicKey): Promise<GameView[]> {
  const bytes = wallet.toBase58();
  const [created, joined] = await Promise.all([
    program.account.game.all([{ memcmp: { offset: CREATOR_OFFSET, bytes } }]),
    program.account.game.all([{ memcmp: { offset: OPPONENT_OFFSET, bytes } }]),
  ]);
  const byAddress = new Map<string, GameView>();
  for (const { publicKey, account } of [...created, ...joined]) {
    byAddress.set(publicKey.toBase58(), decodeGame(publicKey, account));
  }
  return [...byAddress.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export async function fetchGame(program: RpsProgram, address: PublicKey): Promise<GameView | null> {
  const account = await program.account.game.fetchNullable(address);
  return account ? decodeGame(address, account) : null;
}

/**
 * Picks the salt and game id and works out the game address, without sending
 * anything. The caller must store the returned secret and have the player
 * download a backup before calling `createGame`.
 */
export function prepareGame(
  programId: PublicKey,
  creator: PublicKey,
  move: Move,
  stakeLamports: bigint,
  nowSeconds: number,
): Secret {
  const idBytes = crypto.getRandomValues(new Uint8Array(8));
  const gameId = BigInt(new BN(idBytes, "le").toString());
  return {
    game: gameAddress(programId, creator, gameId).toBase58(),
    creator: creator.toBase58(),
    gameId: gameId.toString(),
    move,
    salt: toHex(newSalt()),
    stakeLamports: stakeLamports.toString(),
    createdAt: nowSeconds,
  };
}

export async function createGame(
  program: RpsProgram,
  secret: Secret,
): Promise<TransactionSignature> {
  const creator = new PublicKey(secret.creator);
  const commitment = await commitmentFor(secret.move, fromHex(secret.salt), creator);
  return program.methods
    .createGame(new BN(secret.gameId), new BN(secret.stakeLamports), [...commitment])
    .accountsStrict({
      creator,
      config: configAddress(program.programId),
      game: new PublicKey(secret.game),
      creatorStats: statsAddress(program.programId, creator),
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}

/**
 * Joins the game exactly as the player saw it. The program rejects the join
 * if the stake or the commitment changed in the meantime.
 */
export async function joinGame(
  program: RpsProgram,
  opponent: PublicKey,
  game: GameView,
  move: Move,
): Promise<TransactionSignature> {
  return program.methods
    .joinGame(move, new BN(game.stakeLamports.toString()), [...game.commitment])
    .accountsStrict({
      opponent,
      config: configAddress(program.programId),
      game: new PublicKey(game.address),
      opponentStats: statsAddress(program.programId, opponent),
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}

export async function revealGame(
  program: RpsProgram,
  game: GameView,
  secret: Secret,
): Promise<TransactionSignature> {
  if (game.opponent === null) {
    throw new Error("Nobody has joined this game yet, so there is nothing to reveal.");
  }
  return program.methods
    .reveal(secret.move, [...fromHex(secret.salt)])
    .accountsStrict({
      creator: new PublicKey(game.creator),
      game: new PublicKey(game.address),
      opponent: new PublicKey(game.opponent),
      treasury: new PublicKey(game.treasury),
      ...statsAccountsFor(program.programId, game.creator, game.opponent),
    })
    .rpc();
}

export async function cancelGame(
  program: RpsProgram,
  game: GameView,
): Promise<TransactionSignature> {
  return program.methods
    .cancelGame()
    .accountsStrict({
      creator: new PublicKey(game.creator),
      game: new PublicKey(game.address),
    })
    .rpc();
}

export async function claimForfeit(
  program: RpsProgram,
  game: GameView,
): Promise<TransactionSignature> {
  if (game.opponent === null) {
    throw new Error("Nobody has joined this game, so there is no forfeit to claim.");
  }
  return program.methods
    .claimForfeit()
    .accountsStrict({
      opponent: new PublicKey(game.opponent),
      game: new PublicKey(game.address),
      creator: new PublicKey(game.creator),
      treasury: new PublicKey(game.treasury),
      ...statsAccountsFor(program.programId, game.creator, game.opponent),
    })
    .rpc();
}

function statsAccountsFor(programId: PublicKey, creator: string, opponent: string) {
  return {
    creatorStats: statsAddress(programId, new PublicKey(creator)),
    opponentStats: statsAddress(programId, new PublicKey(opponent)),
    systemProgram: SystemProgram.programId,
  };
}

/** Every player stats account on the program. */
export async function fetchAllStats(program: RpsProgram): Promise<PlayerStatsView[]> {
  const accounts = await program.account.playerStats.all();
  return accounts.map(({ account }) => ({
    player: account.player.toBase58(),
    games: account.games.toNumber(),
    wins: account.wins.toNumber(),
    losses: account.losses.toNumber(),
    ties: account.ties.toNumber(),
    forfeits: account.forfeits.toNumber(),
    staked: toBigInt(account.staked),
    received: toBigInt(account.received),
    feesPaid: toBigInt(account.feesPaid),
  }));
}

export type RecentResult = {
  signature: string;
  /** Unix seconds, when the cluster reports it. */
  blockTime: number | null;
  result: GameResult;
};

/**
 * The most recently finished games, newest first, read from the program's
 * transaction history. Cancelled games are left out.
 */
export async function fetchRecentResults(
  program: RpsProgram,
  limit: number,
): Promise<RecentResult[]> {
  const connection = program.provider.connection;
  const signatures = (
    await connection.getSignaturesForAddress(program.programId, { limit: SCAN_LIMIT }, "confirmed")
  ).filter((info) => !info.err);

  // One transaction at a time with backoff: the public devnet endpoint limits
  // transaction lookups hard. Stop as soon as there are enough results.
  const results: RecentResult[] = [];
  for (const info of signatures) {
    if (results.length >= limit) break;
    const tx = await withRetry(() =>
      connection.getTransaction(info.signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      }),
    );
    if (!tx) continue;
    const result = resultFrom(eventsFromLogs(program, tx.meta?.logMessages ?? []));
    if (result && result.kind !== "cancelled") {
      results.push({ signature: info.signature, blockTime: tx.blockTime ?? null, result });
    }
  }
  return results;
}

const SCAN_LIMIT = 40;

async function withRetry<T>(action: () => Promise<T>, attempts = 6): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await action();
    } catch (error) {
      if (attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 700 * attempt));
    }
  }
}

type ParsedEvent = { name: string; data: Record<string, unknown> };

async function eventsIn(
  program: RpsProgram,
  connection: Connection,
  signature: string,
): Promise<{ events: ParsedEvent[]; blockTime: number | null; failed: boolean } | null> {
  const tx = await connection.getTransaction(signature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  if (!tx) return null;
  return {
    events: eventsFromLogs(program, tx.meta?.logMessages ?? []),
    blockTime: tx.blockTime ?? null,
    failed: tx.meta?.err != null,
  };
}

function eventsFromLogs(program: RpsProgram, logs: string[]): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  for (const line of logs) {
    const encoded = /^Program data: (.+)$/.exec(line)?.[1];
    if (!encoded) continue;
    const decoded = program.coder.events.decode(encoded);
    if (decoded) {
      events.push({
        name: decoded.name.toLowerCase(),
        data: decoded.data as Record<string, unknown>,
      });
    }
  }
  return events;
}

function key(value: unknown): string {
  return (value as PublicKey).toBase58();
}

function amount(value: unknown): bigint {
  return toBigInt(value as BN);
}

function resultFrom(events: ParsedEvent[]): GameResult | null {
  for (const { name, data } of events) {
    if (name === "gamesettled") {
      const variant = variantOf(data.outcome).toLowerCase();
      const outcome: Outcome =
        variant === "creatorwins" ? "creator" : variant === "opponentwins" ? "opponent" : "tie";
      return {
        kind: "settled",
        game: key(data.game),
        creator: key(data.creator),
        opponent: key(data.opponent),
        creatorMove: data.creatorMove as number,
        opponentMove: data.opponentMove as number,
        outcome,
        stakeLamports: amount(data.stake),
        creatorPayout: amount(data.creatorPayout),
        opponentPayout: amount(data.opponentPayout),
        fee: amount(data.fee),
      };
    }
    if (name === "gameforfeited") {
      return {
        kind: "forfeited",
        game: key(data.game),
        creator: key(data.creator),
        opponent: key(data.opponent),
        pot: amount(data.pot),
        payout: amount(data.payout),
        fee: amount(data.fee),
      };
    }
    if (name === "gamecancelled") {
      return {
        kind: "cancelled",
        game: key(data.game),
        creator: key(data.creator),
        stakeLamports: amount(data.stake),
      };
    }
  }
  return null;
}

const EVENT_LABELS: Record<string, HistoryEntry["label"]> = {
  gamecreated: "Created",
  gamejoined: "Joined",
  gamesettled: "Revealed",
  gamecancelled: "Cancelled",
  gameforfeited: "Forfeit claimed",
};

/** How the game ended, read from the transaction that ended it. Null if it did not end a game. */
export async function fetchResult(
  program: RpsProgram,
  signature: string,
): Promise<GameResult | null> {
  const parsed = await eventsIn(program, program.provider.connection, signature);
  return parsed ? resultFrom(parsed.events) : null;
}

/** Every transaction that touched the game account, oldest first. */
export async function fetchHistory(program: RpsProgram, game: PublicKey): Promise<HistoryEntry[]> {
  const connection = program.provider.connection;
  const signatures = await connection.getSignaturesForAddress(game, { limit: 20 }, "confirmed");
  const entries: HistoryEntry[] = [];
  for (const info of signatures.reverse()) {
    const parsed = await eventsIn(program, connection, info.signature);
    const label = parsed?.events.map((e) => EVENT_LABELS[e.name]).find(Boolean) ?? "Transaction";
    entries.push({
      signature: info.signature,
      blockTime: info.blockTime ?? null,
      label,
      failed: info.err != null,
    });
  }
  return entries;
}

/**
 * Finds how a game that no longer exists ended. Used when the other player
 * settled it, so this browser never saw the transaction.
 */
export async function findSettlement(
  program: RpsProgram,
  game: PublicKey,
): Promise<{ signature: string; result: GameResult } | null> {
  const connection = program.provider.connection;
  const signatures = await connection.getSignaturesForAddress(game, { limit: 20 }, "confirmed");
  for (const info of signatures) {
    if (info.err) continue;
    const parsed = await eventsIn(program, connection, info.signature);
    const result = parsed ? resultFrom(parsed.events) : null;
    if (result) return { signature: info.signature, result };
  }
  return null;
}

export { isMove };
