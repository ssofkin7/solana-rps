mod common;

use {anchor_lang::prelude::Pubkey, common::*, rps::state::PlayerStats, solana_signer::Signer};

fn stats(env: &Env, player: &Pubkey) -> PlayerStats {
    read_stats(env, player).expect("stats account should exist")
}

#[test]
fn creating_a_game_opens_the_creator_stats_account_at_their_cost() {
    let (mut env, _admin) = setup();
    let stake = SOL;
    let created = create(&mut env, 0, stake);

    let creator_stats = stats(&env, &created.creator.pubkey());
    assert_eq!(creator_stats.player, created.creator.pubkey());
    assert_eq!(creator_stats.games, 0);
    assert_eq!(
        balance(&env, &created.creator.pubkey()),
        SOL - game_rent(&env) - stats_rent(&env),
        "the creator pays the stake, the game rent and their own stats rent"
    );
}

#[test]
fn joining_opens_the_opponent_stats_account_at_their_cost() {
    let (mut env, _admin) = setup();
    let created = create(&mut env, 0, SOL);
    let opponent = join(&mut env, &created, 1);
    assert_eq!(stats(&env, &opponent.pubkey()).player, opponent.pubkey());
    assert_eq!(balance(&env, &opponent.pubkey()), SOL - stats_rent(&env));
}

#[test]
fn a_win_and_a_loss_are_recorded_with_exact_amounts() {
    let (mut env, _admin) = setup();
    let stake = SOL;
    let created = create(&mut env, 1, stake); // paper
    let opponent = join(&mut env, &created, 0); // rock
    reveal(&mut env, &created, &opponent.pubkey()).unwrap();

    let fee = 50_000_000;
    let winner = stats(&env, &created.creator.pubkey());
    assert_eq!(winner.games, 1);
    assert_eq!(winner.wins, 1);
    assert_eq!(winner.losses, 0);
    assert_eq!(winner.staked, stake);
    assert_eq!(winner.received, 2 * stake - fee);
    assert_eq!(winner.fees_paid, fee);

    let loser = stats(&env, &opponent.pubkey());
    assert_eq!(loser.games, 1);
    assert_eq!(loser.losses, 1);
    assert_eq!(loser.wins, 0);
    assert_eq!(loser.staked, stake);
    assert_eq!(loser.received, 0);
    assert_eq!(loser.fees_paid, 0);
}

#[test]
fn a_tie_is_recorded_for_both_players() {
    let (mut env, _admin) = setup();
    let created = create(&mut env, 2, SOL);
    let opponent = join(&mut env, &created, 2);
    reveal(&mut env, &created, &opponent.pubkey()).unwrap();

    for player in [created.creator.pubkey(), opponent.pubkey()] {
        let s = stats(&env, &player);
        assert_eq!((s.games, s.wins, s.losses, s.ties), (1, 0, 0, 1));
        assert_eq!((s.staked, s.received, s.fees_paid), (SOL, SOL, 0));
    }
}

#[test]
fn a_forfeit_counts_as_a_win_and_as_a_forfeit_loss() {
    let (mut env, _admin) = setup();
    let created = create(&mut env, 0, SOL);
    let opponent = join(&mut env, &created, 1);
    advance_clock(&mut env, DEFAULT_TIMEOUT);
    let treasury = env.treasury;
    send(
        &mut env,
        ix_claim_forfeit(
            &opponent.pubkey(),
            &created.game,
            &created.creator.pubkey(),
            &treasury,
        ),
        &[&opponent],
    )
    .unwrap();

    let fee = 50_000_000;
    let winner = stats(&env, &opponent.pubkey());
    assert_eq!((winner.games, winner.wins, winner.forfeits), (1, 1, 0));
    assert_eq!(winner.received, 2 * SOL - fee);
    assert_eq!(winner.fees_paid, fee);

    let creator = stats(&env, &created.creator.pubkey());
    assert_eq!((creator.games, creator.losses, creator.forfeits), (1, 1, 1));
    assert_eq!(creator.received, 0);
}

#[test]
fn a_cancelled_game_is_not_counted() {
    let (mut env, _admin) = setup();
    let created = create(&mut env, 0, SOL);
    send(
        &mut env,
        ix_cancel_game(&created.creator.pubkey(), &created.game),
        &[&created.creator],
    )
    .unwrap();
    let s = stats(&env, &created.creator.pubkey());
    assert_eq!((s.games, s.staked), (0, 0));
}

