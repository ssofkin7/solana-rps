const LAMPORTS_PER_SOL = 1_000_000_000n;

/** Exact decimal rendering of lamports as SOL, without trailing zeros. */
export function formatSol(lamports: bigint): string {
  const whole = lamports / LAMPORTS_PER_SOL;
  const fraction = (lamports % LAMPORTS_PER_SOL).toString().padStart(9, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

/** Parses SOL typed by a person into lamports, exactly. Null unless it is a positive amount. */
export function parseSol(text: string): bigint | null {
  const match = /^(\d*)(?:\.(\d{0,9}))?$/.exec(text.trim());
  if (!match || (match[1] === "" && !match[2])) return null;
  const whole = BigInt(match[1] || "0");
  const fraction = BigInt((match[2] ?? "").padEnd(9, "0"));
  const lamports = whole * LAMPORTS_PER_SOL + fraction;
  return lamports > 0n ? lamports : null;
}

export function formatAge(seconds: number): string {
  if (seconds < 60) return "just now";
  if (seconds < 3_600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)} hr ago`;
  const days = Math.floor(seconds / 86_400);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

export function formatCountdown(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const secs = (total % 60).toString().padStart(2, "0");
  if (hours > 0) return `${hours}:${minutes.toString().padStart(2, "0")}:${secs}`;
  return `${minutes}:${secs}`;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}
