/** A game account decoded into plain values. */
export type GameView = {
  address: string;
  status: "open" | "joined";
  creator: string;
  opponent: string | null;
  treasury: string;
  gameId: bigint;
  stakeLamports: bigint;
  commitment: Uint8Array;
  opponentMove: number | null;
  /** Unix seconds. */
  createdAt: number;
  /** Unix seconds; 0 until joined. */
  joinedAt: number;
  feeBps: number;
  /** Seconds the creator has to reveal after a join. */
  revealTimeout: number;
};

export type Actions = {
  role: "creator" | "opponent" | "spectator";
  canJoin: boolean;
  canCancel: boolean;
  canReveal: boolean;
  /** The creator must reveal but this browser has no move and salt for the game. */
  needsSecret: boolean;
  canClaimForfeit: boolean;
  /** Unix seconds, or null while the game is open. */
  revealDeadline: number | null;
  /** Seconds until the deadline, never below zero; null while the game is open. */
  secondsLeft: number | null;
};

/**
 * Which actions the program would accept right now. It mirrors the program's
 * own checks so the interface never offers a button that would fail.
 */
export function actionsFor(
  game: GameView,
  wallet: string | null,
  nowSeconds: number,
  hasSecret: boolean,
): Actions {
  const isCreator = wallet !== null && wallet === game.creator;
  const isOpponent = wallet !== null && wallet === game.opponent;
  const role = isCreator ? "creator" : isOpponent ? "opponent" : "spectator";

  if (game.status === "open") {
    return {
      role,
      canJoin: wallet !== null && !isCreator && wallet !== game.treasury,
      canCancel: isCreator,
      canReveal: false,
      needsSecret: false,
      canClaimForfeit: false,
      revealDeadline: null,
      secondsLeft: null,
    };
  }

  const revealDeadline = game.joinedAt + game.revealTimeout;
  const secondsLeft = Math.max(0, revealDeadline - nowSeconds);
  return {
    role,
    canJoin: false,
    canCancel: false,
    // A late reveal is accepted until the opponent actually claims.
    canReveal: isCreator && hasSecret,
    needsSecret: isCreator && !hasSecret,
    canClaimForfeit: isOpponent && nowSeconds >= revealDeadline,
    revealDeadline,
    secondsLeft,
  };
}
