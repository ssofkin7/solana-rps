mod common;

use {
    common::*,
    rps::{errors::RpsError, state::GameStatus},
    solana_keypair::Keypair,
    solana_signer::Signer,
};

#[test]
fn join_matches_the_stake_and_records_move_and_time() {
    let (mut env, _admin) = setup();
    let stake = SOL;
    let created = create(&mut env, 0, stake);
    advance_clock(&mut env, 30);
    let joined_at = now(&env);
    let opponent = join(&mut env, &created, 2);

    assert_eq!(balance(&env, &opponent.pubkey()), SOL - stats_rent(&env));
    assert_eq!(balance(&env, &created.game), 2 * stake + game_rent(&env));

    let game = read_game(&env, &created.game).unwrap();
    assert_eq!(game.status, GameStatus::Joined);
    assert_eq!(game.opponent, opponent.pubkey());
    assert_eq!(game.opponent_move, 2);
    assert_eq!(game.joined_at, joined_at);
}

#[test]
fn join_with_the_wrong_expected_stake_is_rejected() {
    let (mut env, _admin) = setup();
    let created = create(&mut env, 0, SOL);
    let opponent = funded(&mut env, 5 * SOL);
    for wrong in [SOL - 1, SOL + 1, 0] {
        let result = send(
            &mut env,
            ix_join_game(
                &opponent.pubkey(),
                &created.game,
                1,
                wrong,
                created.commitment,
            ),
            &[&opponent],
        );
        assert_rps_err(result, RpsError::StakeMismatch);
    }
    assert_eq!(balance(&env, &opponent.pubkey()), 5 * SOL);
}

#[test]
fn join_with_an_invalid_move_is_rejected() {
    let (mut env, _admin) = setup();
    let created = create(&mut env, 0, SOL);
    let opponent = funded(&mut env, 5 * SOL);
    for bad in [3u8, 4, 255] {
        let result = send(
            &mut env,
            ix_join_game(
                &opponent.pubkey(),
                &created.game,
                bad,
                SOL,
                created.commitment,
            ),
            &[&opponent],
        );
        assert_rps_err(result, RpsError::InvalidMove);
    }
}

#[test]
fn a_second_join_is_rejected() {
    let (mut env, _admin) = setup();
    let created = create(&mut env, 0, SOL);
    let first = join(&mut env, &created, 1);
    let second = funded(&mut env, 5 * SOL);
    let result = send(
        &mut env,
        ix_join_game(&second.pubkey(), &created.game, 2, SOL, created.commitment),
        &[&second],
    );
    assert_rps_err(result, RpsError::InvalidGameState);

    let again = send(
        &mut env,
        ix_join_game(&first.pubkey(), &created.game, 1, SOL, created.commitment),
        &[&first],
    );
    assert_rps_err(again, RpsError::InvalidGameState);
    assert_eq!(
        read_game(&env, &created.game).unwrap().opponent,
        first.pubkey()
    );
}

#[test]
fn the_creator_cannot_join_their_own_game() {
    let (mut env, _admin) = setup();
    let created = create(&mut env, 0, DEFAULT_MIN_STAKE);
    let result = send(
        &mut env,
        ix_join_game(
            &created.creator.pubkey(),
            &created.game,
            1,
            DEFAULT_MIN_STAKE,
            created.commitment,
        ),
        &[&created.creator],
    );
    assert_rps_err(result, RpsError::CannotJoinOwnGame);
}

#[test]
fn the_treasury_wallet_cannot_join_a_game() {
    let (mut env, _admin) = setup();
    let created = create(&mut env, 0, DEFAULT_MIN_STAKE);
    let treasury = Keypair::new();
    // The game stores the treasury it was created under, so make that wallet the joiner.
    let mut game_account = env.svm.get_account(&created.game).unwrap();
    let game = read_game(&env, &created.game).unwrap();
    let offset = game_account
        .data
        .windows(32)
        .position(|window| window == game.treasury.as_ref())
        .unwrap();
    game_account.data[offset..offset + 32].copy_from_slice(treasury.pubkey().as_ref());
    env.svm.set_account(created.game, game_account).unwrap();
    fund(&mut env, &treasury.pubkey(), SOL);

    let result = send(
        &mut env,
        ix_join_game(
            &treasury.pubkey(),
            &created.game,
            1,
            DEFAULT_MIN_STAKE,
            created.commitment,
        ),
        &[&treasury],
    );
    assert_rps_err(result, RpsError::TreasuryCannotPlay);
}

