# Solana RPS: commit-reveal Rock-Paper-Scissors with SOL wagers

Date: 2026-09-30
Status: implemented and deployed to devnet
Network: **devnet only**. Any mainnet-related step requires explicit approval first.

## 1. Goal

Two players wager SOL on a game of Rock-Paper-Scissors. The creator commits to a
hidden move, the opponent plays in the open, the creator reveals, and the program
settles. The winner pays a small fee that accumulates in a buyback wallet, to be
used later to buy back the project's token.

Success means:

- the program is deployed to devnet with its ID in the README
- every test in section 8 passes
- the frontend runs locally and is deployable to Vercel
- the code is in a public GitHub repo, `ssofkin7/solana-rps`

## 2. Out of scope

- Mainnet deployment.
- The token itself and any on-chain buyback. The token does not exist yet and a
  swap needs mainnet liquidity. This build only collects the fee into a wallet
  set in config. Buybacks are carried out from that wallet later, as a separate
  project with its own spec.
- SPL token wagers, best-of-N matches, matchmaking, chat, leaderboards.

## 3. Repository layout

```
solana-rps/
  Anchor.toml
  Cargo.toml
  programs/rps/src/
    lib.rs            instruction entry points
    constants.rs      seeds and limits
    state.rs          Config, Game, GameStatus, Outcome
    logic.rs          commitment hash, outcome table, fee math
    errors.rs         RpsError
    events.rs         emitted events
    instructions/     one file per instruction
  programs/rps/tests/ LiteSVM tests (Rust)
  scripts/            devnet config initialization
  app/                Next.js frontend
  README.md
  SECURITY.md
```

## 4. Program

### 4.1 Accounts

**Config**, PDA seeds `[b"config"]`, one per program.

| Field | Type | Notes |
|---|---|---|
| admin | Pubkey | may call `update_config` and `set_paused` |
| treasury | Pubkey | the buyback wallet that receives fees |
| fee_bps | u16 | default 250, maximum 1000 |
| min_stake | u64 | default 10,000,000 lamports (0.01 SOL) |
| reveal_timeout | i64 | seconds, default 600, allowed range 60 to 86,400 |
| paused | bool | |
| bump | u8 | |

There is no maximum stake.

**Game**, PDA seeds `[b"game", creator, game_id.to_le_bytes()]`. The game account
is also the vault: it holds both stakes on top of its own rent.

| Offset | Field | Type | Notes |
|---|---|---|---|
| 8 | status | u8 | 0 Open, 1 Joined |
| 9 | creator | Pubkey | |
| 41 | opponent | Pubkey | default until joined |
| 73 | game_id | u64 | random, chosen by the client |
| | stake | u64 | per player |
| | commitment | [u8; 32] | |
| | opponent_move | u8 | valid only when Joined |
| | created_at | i64 | |
| | joined_at | i64 | |
| | fee_bps | u16 | copied from Config at creation |
| | treasury | Pubkey | copied from Config at creation |
| | reveal_timeout | i64 | copied from Config at creation |
| | bump | u8 | |

`status`, `creator`, and `opponent` sit at fixed offsets so the frontend can
filter with `memcmp`. Copying fee, treasury, and timeout into the game means an
admin config change can never alter the terms of a game already in progress.

A settled, cancelled, or forfeited game has no status value because the account
is closed in the same instruction.

### 4.2 Moves and commitment

Moves are one byte: 0 Rock, 1 Paper, 2 Scissors. Any other value is rejected.

```
commitment = sha256(move_byte || salt[32] || creator_pubkey[32])
```

Including the creator's pubkey stops another player copying a commitment into
their own game.

### 4.3 Instructions

| Instruction | Signer | Required state | Effect |
|---|---|---|---|
| `initialize_config(fee_bps, min_stake, reveal_timeout)` with the treasury as an account | program upgrade authority | Config absent | creates Config, signer becomes admin |
| `update_config(...)` with an optional new treasury account | admin | any | updates admin, treasury, fee_bps, min_stake, reveal_timeout |
| `set_paused(paused)` | admin | any | sets the flag |
| `create_game(game_id, stake, commitment)` | creator | not paused | creates Game as Open, transfers stake in |
| `join_game(move, expected_stake, expected_commitment)` | opponent | Open, not paused | transfers stake in, records move and `joined_at`, sets Joined |
| `reveal(move, salt)` | creator | Joined | checks hash, settles, closes Game |
| `cancel_game()` | creator | Open | refunds stake, closes Game |
| `claim_forfeit()` | opponent | Joined, deadline passed | pays pot minus fee to opponent, closes Game |

