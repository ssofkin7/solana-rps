import { describe, expect, it } from "vitest";
import { moveName, outcomeFor, type Move } from "./moves";

describe("outcomeFor", () => {
  it("covers all nine combinations", () => {
    const expected: [Move, Move, string][] = [
      [0, 0, "tie"],
      [0, 1, "opponent"],
      [0, 2, "creator"],
      [1, 0, "creator"],
      [1, 1, "tie"],
      [1, 2, "opponent"],
      [2, 0, "opponent"],
      [2, 1, "creator"],
      [2, 2, "tie"],
    ];
    for (const [creator, opponent, want] of expected) {
      expect(outcomeFor(creator, opponent), `${creator} vs ${opponent}`).toBe(want);
    }
  });
});

describe("moveName", () => {
  it("names the three moves and flags anything else", () => {
    expect(moveName(0)).toBe("Rock");
    expect(moveName(1)).toBe("Paper");
    expect(moveName(2)).toBe("Scissors");
    expect(moveName(3)).toBe("Unknown");
  });
});
