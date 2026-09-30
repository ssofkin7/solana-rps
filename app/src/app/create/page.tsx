"use client";

import { PublicKey } from "@solana/web3.js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { MovePicker } from "@/components/move-picker";
import { TxStatus } from "@/components/tx-status";
import { PROGRAM_ID } from "@/lib/config";
import { formatDuration, formatSol, parseSol } from "@/lib/format";
import { usePolling, usePrograms, useTx } from "@/lib/hooks";
import { downloadTextFile, storeSecret, watchGame } from "@/lib/local";
import type { Move } from "@/lib/moves";
import { createGame, fetchConfig, prepareGame } from "@/lib/rps";
import { backupFileFor, type Secret } from "@/lib/salt";

export default function CreatePage() {
  const { reader, signer, wallet } = usePrograms();
  const router = useRouter();
  const tx = useTx();
  const loadConfig = useCallback(() => fetchConfig(reader), [reader]);
  const config = usePolling(loadConfig, 60_000);

  const [stakeText, setStakeText] = useState("0.01");
  const [move, setMove] = useState<Move | null>(null);
  // The sealed game: set once the backup has been downloaded. Changing the
  // stake or the move clears it, because the backup would no longer match.
  const [sealedSecret, setSealed] = useState<Secret | null>(null);
  // A seal made with one wallet is useless after switching to another.
  const sealed = sealedSecret?.creator === wallet ? sealedSecret : null;

  const stake = parseSol(stakeText);
  const minStake = config.data?.minStakeLamports ?? null;
  const stakeError =
    stake === null
      ? "Enter the stake in SOL, for example 0.05."
      : minStake !== null && stake < minStake
        ? `The minimum stake is ${formatSol(minStake)} SOL.`
        : null;
  const timeout = config.data ? formatDuration(config.data.revealTimeout) : "10 minutes";
  const ready = wallet !== null && move !== null && stake !== null && stakeError === null;

  const downloadBackup = () => {
    if (!ready || !wallet || move === null || stake === null) return;
    const secret =
      sealed ??
      prepareGame(PROGRAM_ID, new PublicKey(wallet), move, stake, Math.floor(Date.now() / 1000));
    // Saved in this browser first, then offered as a file.
    storeSecret(secret);
    const file = backupFileFor(secret);
    downloadTextFile(file.filename, file.contents);
    setSealed(secret);
  };

  const create = async () => {
    if (!sealed || !signer) return;
    const signature = await tx.run("Create game", () => createGame(signer, sealed));
    if (signature) {
      watchGame(sealed.game);
      router.push("/games");
    }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-5xl font-extrabold text-ink">Create a game</h1>
      <p className="mt-4 text-lg">
        Choose a stake and a hand. Your move is sealed on-chain, and you open it after someone
        joins.
      </p>

      {config.data?.paused && (
        <p role="status" className="mt-6 rounded-xl border-2 border-alarm bg-sheet px-4 py-3">
          New games are paused right now. Try again later.
        </p>
      )}

      <div className="mt-8 grid gap-8">
        <div>
          <label htmlFor="stake" className="font-display text-lg font-semibold">
            Stake in SOL
          </label>
          <input
            id="stake"
            inputMode="decimal"
            autoComplete="off"
            value={stakeText}
            onChange={(event) => {
              setStakeText(event.target.value);
              setSealed(null);
            }}
            disabled={tx.busy}
            aria-describedby="stake-help"
            aria-invalid={stakeError !== null}
            className="figure mt-2 block w-48 rounded-xl border-2 border-night bg-sheet px-4 py-2 text-3xl font-bold text-ink"
          />
          <p id="stake-help" className={`mt-2 ${stakeError ? "text-alarm" : "text-muted"}`}>
            {stakeError ??
              "Your opponent matches this amount. The winner takes both stakes minus the fee."}
          </p>
        </div>

        <MovePicker
          legend="Your hand"
          value={move}
          onChange={(next) => {
            setMove(next);
            setSealed(null);
          }}
          disabled={tx.busy}
        />

        <section className="rounded-2xl border-2 border-night bg-sheet p-5">
          <h2 className="text-2xl font-bold">Save your backup file first</h2>
          <p className="mt-2">
            The file holds your move and a secret code. Without it you cannot reveal, and your
            opponent takes the pot after {timeout}. It is also stored in this browser, but
            clearing your browser data would erase that copy.
          </p>
          <button className="button mt-4" onClick={downloadBackup} disabled={!ready || tx.busy}>
            {sealed ? "Download the backup again" : "Download backup"}
          </button>
          {sealed && (
            <p role="status" className="mt-3 font-medium text-ink">
              Backup downloaded. Keep it until this game is settled.
            </p>
          )}
        </section>

        <section>
          <p className="text-muted">
            Once someone joins you have {timeout} to reveal. Stay nearby, or cancel the game from
            My games before you leave.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <button
              className="button button-stake"
              onClick={create}
              disabled={!sealed || !signer || tx.busy}
            >
              Create game
            </button>
            {!wallet && <span className="text-muted">Connect a wallet to create a game.</span>}
            {wallet && !sealed && (
              <span className="text-muted">Download the backup to unlock this button.</span>
            )}
          </div>
          <div className="mt-4">
            <TxStatus state={tx.state} />
          </div>
        </section>
      </div>

      <p className="mt-10">
        <Link href="/" className="underline underline-offset-4">
          Back to the lobby
        </Link>
      </p>
    </div>
  );
}
