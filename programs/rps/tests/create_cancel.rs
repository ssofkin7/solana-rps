mod common;

use {
    anchor_lang::prelude::Pubkey,
    common::*,
    rps::{errors::RpsError, state::GameStatus},
    solana_signer::Signer,
};

#[test]
fn create_moves_the_stake_into_the_game_account() {
    let (mut env, _admin) = setup();
    let stake = SOL;
    let created = create(&mut env, 0, stake);
    let rent = game_rent(&env);

    assert_eq!(balance(&env, &created.game), stake + rent);
    assert_eq!(balance(&env, &created.creator.pubkey()), SOL - rent);

    let game = read_game(&env, &created.game).unwrap();
    assert_eq!(game.status, GameStatus::Open);
    assert_eq!(game.creator, created.creator.pubkey());
    assert_eq!(game.opponent, Pubkey::default());
    assert_eq!(game.game_id, created.game_id);
    assert_eq!(game.stake, stake);
    assert_eq!(
        game.commitment,
        commit(0, &created.salt, &created.creator.pubkey())
    );
    assert_eq!(game.fee_bps, 250);
    assert_eq!(game.treasury, env.treasury);
    assert_eq!(game.reveal_timeout, 600);
}

#[test]
fn status_creator_and_opponent_sit_at_the_documented_offsets() {
    let (mut env, _admin) = setup();
    let created = create(&mut env, 1, SOL);
    let data = env.svm.get_account(&created.game).unwrap().data;
    assert_eq!(data[8], 0, "status byte: Open");
    assert_eq!(&data[9..41], created.creator.pubkey().as_ref());
    assert_eq!(&data[41..73], &[0u8; 32], "opponent is unset");
    assert_eq!(&data[73..81], &created.game_id.to_le_bytes());
}

#[test]
fn stake_below_the_minimum_is_rejected() {
    let (mut env, _admin) = setup();
    let creator = funded(&mut env, SOL);
    let commitment = commit(0, &[1u8; 32], &creator.pubkey());
    let result = send(
        &mut env,
        ix_create_game(&creator.pubkey(), 1, DEFAULT_MIN_STAKE - 1, commitment),
        &[&creator],
    );
    assert_rps_err(result, RpsError::StakeTooLow);
}

#[test]
fn stake_at_exactly_the_minimum_is_accepted() {
    let (mut env, _admin) = setup();
    let created = create(&mut env, 0, DEFAULT_MIN_STAKE);
    assert!(game_exists(&env, &created.game));
}

#[test]
fn create_is_refused_while_paused() {
    let (mut env, admin) = setup();
    send(&mut env, ix_set_paused(&admin.pubkey(), true), &[&admin]).unwrap();
    let creator = funded(&mut env, 2 * SOL);
    let commitment = commit(0, &[1u8; 32], &creator.pubkey());
    let result = send(
        &mut env,
        ix_create_game(&creator.pubkey(), 1, SOL, commitment),
        &[&creator],
    );
    assert_rps_err(result, RpsError::Paused);
}

#[test]
fn the_treasury_wallet_cannot_create_a_game() {
    let (mut env, admin) = setup();
    let treasury = funded(&mut env, 2 * SOL);
    let mut params = no_update();
    params.treasury = Some(treasury.pubkey());
    send(&mut env, ix_update_config(&admin.pubkey(), params), &[&admin]).unwrap();

    let commitment = commit(0, &[1u8; 32], &treasury.pubkey());
    let result = send(
        &mut env,
        ix_create_game(&treasury.pubkey(), 1, SOL, commitment),
        &[&treasury],
    );
    assert_rps_err(result, RpsError::TreasuryCannotPlay);
}

#[test]
fn the_same_game_id_cannot_be_created_twice_while_open() {
    let (mut env, _admin) = setup();
    let created = create(&mut env, 0, DEFAULT_MIN_STAKE);
    let commitment = commit(0, &created.salt, &created.creator.pubkey());
    let result = send(
        &mut env,
        ix_create_game(
            &created.creator.pubkey(),
            created.game_id,
            DEFAULT_MIN_STAKE,
            commitment,
        ),
        &[&created.creator],
    );
    assert!(result.is_err());
}

#[test]
fn cancel_refunds_stake_and_rent_and_closes_the_game() {
    let (mut env, _admin) = setup();
    let stake = SOL;
    let created = create(&mut env, 2, stake);
    let treasury_before = balance(&env, &env.treasury);

    send(
        &mut env,
        ix_cancel_game(&created.creator.pubkey(), &created.game),
        &[&created.creator],
    )
    .unwrap();

    assert_eq!(balance(&env, &created.creator.pubkey()), stake + SOL);
    assert!(!game_exists(&env, &created.game));
    assert_eq!(balance(&env, &created.game), 0);
    assert_eq!(balance(&env, &env.treasury), treasury_before);
}

#[test]
fn cancel_works_while_paused() {
    let (mut env, admin) = setup();
    let created = create(&mut env, 0, SOL);
    send(&mut env, ix_set_paused(&admin.pubkey(), true), &[&admin]).unwrap();
    send(
        &mut env,
        ix_cancel_game(&created.creator.pubkey(), &created.game),
        &[&created.creator],
    )
    .unwrap();
    assert_eq!(balance(&env, &created.creator.pubkey()), 2 * SOL);
}

#[test]
fn a_stranger_cannot_cancel() {
    let (mut env, _admin) = setup();
    let created = create(&mut env, 0, SOL);
    let stranger = funded(&mut env, SOL);
    let result = send(
        &mut env,
        ix_cancel_game(&stranger.pubkey(), &created.game),
        &[&stranger],
    );
    assert_rps_err(result, RpsError::Unauthorized);
    assert!(game_exists(&env, &created.game));
}

#[test]
fn cancelling_twice_fails() {
    let (mut env, _admin) = setup();
    let created = create(&mut env, 0, SOL);
    let ix = ix_cancel_game(&created.creator.pubkey(), &created.game);
    send(&mut env, ix.clone(), &[&created.creator]).unwrap();
    let result = send(&mut env, ix, &[&created.creator]);
    assert!(result.is_err());
    assert_eq!(balance(&env, &created.creator.pubkey()), 2 * SOL);
}

#[test]
fn a_game_id_can_be_reused_after_the_game_is_closed() {
    let (mut env, _admin) = setup();
    let created = create(&mut env, 0, DEFAULT_MIN_STAKE);
    send(
        &mut env,
        ix_cancel_game(&created.creator.pubkey(), &created.game),
        &[&created.creator],
    )
    .unwrap();

    let commitment = commit(1, &[9u8; 32], &created.creator.pubkey());
    send(
        &mut env,
        ix_create_game(
            &created.creator.pubkey(),
            created.game_id,
            DEFAULT_MIN_STAKE,
            commitment,
        ),
        &[&created.creator],
    )
    .unwrap();
    assert_eq!(
        read_game(&env, &created.game).unwrap().commitment,
        commitment
    );
}
