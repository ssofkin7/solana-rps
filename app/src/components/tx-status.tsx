import { explorerTx } from "@/lib/config";
import type { TxState } from "@/lib/hooks";

/** Shows what happened to the last transaction: waiting, confirmed, or why it failed. */
export function TxStatus({ state }: { state: TxState }) {
  if (state.phase === "idle") return null;

  if (state.phase === "pending") {
    return (
      <p role="status" className="rounded-xl border-2 border-night bg-sheet px-4 py-3">
        {state.label}: approve it in your wallet, then wait for devnet to confirm.
      </p>
    );
  }

  if (state.phase === "done") {
    return (
      <p role="status" className="rounded-xl border-2 border-night bg-stake px-4 py-3">
        {state.label}: confirmed.{" "}
        <a
          className="underline underline-offset-4"
          href={explorerTx(state.signature)}
          target="_blank"
          rel="noreferrer"
        >
          View the transaction
        </a>
      </p>
    );
  }

  return (
    <p role="alert" className="rounded-xl border-2 border-alarm bg-sheet px-4 py-3">
      <span className="font-semibold text-alarm">That did not go through.</span> {state.message}
    </p>
  );
}
