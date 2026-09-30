/** Plain-language messages for the program's error codes (6000 upward). */
export const PROGRAM_ERRORS: Record<number, string> = {
  6000: "New games and joins are paused right now. Games already in progress can still be finished.",
  6001: "That is not a valid move. Pick rock, paper or scissors.",
  6002: "That stake is below the minimum.",
  6003: "The stake on this game is different from what you saw. Refresh the lobby and try again.",
  6004: "This game is no longer in the right state for that. Someone may have acted first.",
  6005: "The move and salt do not match this game. Check that you restored the right backup.",
  6006: "You cannot join your own game.",
  6007: "The creator still has time to reveal. You can claim once the countdown ends.",
  6008: "This wallet is not allowed to do that on this game.",
  6009: "The fee wallet on this transaction does not match the game.",
  6010: "The fee wallet cannot play.",
  6011: "That fee is above the 10% maximum.",
  6012: "The reveal timeout must be between 1 minute and 24 hours.",
  6013: "That minimum stake is below the allowed floor.",
  6014: "That amount is too large for the program to handle.",
  6015: "This game changed after you loaded it. Refresh the lobby and try again.",
};

// Anchor codes for an account that is missing or closed.
const GAME_GONE_CODES = new Set([3007, 3012]);

function linesOf(error: unknown): string[] {
  if (typeof error === "string") return [error];
  if (typeof error !== "object" || error === null) return [];
  const record = error as { name?: unknown; message?: unknown; logs?: unknown };
  const lines: string[] = [];
  if (typeof record.name === "string") lines.push(record.name);
  if (typeof record.message === "string") lines.push(record.message);
  if (Array.isArray(record.logs)) {
    lines.push(...record.logs.filter((line): line is string => typeof line === "string"));
  }
  return lines;
}

function codeFrom(error: unknown, text: string): number | null {
  if (typeof error === "object" && error !== null) {
    const anchorCode = (error as { error?: { errorCode?: { number?: unknown } } }).error?.errorCode
      ?.number;
    if (typeof anchorCode === "number") return anchorCode;
  }
  const hex = /custom program error: 0x([0-9a-fA-F]+)/.exec(text);
  if (hex) return Number.parseInt(hex[1], 16);
  const numbered = /Error Number: (\d+)/.exec(text);
  if (numbered) return Number.parseInt(numbered[1], 10);
  return null;
}

/** Turns anything thrown while sending a transaction into a message for the player. */
export function explainError(error: unknown): string {
  const text = linesOf(error).join("\n");
  const code = codeFrom(error, text);
  if (code !== null) {
    if (PROGRAM_ERRORS[code]) return PROGRAM_ERRORS[code];
    if (GAME_GONE_CODES.has(code)) {
      return "This game no longer exists. It was already settled or cancelled.";
    }
  }

  if (/user rejected|rejected the request|WalletSign\w*Error/i.test(text)) {
    return "You cancelled the request in your wallet. Nothing was sent.";
  }
  if (/insufficient lamports|insufficient funds|no record of a prior credit/i.test(text)) {
    return "This wallet does not have enough devnet SOL for the stake and fees. Get some from the faucet and try again.";
  }
  if (/blockhash not found|block height exceeded|expired/i.test(text)) {
    return "The transaction expired before it was confirmed. Try again.";
  }
  if (/failed to fetch|network|429|timed? ?out/i.test(text)) {
    return "The devnet network did not respond. Check your connection and try again.";
  }

  if (typeof error === "string" && error) return error;
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong. Try again.";
}
