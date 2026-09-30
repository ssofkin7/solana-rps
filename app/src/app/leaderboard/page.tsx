"use client";

import Link from "next/link";
import { useCallback } from "react";
import { Hand } from "@/components/hand";
import { describeResult } from "@/lib/describe";
import { formatAge, formatNet, formatSol, shortAddress } from "@/lib/format";
import { useNow, usePolling, usePrograms } from "@/lib/hooks";
import { rankPlayers, totalsFor } from "@/lib/leaderboard";
import { parseRecent } from "@/lib/recent";
import { fetchAllStats } from "@/lib/rps";

async function loadRecent() {
  const response = await fetch("/api/recent");
  if (!response.ok) throw new Error("Devnet did not respond. Try again shortly.");
  return parseRecent(await response.text());
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export default function LeaderboardPage() {
  const { reader, wallet } = usePrograms();
  const now = useNow();

  const loadStats = useCallback(() => fetchAllStats(reader), [reader]);
  const stats = usePolling(loadStats, 30_000);
  const recent = usePolling(loadRecent, 60_000);

  const ranked = stats.data ? rankPlayers(stats.data) : [];
  const totals = stats.data ? totalsFor(stats.data) : null;
  const mine = ranked.find((entry) => entry.player === wallet);

  return (
    <>
      <h1 className="text-5xl font-extrabold text-ink sm:text-6xl">Leaderboard</h1>
      <p className="mt-4 max-w-2xl text-lg">
        Every result is recorded on-chain by the program itself, so nobody can edit this table.
        Players are ranked by how much SOL they are up.
      </p>
      {totals && totals.games > 0 && (
        <p className="mt-3 max-w-2xl text-muted">
          {plural(totals.players, "player")} have finished {plural(totals.games, "game")} since the leaderboard started, staking{" "}
          {formatSol(totals.staked)} SOL. {formatSol(totals.fees)} SOL has gone to the buyback
          wallet.
        </p>
      )}

      {wallet && stats.data && !mine && (
        <p className="mt-6 rounded-xl border-2 border-dashed border-night px-4 py-3">
          You are not on the board yet. Finish a game to get a place.{" "}
          <Link href="/" className="underline underline-offset-4">
            Find a game
          </Link>
        </p>
      )}
      {mine && (
        <p className="mt-6 rounded-xl border-2 border-night bg-stake px-4 py-3 font-medium">
          You are number {mine.rank} of {ranked.length}, {formatNet(mine.net)} SOL over{" "}
          {plural(mine.games, "game")}.
        </p>
      )}

      <section className="mt-10" aria-labelledby="rankings">
        <h2 id="rankings" className="sr-only">
          Rankings
        </h2>
        {stats.error && (
          <p role="alert" className="rounded-xl border-2 border-alarm bg-sheet px-4 py-3">
            Could not load the leaderboard. {stats.error}
          </p>
        )}
        {stats.loading && !stats.data && <p className="text-muted">Loading the leaderboard.</p>}
        {stats.data && ranked.length === 0 && (
          <p className="text-lg">No games have finished yet. Win the first one.</p>
        )}
        {ranked.length > 0 && (
          <div className="overflow-x-auto rounded-2xl border-2 border-night bg-sheet">
            <table className="w-full min-w-[34rem] border-collapse text-left">
              <thead>
                <tr className="border-b-2 border-night">
                  <th scope="col" className="px-4 py-3 font-display">
                    Rank
                  </th>
                  <th scope="col" className="px-4 py-3 font-display">
                    Player
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-display">
                    Net SOL
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-display">
                    Won, lost, tied
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-display">
                    Games
                  </th>
                </tr>
              </thead>
              <tbody>
                {ranked.slice(0, 100).map((entry) => {
                  const you = entry.player === wallet;
                  return (
                    <tr
                      key={entry.player}
                      className={`border-b border-rule last:border-b-0 ${you ? "bg-stake" : ""}`}
                    >
                      <td className="figure px-4 py-3 text-xl font-bold text-ink">
                        {entry.rank}
                      </td>
                      <td className="px-4 py-3">
                        {shortAddress(entry.player)}
                        {you && <span className="ml-2 font-semibold">(you)</span>}
                        {entry.forfeits > 0 && (
                          <span className="block text-sm text-muted">
                            {plural(entry.forfeits, "forfeit")}
                          </span>
                        )}
                      </td>
                      <td
                        className={`figure px-4 py-3 text-right text-lg font-bold ${
                          entry.net < 0n ? "text-alarm" : "text-ink"
                        }`}
                      >
                        {formatNet(entry.net)}
                      </td>
                      <td className="figure px-4 py-3 text-right">
                        {entry.wins}, {entry.losses}, {entry.ties}
                      </td>
                      <td className="figure px-4 py-3 text-right">{entry.games}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-14" aria-labelledby="recent">
        <h2 id="recent" className="text-3xl font-bold">
          Recent games
        </h2>
        {recent.error && !recent.data && (
          <p role="alert" className="mt-4 rounded-xl border-2 border-alarm bg-sheet px-4 py-3">
            Could not load recent games. {recent.error}
          </p>
        )}
        {recent.loading && !recent.data && (
          <p className="mt-4 text-muted">Loading recent games from devnet.</p>
        )}
        {recent.data?.length === 0 && <p className="mt-4">No finished games yet.</p>}
        <ul className="mt-4 divide-y-2 divide-rule border-y-2 border-rule">
          {recent.data?.map(({ signature, blockTime, result }) => {
            if (result.kind === "cancelled") return null;
            const summary = describeResult(result, wallet);
            return (
              <li key={signature} className="flex flex-wrap items-center gap-x-5 gap-y-2 py-3">
                <span className="flex items-center gap-1 text-ink" aria-hidden="true">
                  <Hand move={result.kind === "settled" ? result.creatorMove : -1} size={34} />
                  <span className="px-1 text-sm text-muted">vs</span>
                  <Hand move={result.kind === "settled" ? result.opponentMove : -1} size={34} />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`font-display text-lg font-semibold ${
                      summary.tone === "loss" ? "text-alarm" : ""
                    }`}
                  >
                    {summary.headline}
                  </span>
                  <span className="block text-sm text-muted">
                    {shortAddress(result.creator)} against {shortAddress(result.opponent)}
                    {blockTime ? `, ${formatAge(now - blockTime)}` : ""}
                  </span>
                </span>
                <Link href={`/result/${signature}`} className="underline underline-offset-4">
                  See the game
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
