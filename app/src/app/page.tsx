"use client";

import { PublicKey } from "@solana/web3.js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { MovePicker } from "@/components/move-picker";
import { TxStatus } from "@/components/tx-status";
import { formatAge, formatDuration, formatSol, shortAddress } from "@/lib/format";
import { useNow, usePolling, usePrograms, useTx } from "@/lib/hooks";
import { watchGame } from "@/lib/local";
import type { Move } from "@/lib/moves";
import { fetchConfig, fetchOpenGames, joinGame } from "@/lib/rps";
import { actionsFor, type GameView } from "@/lib/status";

const POLL_MS = 10_000;

function winnings(game: GameView): bigint {
  const pot = game.stakeLamports * 2n;
  return pot - (pot * BigInt(game.feeBps)) / 10_000n;
}

export default function LobbyPage() {
  const { reader, signer, wallet } = usePrograms();
  const now = useNow();
  const router = useRouter();
  const tx = useTx();

  const loadGames = useCallback(() => fetchOpenGames(reader), [reader]);
  const loadConfig = useCallback(() => fetchConfig(reader), [reader]);
  const games = usePolling(loadGames, POLL_MS);
  const config = usePolling(loadConfig, 60_000);

  const dialog = useRef<HTMLDialogElement>(null);
  const [joining, setJoining] = useState<GameView | null>(null);
  const [move, setMove] = useState<Move | null>(null);

  useEffect(() => {
    if (joining) dialog.current?.showModal();
  }, [joining]);

  const openJoin = (game: GameView) => {
    tx.reset();
    setMove(null);
    setJoining(game);
  };

  const confirmJoin = async () => {
    if (!joining || move === null || !signer || !wallet) return;
    const signature = await tx.run("Join", () =>
      joinGame(signer, new PublicKey(wallet), joining, move),
    );
    if (signature) {
      watchGame(joining.address);
      router.push("/games");
    } else {
      games.refresh();
    }
  };

  return (
    <>
      <section className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-xl">
          <h1 className="text-5xl font-extrabold text-ink sm:text-6xl">
            Rock, paper, scissors for SOL
          </h1>
          <p className="mt-4 text-lg">
            Pick an open game, match the stake and play your hand. The creator&apos;s move was
            sealed before you arrived, so neither side can peek.
          </p>
        </div>
        <Link href="/create" className="button button-stake">
          Create a game
        </Link>
      </section>

      {config.data && (
        <p className="mt-6 text-muted">
          The winner pays a {config.data.feeBps / 100}% fee. Stakes start at{" "}
          {formatSol(config.data.minStakeLamports)} SOL with no upper limit. Creators get{" "}
          {formatDuration(config.data.revealTimeout)} to reveal once someone joins.
        </p>
      )}
      {config.data?.paused && (
        <p role="status" className="mt-4 rounded-xl border-2 border-alarm bg-sheet px-4 py-3">
          New games and joins are paused right now. Games already in progress can still be
          finished from My games.
        </p>
      )}

      <section className="mt-10" aria-labelledby="open-games">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="open-games" className="text-3xl font-bold">
            Open games
          </h2>
          <button className="button button-quiet" onClick={games.refresh}>
            Refresh
          </button>
        </div>

        {games.error && (
          <p role="alert" className="mt-4 rounded-xl border-2 border-alarm bg-sheet px-4 py-3">
            Could not load the lobby. {games.error}
          </p>
        )}
        {games.loading && !games.data && <p className="mt-4 text-muted">Loading open games.</p>}
        {games.data?.length === 0 && (
          <div className="mt-4 rounded-2xl border-2 border-dashed border-night px-6 py-10">
            <p className="font-display text-2xl font-semibold">Nobody is waiting for a game.</p>
            <p className="mt-2">Create one and it will show up here for someone to join.</p>
            <Link href="/create" className="button button-stake mt-5">
              Create a game
            </Link>
          </div>
        )}

        <ul className="mt-4 grid gap-4">
          {games.data?.map((game) => {
            const actions = actionsFor(game, wallet, now, false);
            return (
              <li key={game.address} className="ticket">
                <div className="ticket-stub">
                  <p className="figure text-3xl font-bold text-ink">
                    {formatSol(game.stakeLamports)}
                  </p>
                  <p className="text-sm text-muted">SOL stake</p>
                </div>
                <div className="ticket-body">
                  <p>
                    {actions.role === "creator" ? "Your game" : `By ${shortAddress(game.creator)}`}
                    <span className="text-muted">, opened {formatAge(now - game.createdAt)}</span>
                    <br />
                    <span className="text-muted">
                      Win {formatSol(winnings(game))} SOL
                    </span>
                  </p>
                  {actions.role === "creator" ? (
                    <Link href="/games" className="button">
                      Manage
                    </Link>
                  ) : actions.canJoin ? (
                    <button className="button button-stake" onClick={() => openJoin(game)}>
                      Join
                    </button>
                  ) : (
                    <span className="text-muted">Connect a wallet to join</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <dialog
        ref={dialog}
        className="sheet"
        aria-labelledby="join-title"
        onClose={() => setJoining(null)}
      >
        {joining && (
          <>
            <h2 id="join-title" className="text-3xl font-bold">
              Join for {formatSol(joining.stakeLamports)} SOL
            </h2>
            <p className="mt-3">
              You stake {formatSol(joining.stakeLamports)} SOL now. Win and you receive{" "}
              {formatSol(winnings(joining))} SOL. A tie returns your stake.
            </p>
            <div className="mt-5">
              <MovePicker
                legend="Play your hand"
                value={move}
                onChange={setMove}
                disabled={tx.busy}
              />
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                className="button button-stake"
                onClick={confirmJoin}
                disabled={move === null || tx.busy}
              >
                Join game
              </button>
              <button className="button button-quiet" onClick={() => dialog.current?.close()}>
                Back to the lobby
              </button>
            </div>
            <div className="mt-4">
              <TxStatus state={tx.state} />
            </div>
          </>
        )}
      </dialog>
    </>
  );
}