Rules that the table does not show:

- `initialize_config` is restricted to the program's upgrade authority, checked
  against the program data account, so nobody can front-run initialization after
  deploy.
- `join_game` takes `expected_stake` and `expected_commitment` and fails unless
  both equal the game's values. These are two arguments more than the original
  brief. The stake check guarantees the opponent only wagers the amount they saw
  in the lobby. The commitment check exists because a game address can be reused
  after a cancel: without it a creator who sees a join coming could cancel,
  recreate the game with a different move, and have the join land on the new game.
- The treasury is passed as an account, not an argument, whenever it is set, and
  must be a writable system-owned account. `reveal` credits the treasury, so an
  address that can never be writable (a sysvar or a program id) would make every
  reveal fail and push every creator into forfeit.
- The creator cannot join their own game.
- The treasury wallet cannot create or join a game. This is policy: the fee
  wallet does not wager on games it collects fees from.
- `min_stake` can never be set below 1,000,000 lamports (0.001 SOL). A refund
  smaller than the rent-exempt minimum cannot be paid into an empty wallet, which
  would make dust games impossible to settle.
- `cancel_game` is available at any time before a join. There is no waiting period.
- `reveal` is accepted until the opponent actually claims the forfeit, even after
  the deadline. Whichever transaction lands first wins.
- `claim_forfeit` requires `now >= joined_at + reveal_timeout`.
- Pausing blocks `create_game` and `join_game` only. `reveal`, `cancel_game`, and
  `claim_forfeit` always work, so pausing can never trap funds.
- No admin instruction takes a Game account. The admin has no path to player funds.

### 4.4 Settlement

`pot = stake * 2`.

| Outcome | Creator receives | Opponent receives | Treasury receives |
|---|---|---|---|
| Creator wins | pot − fee | 0 | fee |
| Opponent wins | 0 | pot − fee | fee |
| Tie | stake | stake | 0 |
| Cancel | stake | n/a | 0 |
| Forfeit | 0 | pot − fee | fee |

`fee = pot * fee_bps / 10_000`, rounded down, so rounding favours the winner.

If paying the fee would leave the treasury account below the rent-exempt minimum
(an empty wallet receiving a very small fee), the fee is waived and the winner
receives the whole pot. Without this rule an unfunded treasury would make every
small reveal fail and push creators into forfeit.

In every outcome the Game account is closed and its rent returns to the creator.

Payouts move lamports directly out of the program-owned Game account. All
arithmetic is checked. Program code contains no `unwrap`, `expect`, or unchecked
indexing.

### 4.5 Events

`GameCreated`, `GameJoined`, `GameSettled` (both moves, outcome, payout, fee),
`GameCancelled`, `GameForfeited`. The frontend reads results from these, because
the Game account no longer exists after settlement.

### 4.6 Errors

One `RpsError` variant per failure: `Paused`, `InvalidMove`, `StakeTooLow`,
`StakeMismatch`, `InvalidGameState`, `CommitmentMismatch`, `CannotJoinOwnGame`,
`RevealTimeoutNotReached`, `Unauthorized`, `InvalidTreasury`, `TreasuryCannotPlay`,
`FeeTooHigh`, `InvalidTimeout`, `MinStakeTooLow`, `MathOverflow`, `GameChanged`. The frontend maps each to a plain-language message.

## 5. Frontend

Next.js App Router, TypeScript, Tailwind, `@solana/wallet-adapter` with Phantom,
Solflare, and Backpack, and the Anchor TypeScript client built from the IDL.
The RPC endpoint and program ID come from environment variables that default to
devnet.

| Route | Contents |
|---|---|
| `/` Lobby | open games from `getProgramAccounts` filtered on status; stake, age, Join button |
| `/create` | stake input, move picker, salt backup |
| `/games` My games | games where the wallet is creator or opponent; status, countdown, and Reveal, Cancel, or Claim forfeit shown only when the program would accept them |
| `/result/[signature]` | outcome, both moves, payout, fee, explorer links for each transaction |

