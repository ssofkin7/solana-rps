/** One player's on-chain stats account, decoded. */
export type PlayerStatsView = {
  player: string;
  games: number;
  wins: number;
  losses: number;
  ties: number;
  /** Games lost by not revealing in time. */
  forfeits: number;
  staked: bigint;
  received: bigint;
  feesPaid: bigint;
};

export type RankedPlayer = PlayerStatsView & {
  rank: number;
  /** Received minus staked. Negative when the player is down. */
  net: bigint;
};

function compare(a: RankedPlayer, b: RankedPlayer): number {
  if (a.net !== b.net) return a.net > b.net ? -1 : 1;
  if (a.wins !== b.wins) return b.wins - a.wins;
  if (a.games !== b.games) return a.games - b.games;
  return a.player.localeCompare(b.player);
}

/**
 * Best first: most SOL won, then most wins, then fewest games. Players with
 * the same net, wins and games share a rank. Players whose only games were
 * cancelled are left out.
 */
export function rankPlayers(stats: PlayerStatsView[]): RankedPlayer[] {
  const sorted = stats
    .filter((entry) => entry.games > 0)
    .map((entry) => ({ ...entry, rank: 0, net: entry.received - entry.staked }))
    .sort(compare);

  sorted.forEach((entry, index) => {
    const previous = sorted[index - 1];
    const same =
      previous !== undefined &&
      previous.net === entry.net &&
      previous.wins === entry.wins &&
      previous.games === entry.games;
    entry.rank = same ? previous.rank : index + 1;
  });
  return sorted;
}

export type Totals = { players: number; games: number; staked: bigint; fees: bigint };

export function totalsFor(stats: PlayerStatsView[]): Totals {
  const active = stats.filter((entry) => entry.games > 0);
  // Both players record every game, so each is counted twice.
  const playerGames = active.reduce((sum, entry) => sum + entry.games, 0);
  return {
    players: active.length,
    games: Math.floor(playerGames / 2),
    staked: active.reduce((sum, entry) => sum + entry.staked, 0n),
    fees: active.reduce((sum, entry) => sum + entry.feesPaid, 0n),
  };
}
