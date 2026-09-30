"use client";

import { AnchorProvider, type Provider } from "@anchor-lang/core";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { PROGRAM_ID } from "./config";
import { explainError } from "./errors";
import {
  EMPTY_SNAPSHOT,
  parseWatched,
  secretsSnapshot,
  subscribe,
  watchedSnapshot,
} from "./local";
import { programFor, type RpsProgram } from "./rps";
import type { Secret } from "./salt";

/** `reader` always works. `signer` exists only while a wallet is connected. */
export function usePrograms(): {
  reader: RpsProgram;
  signer: RpsProgram | null;
  wallet: string | null;
} {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const reader = useMemo(
    () => programFor({ connection } as Provider, PROGRAM_ID),
    [connection],
  );
  const signer = useMemo(
    () =>
      anchorWallet
        ? programFor(
            new AnchorProvider(connection, anchorWallet, { commitment: "confirmed" }),
            PROGRAM_ID,
          )
        : null,
    [connection, anchorWallet],
  );
  return { reader, signer, wallet: anchorWallet?.publicKey.toBase58() ?? null };
}

/** The current time in unix seconds, refreshed every second for countdowns. */
export function useNow(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

type Polled<T> = { data: T | null; error: string | null; loading: boolean };

/**
 * Calls `fetcher` now and then every `intervalMs`. Pass a memoized fetcher, or
 * null to pause. `refresh` fetches again straight away.
 */
export function usePolling<T>(
  fetcher: (() => Promise<T>) | null,
  intervalMs: number,
): Polled<T> & { refresh: () => void } {
  const [state, setState] = useState<Polled<T>>({ data: null, error: null, loading: true });
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (!fetcher) return;
    let cancelled = false;
    const load = async () => {
      try {
        const data = await fetcher();
        if (!cancelled) setState({ data, error: null, loading: false });
      } catch (error) {
        if (!cancelled) {
          setState((previous) => ({ ...previous, error: explainError(error), loading: false }));
        }
      }
    };
    load();
    const id = setInterval(load, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [fetcher, intervalMs, generation]);

  const refresh = useCallback(() => setGeneration((value) => value + 1), []);
  return { ...state, refresh };
}

/** The reveal secrets stored in this browser, keyed by game address. */
export function useSecrets(): Record<string, Secret> {
  const snapshot = useSyncExternalStore(subscribe, secretsSnapshot, () => EMPTY_SNAPSHOT);
  return useMemo(() => {
    const secrets = JSON.parse(snapshot) as Secret[];
    return Object.fromEntries(secrets.map((secret) => [secret.game, secret]));
  }, [snapshot]);
}

/** Addresses of games this browser created or joined, newest first. */
export function useWatchedGames(): string[] {
  const snapshot = useSyncExternalStore(subscribe, watchedSnapshot, () => EMPTY_SNAPSHOT);
  return useMemo(() => parseWatched(snapshot), [snapshot]);
}

export type TxState =
  | { phase: "idle" }
  | { phase: "pending"; label: string }
  | { phase: "done"; label: string; signature: string }
  | { phase: "error"; message: string };

/** Runs one transaction at a time and tracks it for display. */
export function useTx(): {
  state: TxState;
  busy: boolean;
  run: (label: string, action: () => Promise<string>) => Promise<string | null>;
  reset: () => void;
} {
  const [state, setState] = useState<TxState>({ phase: "idle" });
  const run = useCallback(async (label: string, action: () => Promise<string>) => {
    setState({ phase: "pending", label });
    try {
      const signature = await action();
      setState({ phase: "done", label, signature });
      return signature;
    } catch (error) {
      console.error(error);
      setState({ phase: "error", message: explainError(error) });
      return null;
    }
  }, []);
  const reset = useCallback(() => setState({ phase: "idle" }), []);
  return { state, busy: state.phase === "pending", run, reset };
}
