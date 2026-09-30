import { createHash } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { commitmentFor } from "./commitment";

const creator = new PublicKey("DeDGEc6itNb78RVUSpWoQQbnoEkgJcFCfDfambdtY7XF");
const salt = new Uint8Array(32).fill(42);

describe("commitmentFor", () => {
  it("is sha256(move || salt || creator), the formula the program checks", async () => {
    // node:crypto is an independent implementation of the same formula the
    // devnet smoke test proved against the deployed program.
    const expected = createHash("sha256")
      .update(Buffer.from([1]))
      .update(salt)
      .update(creator.toBuffer())
      .digest();
    expect(Buffer.from(await commitmentFor(1, salt, creator))).toEqual(expected);
  });

  it("changes with the move, the salt and the creator", async () => {
    const base = Buffer.from(await commitmentFor(0, salt, creator)).toString("hex");
    const otherSalt = new Uint8Array(32).fill(43);
    const otherCreator = new PublicKey("8Besg2ve5XhT7X9ckA3H96CnER9bBW7TwbincQ6QFTcu");
    expect(Buffer.from(await commitmentFor(1, salt, creator)).toString("hex")).not.toBe(base);
    expect(Buffer.from(await commitmentFor(0, otherSalt, creator)).toString("hex")).not.toBe(base);
    expect(Buffer.from(await commitmentFor(0, salt, otherCreator)).toString("hex")).not.toBe(base);
  });

  it("rejects a salt that is not 32 bytes", async () => {
    await expect(commitmentFor(0, new Uint8Array(31), creator)).rejects.toThrow(/32 bytes/);
  });
});
