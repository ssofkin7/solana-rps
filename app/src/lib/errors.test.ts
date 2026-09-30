import { describe, expect, it } from "vitest";
import { explainError, PROGRAM_ERRORS } from "./errors";

describe("explainError", () => {
  it("has a plain message for every program error code", () => {
    for (let code = 6000; code <= 6015; code++) {
      expect(PROGRAM_ERRORS[code], `code ${code}`).toBeTruthy();
    }
  });

  it("reads the code from an Anchor error object", () => {
    const error = { error: { errorCode: { number: 6005, code: "CommitmentMismatch" } } };
    expect(explainError(error)).toBe(PROGRAM_ERRORS[6005]);
  });

  it("reads the code from a simulation log line", () => {
    const error = new Error(
      "Transaction simulation failed: Error processing Instruction 0: custom program error: 0x177f",
    );
    expect(explainError(error)).toBe(PROGRAM_ERRORS[6015]);
  });

  it("reads the code from attached logs", () => {
    const error = Object.assign(new Error("failed"), {
      logs: ["Program log: AnchorError occurred. Error Code: Paused. Error Number: 6000."],
    });
    expect(explainError(error)).toBe(PROGRAM_ERRORS[6000]);
  });

  it("explains a game that no longer exists", () => {
    const error = { error: { errorCode: { number: 3012, code: "AccountNotInitialized" } } };
    expect(explainError(error)).toMatch(/no longer exists/i);
  });

  it("explains a wallet rejection", () => {
    expect(explainError(new Error("User rejected the request."))).toMatch(/cancelled/i);
    const named = Object.assign(new Error("x"), { name: "WalletSignTransactionError" });
    expect(explainError(named)).toMatch(/cancelled/i);
  });

  it("explains an empty wallet", () => {
    const error = new Error(
      "Transaction simulation failed: Attempt to debit an account but found no record of a prior credit.",
    );
    expect(explainError(error)).toMatch(/devnet SOL/i);
    const transfer = Object.assign(new Error("failed"), {
      logs: ["Transfer: insufficient lamports 5000, need 10000000"],
    });
    expect(explainError(transfer)).toMatch(/devnet SOL/i);
  });

  it("explains an expired transaction and a network failure", () => {
    expect(explainError(new Error("Blockhash not found"))).toMatch(/expired/i);
    expect(explainError(new TypeError("Failed to fetch"))).toMatch(/network/i);
  });

  it("falls back to the original message", () => {
    expect(explainError(new Error("Something odd"))).toBe("Something odd");
    expect(explainError("plain text")).toBe("plain text");
    expect(explainError(undefined)).toMatch(/went wrong/i);
  });
});
