export type Move = 0 | 1 | 2;

export const MOVES: { id: Move; name: string; beats: string }[] = [
  { id: 0, name: "Rock", beats: "Scissors" },
  { id: 1, name: "Paper", beats: "Rock" },
  { id: 2, name: "Scissors", beats: "Paper" },
];

export type Outcome = "creator" | "opponent" | "tie";

export function isMove(value: unknown): value is Move {
  return value === 0 || value === 1 || value === 2;
}

export function moveName(move: number): string {
  return MOVES.find((m) => m.id === move)?.name ?? "Unknown";
}

/** The same table the program uses: rock beats scissors, paper beats rock, scissors beats paper. */
export function outcomeFor(creatorMove: Move, opponentMove: Move): Outcome {
  if (creatorMove === opponentMove) return "tie";
  const creatorWins =
    (creatorMove === 0 && opponentMove === 2) ||
    (creatorMove === 1 && opponentMove === 0) ||
    (creatorMove === 2 && opponentMove === 1);
  return creatorWins ? "creator" : "opponent";
}
