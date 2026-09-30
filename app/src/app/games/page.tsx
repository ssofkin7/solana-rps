"use client";

import { PublicKey } from "@solana/web3.js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Hand } from "@/components/hand";
import { TxStatus } from "@/components/tx-status";
import { describeResult } from "@/lib/describe";
import { explainError } from "@/lib/errors";
import { formatAge, formatCountdown, formatSol, shortAddress } from "@/lib/format";
import {
  useNow,
  usePolling,
  usePrograms,
  useSecrets,
  useTx,
  useWatchedGames,
} from "@/lib/hooks";
import { forgetSecret, storeSecret } from "@/lib/local";
import { moveName } from "@/lib/moves";
import {
  cancelGame,
  claimForfeit,
  fetchMyGames,
  findSettlement,
  type GameResult,
  revealGame,
  type RpsProgram,
} from "@/lib/rps";
import { parseBackup, type Secret } from "@/lib/salt";
import { actionsFor, type GameView } from "@/lib/status";

const POLL_MS = 8_000;

function LiveGame({
  game,
  wallet,
  signer,
  secret,
  now,
  onChanged,
}: {
  game: GameView;
  wallet: string;
  signer: RpsProgram;
  secret: Secret | undefined;
  now: number;
  onChanged: () => void;
}) {
  const router = useRouter();
  const tx = useTx();
  const actions = actionsFor(game, wallet, now, Boolean(secret));

  const finish = async (label: string, action: () => Promise<string>) => {
    const signature = await tx.run(label, action);
    if (signature) {
      forgetSecret(game.address);
      router.push(`/result/${signature}`);
    } else {
      onChanged();
    }
  };

  const late = actions.secondsLeft === 0;

  return (
    <li className="ticket">
      <div className="ticket-stub">
        <p className="figure text-3xl font-bold text-ink">{formatSol(game.stakeLamports)}</p>
        <p className="text-sm text-muted">SOL stake</p>
      </div>
      <div className="ticket-body">
        <div className="min-w-0 flex-1 basis-64">
          {game.status === "open" && (
            <>
              <p className="font-display text-xl font-semibold">Waiting for an opponent</p>
              <p className="text-muted">
                Opened {formatAge(now - game.createdAt)}.
                {secret && ` You played ${moveName(secret.move)}.`} Cancel it before you step
                away.
              </p>
            </>
          )}

          {game.status === "joined" && actions.role === "creator" && (
            <>
              <p className="font-display text-xl font-semibold">Your turn to reveal</p>
              <p className="text-muted">
                {shortAddress(game.opponent ?? "")} played {moveName(game.opponentMove ?? -1)}.
                {secret && ` You played ${moveName(secret.move)}.`}
              </p>
              <p className={`figure mt-1 text-2xl font-bold ${late ? "text-alarm" : "text-ink"}`}>
                {late ? "Time is up" : `${formatCountdown(actions.secondsLeft ?? 0)} left`}
              </p>
              {late && (
                <p className="text-alarm">
                  Your opponent can now claim the pot. Reveal before they do.
                </p>
              )}
              {actions.needsSecret && (
                <p role="alert" className="mt-2 text-alarm">
                  This browser has no move and secret code for this game. Restore your backup
                  file below to reveal.
                </p>
              )}
            </>
          )}

          {game.status === "joined" && actions.role === "opponent" && (
            <>
              <p className="font-display text-xl font-semibold">
                {actions.canClaimForfeit
                  ? "The creator did not reveal in time"
                  : "Waiting for the creator to reveal"}
              </p>
              <p className="flex items-center gap-2 text-muted">
                <Hand move={game.opponentMove ?? -1} size={28} className="text-ink" />
                You played {moveName(game.opponentMove ?? -1)} against{" "}
                {shortAddress(game.creator)}.
              </p>
              {!actions.canClaimForfeit && (
                <p className="figure mt-1 text-2xl font-bold text-ink">
                  {formatCountdown(actions.secondsLeft ?? 0)} until you can claim
                </p>
              )}
            </>
          )}

          <div className="mt-3 empty:hidden">
            <TxStatus state={tx.state} />
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {actions.canReveal && secret && (
            <button
              className="button button-stake"
              disabled={tx.busy}
              onClick={() => finish("Reveal", () => revealGame(signer, game, secret))}
            >
              Reveal my move
            </button>
          )}
          {actions.canCancel && (
            <button
              className="button"
              disabled={tx.busy}
              onClick={() => finish("Cancel game", () => cancelGame(signer, game))}
            >
              Cancel and refund
            </button>
          )}
          {actions.canClaimForfeit && (
            <button
              className="button button-stake"
              disabled={tx.busy}
              onClick={() => finish("Claim the pot", () => claimForfeit(signer, game))}
            >
              Claim the pot
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

type Finished = { signature: string; result: GameResult } | "unknown";

export default function MyGamesPage() {
  const { reader, signer, wallet } = usePrograms();
  const secrets = useSecrets();
  const watched = useWatchedGames();
  const now = useNow();

  const loadGames = useCallback(
    () => (wallet ? fetchMyGames(reader, new PublicKey(wallet)) : Promise.resolve([])),
    [reader, wallet],
  );
  const games = usePolling(wallet ? loadGames : null, POLL_MS);

  // Games this browser took part in that no longer exist on-chain were
  // settled, possibly by the other player. Look up how each one ended.
  const [finished, setFinished] = useState<Record<string, Finished>>({});
  const liveAddresses = games.data?.map((game) => game.address).join(",") ?? null;

  useEffect(() => {
    if (liveAddresses === null) return;
    const live = new Set(liveAddresses.split(","));
    const pending = watched.filter((address) => !live.has(address) && !(address in finished));
    if (pending.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const address of pending) {
        let entry: Finished = "unknown";
        try {
          entry = (await findSettlement(reader, new PublicKey(address))) ?? "unknown";
        } catch {
          // Leave it unknown; the next visit tries again.
        }
        if (cancelled) return;
        setFinished((current) => ({ ...current, [address]: entry }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [liveAddresses, watched, finished, reader]);

  const [restoreMessage, setRestoreMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const restore = async (file: File | undefined) => {
    if (!file) return;
    try {
      const secret = parseBackup(await file.text());
      storeSecret(secret);
      setRestoreMessage({
        ok: true,
        text: `Backup restored for game ${shortAddress(secret.game)}. You can reveal it now.`,
      });
    } catch (error) {
      setRestoreMessage({ ok: false, text: explainError(error) });
    }
  };

  const finishedRows = watched
    .map((address) => ({ address, entry: finished[address] }))
    .filter(
      (row): row is { address: string; entry: { signature: string; result: GameResult } } =>
        typeof row.entry === "object" &&
        (row.entry.result.creator === wallet ||
          ("opponent" in row.entry.result && row.entry.result.opponent === wallet)),
    );

  return (
    <>
      <h1 className="text-5xl font-extrabold text-ink">My games</h1>

      {!wallet && (
        <p className="mt-6 text-lg">
          Connect a wallet to see the games you created or joined.
        </p>
      )}

      {wallet && (
        <>
          {games.error && (
            <p role="alert" className="mt-6 rounded-xl border-2 border-alarm bg-sheet px-4 py-3">
              Could not load your games. {games.error}
            </p>
          )}
          {games.loading && !games.data && <p className="mt-6 text-muted">Loading your games.</p>}

          {games.data?.length === 0 && (
            <div className="mt-6 rounded-2xl border-2 border-dashed border-night px-6 py-10">
              <p className="font-display text-2xl font-semibold">No games in progress.</p>
              <p className="mt-2">Join one from the lobby or create your own.</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href="/" className="button">
                  Open the lobby
                </Link>
                <Link href="/create" className="button button-stake">
                  Create a game
                </Link>
              </div>
            </div>
          )}

          <ul className="mt-6 grid gap-4">
            {signer &&
              games.data?.map((game) => (
                <LiveGame
                  key={game.address}
                  game={game}
                  wallet={wallet}
                  signer={signer}
                  secret={secrets[game.address]}
                  now={now}
                  onChanged={games.refresh}
                />
              ))}
          </ul>

          {finishedRows.length > 0 && (
            <section className="mt-12" aria-labelledby="finished">
              <h2 id="finished" className="text-3xl font-bold">
                Finished
              </h2>
              <ul className="mt-4 divide-y-2 divide-rule border-y-2 border-rule">
                {finishedRows.map(({ address, entry }) => {
                  const summary = describeResult(entry.result, wallet);
                  return (
                    <li
                      key={address}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <span
                        className={`font-display text-lg font-semibold ${
                          summary.tone === "win"
                            ? "text-ink"
                            : summary.tone === "loss"
                              ? "text-alarm"
                              : ""
                        }`}
                      >
                        {summary.headline}
                      </span>
                      <Link
                        href={`/result/${entry.signature}`}
                        className="underline underline-offset-4"
                      >
                        See the result
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section className="mt-12 max-w-2xl" aria-labelledby="restore">
            <h2 id="restore" className="text-3xl font-bold">
              Restore a backup
            </h2>
            <p className="mt-2">
              On a new browser, or after clearing your data, load the backup file you downloaded
              when you created the game. It lets you reveal again.
            </p>
            <label className="button mt-4 cursor-pointer">
              Choose backup file
              <input
                type="file"
                accept="application/json,.json"
                className="sr-only"
                onChange={(event) => {
                  restore(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
            {restoreMessage && (
              <p
                role={restoreMessage.ok ? "status" : "alert"}
                className={`mt-3 ${restoreMessage.ok ? "text-ink" : "text-alarm"}`}
              >
                {restoreMessage.text}
              </p>
            )}
          </section>
        </>
      )}
    </>
  );
}
