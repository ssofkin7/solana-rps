# Security

Solana RPS is a wagered Rock-Paper-Scissors program. It runs on **devnet only**.
It has not been audited. Do not deploy it to mainnet or use it with real funds
without an independent audit.

## What the program protects

- **Stakes.** Every lamport a player puts in leaves only by one of five paths:
  win, tie refund, cancel refund, forfeit payout, or the fee.
- **The hidden move.** The creator's move stays secret until they reveal it.
- **Fair terms.** The fee, treasury, and timeout a game was created under cannot
  change while it is in progress.

## Threat model

| Threat | Defence |
|---|---|
| A player copies another creator's commitment into their own game | The commitment is `sha256(move \|\| salt \|\| creator_pubkey)`. A copied commitment can never be revealed by a different creator. |
| The opponent guesses the creator's move from the commitment | The salt is 32 random bytes generated in the browser, so the three possible moves cannot be brute-forced. |
| The creator changes their move after seeing the opponent's | `reveal` recomputes the hash and rejects any move or salt that does not match. |
| The creator refuses to reveal a losing move | After the reveal timeout the opponent claims the pot, minus the normal fee, with `claim_forfeit`. |
| Replaying an action: double join, double reveal, cancel after join, cancel or forfeit after settlement | Every instruction checks the game status, and every settlement closes the game account in the same instruction, so a second action finds no account. |
| Passing a fake account: another wallet as opponent, treasury, or creator | `has_one` constraints pin each account to the key stored in the game. The game and config are PDAs checked by seeds and bump. |
| A forged game or config account | Anchor checks the owner program and the 8-byte discriminator on every typed account. |
| Someone else initializes the config right after deploy | `initialize_config` requires the signer to be the program's upgrade authority, read from the ProgramData account. |
| The admin changes the fee or treasury to take more from a live game | `create_game` copies `fee_bps`, `treasury`, and `reveal_timeout` into the game. Settlement reads only the copies. |
| The admin pauses to trap funds | Pause blocks only `create_game` and `join_game`. `reveal`, `cancel_game`, and `claim_forfeit` never check the flag. |
| The admin withdraws player funds | No admin instruction accepts a game account. The fee is capped at 1000 bps. |
| The creator sees a join coming, cancels, and recreates the game at the same address with a different move | `join_game` takes `expected_commitment` and fails unless it equals the game's commitment, so a join only ever lands on the game the opponent saw. |
| The treasury is set to an address that can never be credited (a sysvar or a program id), so every `reveal` fails and every creator is pushed into forfeit | The treasury must be passed as a writable, system-owned account whenever it is set, in `initialize_config` and `update_config`. |
| The fee wallet wagers on games it collects fees from | Policy, not a safety check: the treasury is refused at `create_game` and `join_game`. |
| An empty treasury makes small reveals fail, forcing forfeits | If the fee would leave the treasury below the rent-exempt minimum, the fee is waived and the winner receives the whole pot. |
| Dust stakes that cannot be refunded into an empty wallet | `min_stake` cannot be configured below 1,000,000 lamports. |
| Arithmetic overflow with unbounded stakes | All arithmetic is checked. The fee is computed in u128. The release profile also enables overflow checks. |
| The opponent wagers a different amount than they were shown | `join_game` takes `expected_stake` and fails unless it equals the game's stake. |
| A player credits a result to someone else's stats, or edits their own | Stats accounts are PDAs at `["stats", player]`. Settlement derives both from the players stored in the game, and only the program can write them. |
| A game created before stats existed can no longer be settled | `reveal` and `claim_forfeit` create a missing stats account on the spot (`init_if_needed`), paid by whoever is settling. Stats accounts are never closed, so they cannot be re-initialised. |

## Checks by instruction

### initialize_config
- `authority` signs and pays.
- `config` is created at PDA `["config"]`; a second call fails because it exists.
- `program` is this program, and its ProgramData address must equal `program_data`.
- `program_data.upgrade_authority_address` must equal `authority`.
- `treasury` is a writable, system-owned account.
- Fee is at most 1000 bps; minimum stake is at least 1,000,000 lamports; timeout
  is 60 to 86,400 seconds.