#[test]
fn join_is_refused_while_paused() {
    let (mut env, admin) = setup();
    let created = create(&mut env, 0, SOL);
    send(&mut env, ix_set_paused(&admin.pubkey(), true), &[&admin]).unwrap();
    let opponent = funded(&mut env, 5 * SOL);
    let result = send(
        &mut env,
        ix_join_game(
            &opponent.pubkey(),
            &created.game,
            1,
            SOL,
            created.commitment,
        ),
        &[&opponent],
    );
    assert_rps_err(result, RpsError::Paused);
}

#[test]
fn cancel_after_a_join_is_rejected() {
    let (mut env, _admin) = setup();
    let created = create(&mut env, 0, SOL);
    let _opponent = join(&mut env, &created, 1);
    let result = send(
        &mut env,
        ix_cancel_game(&created.creator.pubkey(), &created.game),
        &[&created.creator],
    );
    assert_rps_err(result, RpsError::InvalidGameState);
    assert_eq!(balance(&env, &created.game), 2 * SOL + game_rent(&env));
}

#[test]
fn joining_a_cancelled_game_fails() {
    let (mut env, _admin) = setup();
    let created = create(&mut env, 0, SOL);
    send(
        &mut env,
        ix_cancel_game(&created.creator.pubkey(), &created.game),
        &[&created.creator],
    )
    .unwrap();
    let opponent = funded(&mut env, 5 * SOL);
    let result = send(
        &mut env,
        ix_join_game(
            &opponent.pubkey(),
            &created.game,
            1,
            SOL,
            created.commitment,
        ),
        &[&opponent],
    );
    assert!(result.is_err());
    assert_eq!(balance(&env, &opponent.pubkey()), 5 * SOL);
}

#[test]
fn a_creator_cannot_swap_the_commitment_under_a_pending_join() {
    let (mut env, _admin) = setup();
    let created = create(&mut env, 0, SOL); // committed to rock

    // The opponent answers rock with paper, against the game as they saw it.
    let opponent = funded(&mut env, 5 * SOL);
    let stale_join = ix_join_game(
        &opponent.pubkey(),
        &created.game,
        1,
        SOL,
        created.commitment,
    );

    // Before that join lands, the creator cancels and recreates the same game
    // id in one transaction, now committed to scissors.
    let swapped = commit(2, &created.salt, &created.creator.pubkey());
    send_many(
        &mut env,
        &[
            ix_cancel_game(&created.creator.pubkey(), &created.game),
            ix_create_game(&created.creator.pubkey(), created.game_id, SOL, swapped),
        ],
        &[&created.creator],
    )
    .unwrap();

    let result = send(&mut env, stale_join, &[&opponent]);
    assert_rps_err(result, RpsError::GameChanged);
    assert_eq!(balance(&env, &opponent.pubkey()), 5 * SOL);
    assert_eq!(
        read_game(&env, &created.game).unwrap().status,
        GameStatus::Open
    );
}

#[test]
fn join_with_the_wrong_expected_commitment_is_rejected() {
    let (mut env, _admin) = setup();
    let created = create(&mut env, 0, SOL);
    let opponent = funded(&mut env, 5 * SOL);
    let result = send(
        &mut env,
        ix_join_game(&opponent.pubkey(), &created.game, 1, SOL, [0u8; 32]),
        &[&opponent],
    );
    assert_rps_err(result, RpsError::GameChanged);
    assert_eq!(balance(&env, &opponent.pubkey()), 5 * SOL);
}
