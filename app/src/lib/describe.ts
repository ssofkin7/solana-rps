import { formatSol, shortAddress } from "./format";
import type { GameResult } from "./rps";

export type ResultSummary = {
  headline: string;
  /** How it went for the wallet looking at it. */
  tone: "win" | "loss" | "neutral";
};

/** One line on how a game ended, from the point of view of `wallet`. */
export function describeResult(result: GameResult, wallet: string | null): ResultSummary {
  if (result.kind === "cancelled") {
    return {
      headline:
        wallet === result.creator
          ? `Game cancelled. Your ${formatSol(result.stakeLamports)} SOL stake was refunded`
          : "Game cancelled. The stake was refunded",
      tone: "neutral",
    };
  }

  if (result.kind === "forfeited") {
    const payout = formatSol(result.payout);
    if (wallet === result.opponent) {
      return { headline: `You won ${payout} SOL by forfeit`, tone: "win" };
    }
    if (wallet === result.creator) {
      return {
        headline: `You lost ${formatSol(result.pot / 2n)} SOL by not revealing in time`,
        tone: "loss",
      };
    }
    return {
      headline: `${shortAddress(result.opponent)} won ${payout} SOL by forfeit`,
      tone: "neutral",
    };
  }

  if (result.outcome === "tie") {
    return { headline: "Tie. Both stakes were returned", tone: "neutral" };
  }

  const creatorWon = result.outcome === "creator";
  const winner = creatorWon ? result.creator : result.opponent;
  const loser = creatorWon ? result.opponent : result.creator;
  const payout = formatSol(creatorWon ? result.creatorPayout : result.opponentPayout);
  if (wallet === winner) return { headline: `You won ${payout} SOL`, tone: "win" };
  if (wallet === loser) {
    return { headline: `You lost ${formatSol(result.stakeLamports)} SOL`, tone: "loss" };
  }
  return { headline: `${shortAddress(winner)} won ${payout} SOL`, tone: "neutral" };
}
