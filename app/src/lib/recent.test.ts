import { describe, expect, it } from "vitest";
import { parseRecent, serializeRecent } from "./recent";
import type { RecentResult } from "./rps";

describe("recent results over JSON", () => {
  it("round trips the lamport amounts, which JSON cannot hold as BigInt", () => {
    const recent: RecentResult[] = [
      {
        signature: "sig-1",
        blockTime: 1_790_000_000,
        result: {
          kind: "settled",
          game: "g",
          creator: "c",
          opponent: "o",
          creatorMove: 1,
          opponentMove: 0,
          outcome: "creator",
          stakeLamports: 10_000_000n,
          creatorPayout: 19_500_000n,
          opponentPayout: 0n,
          fee: 500_000n,
        },
      },
      {
        signature: "sig-2",
        blockTime: null,
        result: {
          kind: "forfeited",
          game: "g2",
          creator: "c",
          opponent: "o",
          pot: 20_000_000n,
          payout: 19_500_000n,
          fee: 500_000n,
        },
      },
    ];
    expect(parseRecent(serializeRecent(recent))).toEqual(recent);
  });

  it("returns an empty list for anything unexpected", () => {
    expect(parseRecent("not json")).toEqual([]);
    expect(parseRecent('{"a":1}')).toEqual([]);
  });
});