Every page carries a devnet banner with a faucet link.

**Salt handling.** The salt comes from `crypto.getRandomValues`. It is saved to
localStorage under the game PDA together with the move. The Create button stays
disabled until the player downloads the backup file. A warning states that losing
the salt means forfeiting the stake. My games accepts a backup file to restore a
lost salt.

**Reveal prompt.** While the creator has open games, the app subscribes to those
accounts. When one becomes Joined, a reveal dialog opens with the countdown.

**Results.** After a settlement the app reads the event from the transaction. The
opponent's client finds that transaction from the closed game's signature history.

**Errors.** Wallet rejection, insufficient balance, program errors, and network
failures each get a specific message with a link to the failed transaction where
one exists.

## 6. Toolchain

Built natively on Windows at the owner's request: Rust 1.89 or newer, the MSVC
C++ build tools, Agave (Solana) CLI 4.1.2, and Anchor CLI 1.2.0, all pinned in
`Anchor.toml`. Agave and Anchor both publish Windows binaries, but Anchor's docs
still name WSL as the supported route, so the first implementation task is to
build and test a trivial program end to end. If that fails, work stops and the
evidence is reported before any alternative is tried.

Tests use LiteSVM because the forfeit tests must move the clock forward by the
reveal timeout. They are written in Rust and run with `cargo test`: this is
Anchor 1.x's default test template, and LiteSVM's TypeScript package ships no
Windows binary. The frontend uses `@anchor-lang/core`, the Anchor 1.x TypeScript
client.

## 7. Security

`SECURITY.md` records the threat model and the checks for each instruction. The
threats it covers:

- commitment copying, prevented by the creator pubkey in the hash
- move or salt guessing, prevented by a 32-byte random salt
- state replay: double-join, double-reveal, settle-then-cancel, cancel after join
- account substitution: wrong treasury, wrong opponent, wrong creator, forged PDAs
- admin abuse: config changes reaching live games, pausing to trap funds
- initialization front-running
- creator stalling after seeing a losing position, answered by forfeit
- denial of service through an unfunded treasury
- arithmetic overflow with unbounded stakes

## 8. Tests

All must pass before the work is called finished.

- all 9 move combinations: 3 creator wins, 3 opponent wins, 3 ties, with exact balances
- reveal with the wrong salt, and with the wrong move
- invalid move values on join and on reveal
- cancel before a join succeeds, cancel after a join fails
- forfeit before the timeout fails, forfeit after the timeout succeeds
- reveal after the deadline but before a forfeit claim succeeds
- stake mismatch on join, stake below the minimum on create
- a very large stake settles without overflow
- double join, double reveal, reveal after cancel, cancel after settle
- non-player attempts at reveal, cancel, and forfeit, and the creator joining their own game
- the treasury wallet creating or joining a game fails
- `min_stake` below the floor is rejected, and config initialization by anyone
  other than the upgrade authority fails
- paused: create and join fail, reveal, cancel, and forfeit still succeed
- config: non-admin update fails, fee above 1000 bps fails, a config change does not alter a live game
- fee math: 250 bps, 0 bps, 1000 bps, odd lamport amounts that round, and the waived-fee case
- rent returns to the creator after settle, cancel, and forfeit
- a commitment copied from another creator fails to reveal

## 9. Order of work

1. Install the toolchain and prove a trivial program builds.
2. Program and tests.
3. Devnet deploy and config initialization.
4. Frontend.
5. README with setup, architecture diagram, how to play, and how to run tests; SECURITY.md.
6. Create the public GitHub repo and push.

## 10. Player stats and leaderboard

Added after the first release.

- **Account.** `PlayerStats`, PDA seeds `["stats", player]`: games, wins, losses,
  ties, forfeits (games lost by not revealing), staked, received, fees paid. One
  per player, never closed.
- **Creation.** `create_game` and `join_game` create the signer's stats account
  on their first game (`init_if_needed`), at their cost of about 0.0016 SOL.
- **Updates.** `reveal` and `claim_forfeit` update both players. They also create
  a missing stats account, paid by whoever settles, so a game created before this
  change can always be settled.
- **Not counted.** Cancelled games.
- **Frontend.** A Leaderboard page ranks players by net SOL (received minus
  staked), then wins, then fewest games. It also lists recent games, read from
  transaction history through a server route cached for one minute.
