"use client";

import { PublicKey } from "@solana/web3.js";
import Link from "next/link";
import { use, useCallback } from "react";
import { Hand } from "@/components/hand";
import { explorerTx } from "@/lib/config";
import { describeResult } from "@/lib/describe";
import { formatSol, shortAddress } from "@/lib/format";
import { usePolling, usePrograms } from "@/lib/hooks";
import { moveName } from "@/lib/moves";
import { fetchHistory, fetchResult, type GameResult, type HistoryEntry } from "@/lib/rps";

type Loaded = { result: GameResult | null; history: HistoryEntry[] };

function who(address: string, wallet: string | null): string {
  return address === wallet ? "You" : shortAddress(address);
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-2">
      <dt className="text-muted">{label}</dt>
      <dd className="figure text-lg font-semibold">{value}</dd>
    </div>
  );
}

export default function ResultPage({ params }: { params: Promise<{ signature: string }> }) {
  const { signature } = use(params);
  const { reader, wallet } = usePrograms();

  const load = useCallback(async (): Promise<Loaded> => {
    const result = await fetchResult(reader, signature);
    const history = result ? await fetchHistory(reader, new PublicKey(result.game)) : [];
    return { result, history };
  }, [reader, signature]);
  // A settled game never changes, so this only re-polls while devnet has not
  // indexed the transaction yet.
  const { data, error, loading } = usePolling(load, 15_000);

  if (loading && !data) {
    return <p className="text-lg text-muted">Loading the result from devnet.</p>;
  }

  if (error && !data) {
    return (
      <p role="alert" className="rounded-xl border-2 border-alarm bg-sheet px-4 py-3">
        Could not load this result. {error}
      </p>
    );
  }

  const result = data?.result ?? null;
  if (!result) {
    return (
      <div className="max-w-xl">
        <h1 className="text-4xl font-extrabold text-ink">No result here yet</h1>
        <p className="mt-4">
          This transaction did not end a game, or devnet has not caught up with it yet. This page
          checks again every few seconds.
        </p>
        <p className="mt-4">
          <a
            className="underline underline-offset-4"
            href={explorerTx(signature)}
            target="_blank"
            rel="noreferrer"
          >
            View the transaction on Solana Explorer
          </a>
        </p>
      </div>
    );
  }

  const summary = describeResult(result, wallet);
  const headlineColour =
    summary.tone === "loss" ? "text-alarm" : summary.tone === "win" ? "text-ink" : "text-night";

  return (
    <>
      {result.kind === "settled" && (
        <div className="on-ink flex items-end justify-center gap-6 rounded-3xl bg-ink px-6 py-10 text-paper sm:gap-14">
          <figure className="text-center">
            <Hand
              move={result.creatorMove}
              size={132}
              className={`throw-left mx-auto ${result.outcome === "creator" ? "text-stake" : ""}`}
            />
            <figcaption className="mt-3">
              <span className="font-display text-xl font-semibold">
                {moveName(result.creatorMove)}
              </span>
              <br />
              {who(result.creator, wallet)}, creator
            </figcaption>
          </figure>
          <span className="pb-16 font-display text-2xl font-semibold" aria-hidden="true">
            vs
          </span>
          <figure className="text-center">
            <Hand
              move={result.opponentMove}
              size={132}
              className={`throw-right mx-auto ${result.outcome === "opponent" ? "text-stake" : ""}`}
            />
            <figcaption className="mt-3">
              <span className="font-display text-xl font-semibold">
                {moveName(result.opponentMove)}
              </span>
              <br />
              {who(result.opponent, wallet)}, opponent
            </figcaption>
          </figure>
        </div>
      )}

      <div className={result.kind === "settled" ? "after-throw" : ""}>
        <h1 className={`mt-8 text-5xl font-extrabold sm:text-6xl ${headlineColour}`}>
          {summary.headline}
        </h1>

        <dl className="mt-8 max-w-md divide-y-2 divide-rule border-y-2 border-rule">
          {result.kind === "settled" && (
            <>
              <Row label="Stake each" value={`${formatSol(result.stakeLamports)} SOL`} />
              <Row
                label={`${who(result.creator, wallet)} received`}
                value={`${formatSol(result.creatorPayout)} SOL`}
              />
              <Row
                label={`${who(result.opponent, wallet)} received`}
                value={`${formatSol(result.opponentPayout)} SOL`}
              />
              <Row label="Fee to the buyback wallet" value={`${formatSol(result.fee)} SOL`} />
            </>
          )}
          {result.kind === "forfeited" && (
            <>
              <Row label="Pot" value={`${formatSol(result.pot)} SOL`} />
              <Row
                label={`${who(result.opponent, wallet)} received`}
                value={`${formatSol(result.payout)} SOL`}
              />
              <Row label="Fee to the buyback wallet" value={`${formatSol(result.fee)} SOL`} />
            </>
          )}
          {result.kind === "cancelled" && (
            <Row label="Refunded" value={`${formatSol(result.stakeLamports)} SOL`} />
          )}
        </dl>
        {result.kind === "forfeited" && (
          <p className="mt-4 max-w-md text-muted">
            The creator did not reveal before the deadline, so the opponent claimed the pot. The
            creator&apos;s move was never shown.
          </p>
        )}

        <section className="mt-10" aria-labelledby="transactions">
          <h2 id="transactions" className="text-2xl font-bold">
            Transactions
          </h2>
          <ol className="mt-3 grid gap-2">
            {(data?.history.length ? data.history : [fallbackEntry(signature)]).map((entry) => (
              <li key={entry.signature}>
                <a
                  className="underline underline-offset-4"
                  href={explorerTx(entry.signature)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {entry.label}
                  {entry.failed ? " (failed)" : ""}: {entry.signature.slice(0, 12)}…
                </a>
              </li>
            ))}
          </ol>
        </section>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/" className="button button-stake">
            Play again
          </Link>
          <Link href="/games" className="button">
            My games
          </Link>
        </div>
      </div>
    </>
  );
}

function fallbackEntry(signature: string): HistoryEntry {
  return { signature, blockTime: null, label: "Transaction", failed: false };
}
