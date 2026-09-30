# Solana RPS

Commit-reveal Rock-Paper-Scissors on Solana where two players wager SOL. The
winner pays a small fee that goes to a buyback wallet.

**Devnet only.** This program is unaudited. See [SECURITY.md](SECURITY.md).

| | |
|---|---|
| Program ID (devnet) | `Fmi151zsEHFgRJeUXNgDjbo4aLA6PRQ63ktWM6sCEgkA` |
| Config account | `Ea7DkC7AGUVv1e9dfQKY6QEBHYsDT3rGcQhs1rXRARPf` |
| Buyback wallet (devnet) | `8Besg2ve5XhT7X9ckA3H96CnER9bBW7TwbincQ6QFTcu` |
| Fee | 2.5% of the pot, paid by the winner |
| Minimum stake | 0.01 SOL, no maximum |
| Reveal timeout | 10 minutes |

[View the program on Solana Explorer](https://explorer.solana.com/address/Fmi151zsEHFgRJeUXNgDjbo4aLA6PRQ63ktWM6sCEgkA?cluster=devnet)

## How a game works

1. **Create.** The creator picks a move and a random 32-byte salt, and submits
   `sha256(move || salt || creator_pubkey)` along with their stake. Nobody can
   see the move.
2. **Join.** An opponent matches the stake and plays their move in the open.
3. **Reveal.** The creator reveals the move and salt. The program checks the
   hash and pays out: the winner takes the pot minus the fee, a tie refunds both.
4. **If something goes wrong.** The creator can cancel any time before a join.
   If the creator does not reveal within the timeout, the opponent claims the
   whole pot.

## Requirements

- Rust 1.89 or newer
- Agave (Solana) CLI 4.1.2
- Anchor CLI 1.2.0
- Node 20 or newer and pnpm, for the devnet scripts

## Build

On Windows:

    pwsh scripts/build.ps1

The script sets two options that Anchor's defaults get wrong on native Windows.
The reasons are in the script. On macOS or Linux, `anchor build` works as is.

## Run the tests

    cargo test -p rps

The tests run against LiteSVM, so no validator is needed. Build first: the
integration tests load `target/deploy/rps.so`.

## Devnet scripts

    pnpm install
    pnpm run smoke-devnet   # plays one real game on devnet and checks the payouts
    pnpm run init-config    # one-time setup after a fresh deploy

Both scripts refuse to run against anything other than devnet.