#[test]
fn stats_add_up_across_games_and_rent_is_paid_only_once() {
    let (mut env, _admin) = setup();
    let creator = funded(&mut env, 10 * SOL);
    let opponent = funded(&mut env, 10 * SOL);
    let stake = DEFAULT_MIN_STAKE;

    // Game 1: creator wins. Game 2: tie.
    for (game_id, creator_move, opponent_move) in [(1u64, 1u8, 0u8), (2, 0, 0)] {
        let salt = [game_id as u8; 32];
        let commitment = commit(creator_move, &salt, &creator.pubkey());
        send(
            &mut env,
            ix_create_game(&creator.pubkey(), game_id, stake, commitment),
            &[&creator],
        )
        .unwrap();
        let game = game_address(&creator.pubkey(), game_id);
        send(
            &mut env,
            ix_join_game(&opponent.pubkey(), &game, opponent_move, stake, commitment),
            &[&opponent],
        )
        .unwrap();
        let treasury = env.treasury;
        send(
            &mut env,
            ix_reveal(
                &creator.pubkey(),
                &game,
                &opponent.pubkey(),
                &treasury,
                creator_move,
                salt,
            ),
            &[&creator],
        )
        .unwrap();
    }

    let fee = 500_000; // 2.5% of 0.02 SOL
    let c = stats(&env, &creator.pubkey());
    assert_eq!((c.games, c.wins, c.losses, c.ties), (2, 1, 0, 1));
    assert_eq!(c.staked, 2 * stake);
    assert_eq!(c.received, (2 * stake - fee) + stake);
    let o = stats(&env, &opponent.pubkey());
    assert_eq!((o.games, o.wins, o.losses, o.ties), (2, 0, 1, 1));
    assert_eq!(o.received, stake);

    // Each paid its stats rent once, and every game rent came back.
    assert_eq!(
        balance(&env, &creator.pubkey()),
        10 * SOL - stats_rent(&env) - 2 * stake + c.received
    );
    assert_eq!(
        balance(&env, &opponent.pubkey()),
        10 * SOL - stats_rent(&env) - 2 * stake + o.received
    );
}

#[test]
fn settlement_creates_missing_stats_so_older_games_never_get_stuck() {
    // A game created before stats existed has no stats accounts. Simulate it
    // by deleting both after the join; the reveal must still settle.
    let (mut env, _admin) = setup();
    let created = create(&mut env, 1, SOL);
    let opponent = join(&mut env, &created, 0);
    for player in [created.creator.pubkey(), opponent.pubkey()] {
        env.svm
            .set_account(
                stats_address(&player),
                solana_account::Account {
                    lamports: 0,
                    data: vec![],
                    owner: anchor_lang::solana_program::system_program::ID,
                    executable: false,
                    rent_epoch: 0,
                },
            )
            .unwrap();
    }
    reveal(&mut env, &created, &opponent.pubkey()).unwrap();
    assert_eq!(stats(&env, &created.creator.pubkey()).wins, 1);
    assert_eq!(stats(&env, &opponent.pubkey()).losses, 1);
}

#[test]
fn another_player_stats_account_cannot_be_substituted() {
    let (mut env, _admin) = setup();
    let created = create(&mut env, 1, SOL);
    let opponent = join(&mut env, &created, 0);
    let bystander = create(&mut env, 0, SOL); // has a stats account of their own
    let treasury = env.treasury;

    let mut ix = ix_reveal(
        &created.creator.pubkey(),
        &created.game,
        &opponent.pubkey(),
        &treasury,
        created.mv,
        created.salt,
    );
    // Credit the win to the bystander instead of the creator.
    let creator_stats = stats_address(&created.creator.pubkey());
    for meta in ix.accounts.iter_mut() {
        if meta.pubkey == creator_stats {
            meta.pubkey = stats_address(&bystander.creator.pubkey());
        }
    }
    let result = send(&mut env, ix, &[&created.creator]);
    assert_anchor_err(result, &[ANCHOR_CONSTRAINT_SEEDS]);
    assert_eq!(stats(&env, &bystander.creator.pubkey()).wins, 0);
}
