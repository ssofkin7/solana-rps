import { describe, expect, it } from "vitest";
import { describeResult } from "./describe";
import type { GameResult } from "./rps";

const CREATOR = "DeDGEc6itNb78RVUSpWoQQbnoEkgJcFCfDfambdtY7XF";
const OPPONENT = "8Besg2ve5XhT7X9ckA3H96CnER9bBW7TwbincQ6QFTcu";
const STRANGER = "Fmi151zsEHFgRJeUXNgDjbo4aLA6PRQ63ktWM6sCEgkA";

const settled: GameResult = {
  kind: "settled",
  game: "game",
  creator: CREATOR,
  opponent: OPPONENT,
  creatorMove: 1,
  opponentMove: 0,
  outcome: "creator",
  stakeLamports: 10_000_000n,
  creatorPayout: 19_500_000n,
  opponentPayout: 0n,
  fee: 500_000n,
};

describe("describeResult", () => {
  it("tells the winner what they won", () => {
    expect(describeResult(settled, CREATOR)).toEqual({
      headline: "You won 0.0195 SOL",
      tone: "win",
    });
  });

  it("tells the loser what they lost", () => {
    expect(describeResult(settled, OPPONENT)).toEqual({
      headline: "You lost 0.01 SOL",
      tone: "loss",
    });
  });

  it("names the winner for someone who was not playing", () => {
    expect(describeResult(settled, STRANGER)).toEqual({
      headline: "DeDG…Y7XF won 0.0195 SOL",
      tone: "neutral",
    });
    expect(describeResult(settled, null).tone).toBe("neutral");
  });

  it("handles an opponent win", () => {
    const opponentWon: GameResult = {
      ...settled,
      outcome: "opponent",
      creatorPayout: 0n,
      opponentPayout: 19_500_000n,
    };
    expect(describeResult(opponentWon, OPPONENT).headline).toBe("You won 0.0195 SOL");
    expect(describeResult(opponentWon, CREATOR).headline).toBe("You lost 0.01 SOL");
  });

  it("describes a tie the same way for everyone", () => {
    const tie: GameResult = {
      ...settled,
      outcome: "tie",
      creatorPayout: 10_000_000n,
      opponentPayout: 10_000_000n,
      fee: 0n,
    };
    expect(describeResult(tie, CREATOR)).toEqual({
      headline: "Tie. Both stakes were returned",
      tone: "neutral",
    });
  });

  it("describes a forfeit from both sides", () => {
    const forfeited: GameResult = {
      kind: "forfeited",
      game: "game",
      creator: CREATOR,
      opponent: OPPONENT,
      pot: 20_000_000n,
      payout: 19_500_000n,
      fee: 500_000n,
    };
    expect(describeResult(forfeited, OPPONENT)).toEqual({
      headline: "You won 0.0195 SOL by forfeit",
      tone: "win",
    });
    expect(describeResult(forfeited, CREATOR)).toEqual({
      headline: "You lost 0.01 SOL by not revealing in time",
      tone: "loss",
    });
    expect(describeResult(forfeited, STRANGER).headline).toBe(
      "8Bes…FTcu won 0.0195 SOL by forfeit",
    );
  });

  it("describes a cancelled game", () => {
    const cancelled: GameResult = {
      kind: "cancelled",
      game: "game",
      creator: CREATOR,
      stakeLamports: 10_000_000n,
    };
    expect(describeResult(cancelled, CREATOR)).toEqual({
      headline: "Game cancelled. Your 0.01 SOL stake was refunded",
      tone: "neutral",
    });
    expect(describeResult(cancelled, STRANGER).headline).toBe(
      "Game cancelled. The stake was refunded",
    );
  });
});
