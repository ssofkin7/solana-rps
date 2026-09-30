// Recent results travel from the cached server route to the browser as JSON,
// which has no BigInt, so lamport amounts go over as strings.
import type { RecentResult } from "./rps";

const AMOUNT_FIELDS = new Set([
  "stakeLamports",
  "creatorPayout",
  "opponentPayout",
  "fee",
  "pot",
  "payout",
]);

export function serializeRecent(recent: RecentResult[]): string {
  return JSON.stringify(recent, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value,
  );
}

export function parseRecent(text: string): RecentResult[] {
  try {
    const parsed: unknown = JSON.parse(text, (key, value) =>
      AMOUNT_FIELDS.has(key) && typeof value === "string" ? BigInt(value) : value,
    );
    return Array.isArray(parsed) ? (parsed as RecentResult[]) : [];
  } catch {
    return [];
  }
}
