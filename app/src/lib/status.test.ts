import { describe, expect, it } from "vitest";
import { actionsFor, type GameView } from "./status";

const CREATOR = "DeDGEc6itNb78RVUSpWoQQbnoEkgJcFCfDfambdtY7XF";
const OPPONENT = "8Besg2ve5XhT7X9ckA3H96CnER9bBW7TwbincQ6QFTcu";
const TREASURY = "Ea7DkC7AGUVv1e9dfQKY6QEBHYsDT3rGcQhs1rXRARPf";
const STRANGER = "Fmi151zsEHFgRJeUXNgDjbo4aLA6PRQ63ktWM6sCEgkA";

const open: GameView = {
  address: "game",
  status: "open",
  creator: CREATOR,
  opponent: null,
  treasury: TREASURY,
  gameId: 1n,
  stakeLamports: 10_000_000n,
  commitment: new Uint8Array(32),
  opponentMove: null,
  createdAt: 1_000,
  joinedAt: 0,
  feeBps: 250,
  revealTimeout: 600,
};
const joined: GameView = {
  ...open,
  status: "joined",
  opponent: OPPONENT,
  opponentMove: 1,
  joinedAt: 2_000,
};

describe("actionsFor an open game", () => {
  it("lets the creator cancel and nothing else", () => {
    const actions = actionsFor(open, CREATOR, 1_500, true);
    expect(actions).toMatchObject({
      role: "creator",
      canCancel: true,
      canJoin: false,
      canReveal: false,
      canClaimForfeit: false,
      revealDeadline: null,
    });
  });
  it("lets anyone else join", () => {
    const actions = actionsFor(open, STRANGER, 1_500, false);
    expect(actions).toMatchObject({ role: "spectator", canJoin: true, canCancel: false });
  });
  it("offers nothing without a wallet", () => {
    const actions = actionsFor(open, null, 1_500, false);
    expect(actions).toMatchObject({ role: "spectator", canJoin: false, canCancel: false });
  });
  it("does not let the fee wallet join", () => {
    expect(actionsFor(open, TREASURY, 1_500, false).canJoin).toBe(false);
  });
});

describe("actionsFor a joined game", () => {
  it("lets the creator reveal when they have the secret", () => {
    const actions = actionsFor(joined, CREATOR, 2_100, true);
    expect(actions).toMatchObject({
      role: "creator",
      canReveal: true,
      needsSecret: false,
      canCancel: false,
      canClaimForfeit: false,
      revealDeadline: 2_600,
      secondsLeft: 500,
    });
  });
  it("asks for the backup when the creator has no secret", () => {
    const actions = actionsFor(joined, CREATOR, 2_100, false);
    expect(actions).toMatchObject({ canReveal: false, needsSecret: true });
  });
  it("still lets the creator reveal after the deadline, until a claim lands", () => {
    const actions = actionsFor(joined, CREATOR, 9_999, true);
    expect(actions).toMatchObject({ canReveal: true, secondsLeft: 0 });
  });
  it("makes the opponent wait until the deadline to claim", () => {
    expect(actionsFor(joined, OPPONENT, 2_599, false)).toMatchObject({
      role: "opponent",
      canClaimForfeit: false,
      secondsLeft: 1,
    });
    expect(actionsFor(joined, OPPONENT, 2_600, false)).toMatchObject({
      canClaimForfeit: true,
      secondsLeft: 0,
    });
  });
  it("offers a spectator nothing", () => {
    expect(actionsFor(joined, STRANGER, 5_000, false)).toMatchObject({
      role: "spectator",
      canJoin: false,
      canCancel: false,
      canReveal: false,
      canClaimForfeit: false,
    });
  });
});
