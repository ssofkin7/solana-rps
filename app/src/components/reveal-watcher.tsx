"use client";

import { PublicKey } from "@solana/web3.js";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Hand } from "./hand";
import { TxStatus } from "./tx-status";
import { formatCountdown, formatSol } from "@/lib/format";
import { useNow, usePolling, usePrograms, useSecrets, useTx } from "@/lib/hooks";
import { forgetSecret } from "@/lib/local";
import { moveName } from "@/lib/moves";
import { fetchMyGames, revealGame } from "@/lib/rps";
import { actionsFor } from "@/lib/status";

const POLL_MS = 8_000;

/**
 * Watches the connected wallet's games on every page. As soon as one of the
 * games it created is joined, it opens a prompt to reveal, because the clock
 * is already running.
 */
export function RevealWatcher() {
  const { reader, signer, wallet } = usePrograms();
  const secrets = useSecrets();
  const now = useNow();
  const router = useRouter();
  const tx = useTx();
  const dialog = useRef<HTMLDialogElement>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);

  const fetcher = useCallback(
    () => (wallet ? fetchMyGames(reader, new PublicKey(wallet)) : Promise.resolve([])),
    [reader, wallet],
  );
  const { data: games, refresh } = usePolling(wallet ? fetcher : null, POLL_MS);

  const waiting = (games ?? []).find(
    (game) =>
      !dismissed.includes(game.address) &&
      actionsFor(game, wallet, now, Boolean(secrets[game.address])).canReveal,
  );
  const waitingAddress = waiting?.address ?? null;

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (waitingAddress && !element.open) element.showModal();
    if (!waitingAddress && element.open) element.close();
  }, [waitingAddress]);

  if (!waiting || !signer) return <dialog ref={dialog} className="sheet" />;

  const secret = secrets[waiting.address];
  const actions = actionsFor(waiting, wallet, now, true);
  const late = actions.secondsLeft === 0;

  const reveal = async () => {
    const signature = await tx.run("Reveal", () => revealGame(signer, waiting, secret));
    if (signature) {
      forgetSecret(waiting.address);
      refresh();
      router.push(`/result/${signature}`);
    }
  };

  return (
    <dialog
      ref={dialog}
      className="sheet"
      aria-labelledby="reveal-title"
      onClose={() => setDismissed((current) => [...current, waiting.address])}
    >
      <h2 id="reveal-title" className="text-3xl font-bold">
        Someone joined your game
      </h2>
      <p className="mt-3">
        Your {formatSol(waiting.stakeLamports)} SOL game has an opponent. Reveal your move to
        settle it.
      </p>
      <div className="mt-5 flex items-center gap-4 text-ink">
        <Hand move={secret.move} size={64} />
        <p className="text-night">
          You played <strong>{moveName(secret.move)}</strong>. They played{" "}
          <strong>{moveName(waiting.opponentMove ?? -1)}</strong>.
        </p>
      </div>
      <p className={`figure mt-5 text-4xl font-bold ${late ? "text-alarm" : "text-ink"}`}>
        {formatCountdown(actions.secondsLeft ?? 0)}
      </p>
      <p className="text-muted">
        {late
          ? "Time is up. Reveal now, before your opponent claims the pot."
          : "left to reveal. After that your opponent can claim the pot."}
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button className="button button-stake" onClick={reveal} disabled={tx.busy}>
          Reveal my move
        </button>
        <button className="button button-quiet" onClick={() => dialog.current?.close()}>
          Not now
        </button>
      </div>
      <div className="mt-4">
        <TxStatus state={tx.state} />
      </div>
    </dialog>
  );
}