### update_config and set_paused
- `admin` signs; `config` is the `["config"]` PDA with `has_one = admin`.
- `update_config` re-runs every range check on the resulting values.
- A new treasury is passed as an optional account and must be writable and
  system-owned. Leaving it out keeps the current treasury.
- Neither takes a game account.

### create_game
- `creator` signs and pays.
- `config` is the `["config"]` PDA; the program must not be paused.
- `game` is created at PDA `["game", creator, game_id]`, so a creator cannot
  overwrite an open game.
- Stake is at least `min_stake`; the creator is not the treasury.
- The stake moves in through a system-program transfer signed by the creator.
- `creator_stats` is the `["stats", creator]` PDA, created on the first game at
  the creator's cost.

### join_game
- `opponent` signs.
- `config` and `game` are PDAs checked by seeds and stored bump; not paused.
- Status is `Open`; the move is 0, 1, or 2; the opponent is neither the creator
  nor the game's treasury; `expected_stake` equals the game's stake and
  `expected_commitment` equals the game's commitment.
- The stake moves in through a system-program transfer signed by the opponent,
  and the instruction fails as a whole if that transfer fails.
- `opponent_stats` is the `["stats", opponent]` PDA, created on the first game
  at the opponent's cost.

### reveal
- `creator` signs; `game` is a PDA with `has_one` on creator, opponent, and treasury.
- Status is `Joined`; the move is 0, 1, or 2; the hash matches the commitment.
- Payouts are computed with checked arithmetic and come out of the game account.
- Both stats accounts are the PDAs of the players stored in the game, and are
  updated with checked arithmetic.
- The game account is closed and its rent returns to the creator.

### cancel_game
- `creator` signs; `game` is a PDA with `has_one = creator`.
- Status is `Open`. Closing the account returns the stake and rent together.

### claim_forfeit
- `opponent` signs; `game` is a PDA with `has_one` on opponent, creator, and treasury.
- Status is `Joined`; the clock is at or past `joined_at + reveal_timeout`.
- The opponent receives the pot minus the same fee any winner pays, so a creator
  who has lost cannot starve the treasury by refusing to reveal. Rent returns to
  the creator.
- The opponent's stats record a win and the creator's record a loss and a forfeit.

## Code rules

- No `unwrap`, `expect`, or `panic!` in program code outside unit tests.
- All arithmetic uses `checked_*` operations.
- 81 tests cover every instruction, including all nine move combinations,
  wrong salt and move, every out-of-order action, non-player attempts, the
  paused state, fee rounding, and rent return. Run them with `cargo test -p rps`.

## Known limits

- **An open game can be joined while its creator is away.** Once someone joins,
  the creator has the reveal timeout (10 minutes by default) to reveal. A
  creator who leaves a game open and walks away can lose the stake by forfeit
  even with the winning move. Cancel a game before leaving it unattended.
- **Terms are fixed when the game is created.** The fee and timeout a creator
  gets are whatever the config holds when their transaction lands. The fee can
  never exceed 10% and the timeout can never be under 60 seconds.
- **Small fees into an empty treasury are waived.** Keep the treasury funded
  with at least 0.001 SOL so every fee is collected.
- **Losing the salt means losing the stake.** The program cannot tell a lost salt
  from a refusal to reveal. The frontend forces a backup download for this reason.
- **The opponent's move is public.** That is safe because the creator's move is
  already committed, but it means the creator knows the result before revealing.
  The forfeit timeout is what makes a losing creator reveal or lose anyway.
- **Validator clock.** Timeouts use the cluster clock, which can drift by a few
  seconds. The minimum timeout is 60 seconds.
- **Upgrade authority.** Whoever holds the program's upgrade authority can replace
  the program. On devnet this is the deployer's wallet.
- **A late reveal races a forfeit claim.** After the deadline, whichever
  transaction lands first decides the game.

## Reporting

Open a private security advisory on the GitHub repository.
