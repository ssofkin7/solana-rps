import { isMove, type Move } from "./moves";

/**
 * Everything the creator needs to reveal. Losing it means the game can only
 * end in a forfeit, so it is kept in localStorage and in a downloaded backup.
 */
export type Secret = {
  game: string;
  creator: string;
  gameId: string;
  move: Move;
  /** 32 bytes as hex. */
  salt: string;
  stakeLamports: string;
  /** Unix seconds. */
  createdAt: number;
};

/** The subset of `Storage` used here, so tests can pass an in-memory stand-in. */
export type KeyValueStore = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

const KEY_PREFIX = "rps:secret:";
const BACKUP_KIND = "solana-rps-backup";

export function newSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) {
    throw new Error("Not a hex string.");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function saveSecret(store: KeyValueStore, secret: Secret): void {
  store.setItem(KEY_PREFIX + secret.game, JSON.stringify(secret));
}

export function loadSecret(store: KeyValueStore, game: string): Secret | null {
  const raw = store.getItem(KEY_PREFIX + game);
  if (raw === null) return null;
  try {
    return validate(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function listSecrets(store: KeyValueStore): Secret[] {
  const secrets: Secret[] = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (!key?.startsWith(KEY_PREFIX)) continue;
    const secret = loadSecret(store, key.slice(KEY_PREFIX.length));
    if (secret) secrets.push(secret);
  }
  return secrets;
}

export function removeSecret(store: KeyValueStore, game: string): void {
  store.removeItem(KEY_PREFIX + game);
}

export function backupFileFor(secret: Secret): { filename: string; contents: string } {
  return {
    filename: `rps-backup-${secret.game.slice(0, 8)}.json`,
    contents: JSON.stringify({ kind: BACKUP_KIND, ...secret }, null, 2),
  };
}

/** Throws an `Error` with a message fit to show the player. */
export function parseBackup(text: string): Secret {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("This is not a backup file from this game.");
  }
  return validate(parsed);
}

function validate(value: unknown): Secret {
  if (typeof value !== "object" || value === null) {
    throw new Error("This is not a backup file from this game.");
  }
  const record = value as Record<string, unknown>;
  if (typeof record.game !== "string" || record.game.length < 32) {
    throw new Error("The backup has no game address.");
  }
  if (typeof record.salt !== "string" || !/^[0-9a-fA-F]{64}$/.test(record.salt)) {
    throw new Error("The backup has a missing or damaged salt.");
  }
  if (!isMove(record.move)) {
    throw new Error("The backup has an invalid move.");
  }
  return {
    game: record.game,
    creator: typeof record.creator === "string" ? record.creator : "",
    gameId: typeof record.gameId === "string" ? record.gameId : "",
    move: record.move,
    salt: record.salt.toLowerCase(),
    stakeLamports: typeof record.stakeLamports === "string" ? record.stakeLamports : "0",
    createdAt: typeof record.createdAt === "number" ? record.createdAt : 0,
  };
}
