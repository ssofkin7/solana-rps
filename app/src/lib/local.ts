// Browser-only state kept in localStorage: the secrets needed to reveal, and
// the list of games this browser took part in. Exposed as a tiny external
// store so components re-render when it changes, including from another tab.
import { listSecrets, removeSecret, saveSecret, type Secret } from "./salt";

const WATCHED_KEY = "rps:watched";
const MAX_WATCHED = 30;

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** A string snapshot, so `useSyncExternalStore` can compare by value. */
export function secretsSnapshot(): string {
  return JSON.stringify(listSecrets(window.localStorage));
}

export function watchedSnapshot(): string {
  return window.localStorage.getItem(WATCHED_KEY) ?? "[]";
}

export const EMPTY_SNAPSHOT = "[]";

export function storeSecret(secret: Secret): void {
  saveSecret(window.localStorage, secret);
  emit();
}

export function forgetSecret(game: string): void {
  removeSecret(window.localStorage, game);
  emit();
}

export function parseWatched(snapshot: string): string[] {
  try {
    const parsed: unknown = JSON.parse(snapshot);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

/** Remembers a game this browser created or joined, newest first. */
export function watchGame(game: string): void {
  const current = parseWatched(watchedSnapshot()).filter((address) => address !== game);
  window.localStorage.setItem(WATCHED_KEY, JSON.stringify([game, ...current].slice(0, MAX_WATCHED)));
  emit();
}

/** Offers `contents` to the player as a file download. */
export function downloadTextFile(filename: string, contents: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
