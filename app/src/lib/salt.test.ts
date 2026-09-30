import { beforeEach, describe, expect, it } from "vitest";
import {
  backupFileFor,
  fromHex,
  listSecrets,
  loadSecret,
  newSalt,
  parseBackup,
  removeSecret,
  saveSecret,
  toHex,
  type Secret,
} from "./salt";

class MemoryStorage {
  private items = new Map<string, string>();
  get length() {
    return this.items.size;
  }
  key(index: number) {
    return [...this.items.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.items.set(key, value);
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
  clear() {
    this.items.clear();
  }
}

const secret: Secret = {
  game: "Ea7DkC7AGUVv1e9dfQKY6QEBHYsDT3rGcQhs1rXRARPf",
  creator: "DeDGEc6itNb78RVUSpWoQQbnoEkgJcFCfDfambdtY7XF",
  gameId: "1234567890123456789",
  move: 2,
  salt: "2a".repeat(32),
  stakeLamports: "10000000",
  createdAt: 1_790_000_000,
};

let storage: MemoryStorage;
beforeEach(() => {
  storage = new MemoryStorage();
});

describe("newSalt", () => {
  it("returns 32 random bytes that differ between calls", () => {
    const a = newSalt();
    const b = newSalt();
    expect(a).toHaveLength(32);
    expect(toHex(a)).not.toBe(toHex(b));
  });
});

describe("hex", () => {
  it("round trips", () => {
    const bytes = new Uint8Array([0, 1, 15, 16, 255]);
    expect(toHex(bytes)).toBe("00010f10ff");
    expect(fromHex("00010f10ff")).toEqual(bytes);
  });
  it("rejects text that is not hex", () => {
    expect(() => fromHex("zz")).toThrow();
    expect(() => fromHex("abc")).toThrow();
  });
});

describe("secret storage", () => {
  it("saves and loads a secret by game address", () => {
    saveSecret(storage, secret);
    expect(loadSecret(storage, secret.game)).toEqual(secret);
  });
  it("returns null for a game with no secret", () => {
    expect(loadSecret(storage, secret.game)).toBeNull();
  });
  it("returns null when the stored value is corrupt", () => {
    storage.setItem(`rps:secret:${secret.game}`, "{not json");
    expect(loadSecret(storage, secret.game)).toBeNull();
  });
  it("lists only secrets, ignoring other keys", () => {
    storage.setItem("something-else", "1");
    saveSecret(storage, secret);
    saveSecret(storage, { ...secret, game: "8Besg2ve5XhT7X9ckA3H96CnER9bBW7TwbincQ6QFTcu" });
    expect(listSecrets(storage).map((s) => s.game).sort()).toEqual(
      ["8Besg2ve5XhT7X9ckA3H96CnER9bBW7TwbincQ6QFTcu", secret.game].sort(),
    );
  });
  it("removes a secret", () => {
    saveSecret(storage, secret);
    removeSecret(storage, secret.game);
    expect(loadSecret(storage, secret.game)).toBeNull();
  });
});

describe("backup files", () => {
  it("round trips through a backup file", () => {
    const file = backupFileFor(secret);
    expect(file.filename).toBe("rps-backup-Ea7DkC7A.json");
    expect(parseBackup(file.contents)).toEqual(secret);
  });
  it("rejects a file that is not JSON", () => {
    expect(() => parseBackup("hello")).toThrow(/not a backup file/i);
  });
  it("rejects a backup with a missing or malformed salt", () => {
    const broken = JSON.parse(backupFileFor(secret).contents);
    broken.salt = "abcd";
    expect(() => parseBackup(JSON.stringify(broken))).toThrow(/salt/i);
    delete broken.salt;
    expect(() => parseBackup(JSON.stringify(broken))).toThrow(/salt/i);
  });
  it("rejects a backup with an invalid move", () => {
    const broken = JSON.parse(backupFileFor(secret).contents);
    broken.move = 3;
    expect(() => parseBackup(JSON.stringify(broken))).toThrow(/move/i);
  });
  it("rejects a backup with no game address", () => {
    const broken = JSON.parse(backupFileFor(secret).contents);
    delete broken.game;
    expect(() => parseBackup(JSON.stringify(broken))).toThrow(/game/i);
  });
});
