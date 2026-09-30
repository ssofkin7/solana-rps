import { describe, expect, it } from "vitest";
import { rankPlayers, totalsFor, type PlayerStatsView } from "./leaderboard";

function player(name: string, overrides: Partial<PlayerStatsView>): PlayerStatsView {
  return {
    player: name,
    games: 1,
    wins: 0,
    losses: 0,
    ties: 0,
    forfeits: 0,
    staked: 10_000_000n,
    received: 0n,
    feesPaid: 0n,
    ...overrides,
  };
}

describe("rankPlayers", () => {
  it("orders by net SOL won, best first", () => {
    const ranked = rankPlayers([
      player("loser", { losses: 1, received: 0n }),
      player("winner", { wins: 1, received: 19_500_000n }),
      player("even", { ties: 1, received: 10_000_000n }),
    ]);
    expect(ranked.map((p) => p.player)).toEqual(["winner", "even", "loser"]);
    expect(ranked.map((p) => p.net)).toEqual([9_500_000n, 0n, -10_000_000n]);
    expect(ranked.map((p) => p.rank)).toEqual([1, 2, 3]);
  });

  it("breaks a tie in net by wins, then by fewer games", () => {
    const ranked = rankPlayers([
      player("more-games", { games: 3, wins: 1, staked: 30_000_000n, received: 40_000_000n }),
      player("more-wins", { games: 3, wins: 2, staked: 30_000_000n, received: 40_000_000n }),
      player("fewer-games", { games: 2, wins: 1, staked: 20_000_000n, received: 30_000_000n }),
    ]);
    expect(ranked.map((p) => p.player)).toEqual(["more-wins", "fewer-games", "more-games"]);
  });

  it("gives players with identical records the same rank", () => {
    const ranked = rankPlayers([
      player("a", { wins: 1, received: 19_500_000n }),
      player("b", { wins: 1, received: 19_500_000n }),
      player("c", { losses: 1 }),
    ]);
    expect(ranked.map((p) => p.rank)).toEqual([1, 1, 3]);
  });

  it("leaves out players whose only games were cancelled", () => {
    const ranked = rankPlayers([player("idle", { games: 0, staked: 0n }), player("x", {})]);
    expect(ranked.map((p) => p.player)).toEqual(["x"]);
  });
});

describe("totalsFor", () => {
  it("counts each game once even though both players record it", () => {
    const totals = totalsFor([
      player("winner", { wins: 1, received: 19_500_000n, feesPaid: 500_000n }),
      player("loser", { losses: 1 }),
      player("idle", { games: 0, staked: 0n }),
    ]);
    expect(totals).toEqual({
      players: 2,
      games: 1,
      staked: 20_000_000n,
      fees: 500_000n,
    });
  });
});
