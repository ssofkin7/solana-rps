import type { Provider } from "@anchor-lang/core";
import { Connection } from "@solana/web3.js";
import { PROGRAM_ID, RPC_URL } from "@/lib/config";
import { serializeRecent } from "@/lib/recent";
import { fetchRecentResults, programFor } from "@/lib/rps";

// Reading history takes one RPC call per transaction, which the public devnet
// endpoint limits hard. This route does the scan on the server and caches it,
// so every visitor shares one scan per minute instead of running their own.
export const dynamic = "force-dynamic";

const FRESH_FOR_MS = 60_000;
const RESULTS = 10;

let cached: { at: number; body: string } | null = null;
let inFlight: Promise<string> | null = null;

async function scan(): Promise<string> {
  const program = programFor(
    { connection: new Connection(RPC_URL, "confirmed") } as Provider,
    PROGRAM_ID,
  );
  return serializeRecent(await fetchRecentResults(program, RESULTS));
}

export async function GET() {
  const fresh = cached && Date.now() - cached.at < FRESH_FOR_MS;
  if (!fresh) {
    inFlight ??= scan().finally(() => {
      inFlight = null;
    });
    try {
      cached = { at: Date.now(), body: await inFlight };
    } catch {
      // Serve the last good scan if devnet is refusing requests right now.
      if (!cached) {
        return new Response(JSON.stringify({ error: "Devnet did not respond. Try again shortly." }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
  }
  return new Response(cached?.body ?? "[]", {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
