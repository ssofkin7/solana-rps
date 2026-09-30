mod common;

use {common::*, rps::errors::RpsError, solana_signer::Signer};

#[test]
fn forfeit_before_the_timeout_is_rejected() {
    let (mut env, _admin) = setup();
    let created = create(&mut env, 0, SOL);
    let opponent = join(&mut env, &created, 1);
    let ix = ix_claim_forfeit(&opponent.pubkey(), &created.game, &created.creator.pubkey());

    let result = send(&mut env, ix.clone(), &[&opponent]);
    assert_rps_err(result, RpsError::RevealTimeoutNotReached);

    advance_clock(&mut env, DEFAULT_TIMEOUT - 1);
    let result = send(&mut env, ix, &[&opponent]);
    assert_rps_err(result, RpsError::RevealTimeoutNotReached);
    assert!(game_exists(&env, &created.game));
}

#[test]
fn forfeit_at_the_timeout_pays_the_whole_pot_with_no_fee() {
    let (mut env, _admin) = setup();
    let stake = SOL;
    let created = create(&mut env, 0, stake);
    let opponent = join(&mut env, &created, 1);
    let creator_before = balance(&env, &created.creator.pubkey());
    let opponent_before = balance(&env, &opponent.pubkey());
    let treasury_before = balance(&env, &env.treasury);

    advance_clock(&mut env, DEFAULT_TIMEOUT);
    send(
        &mut env,
        ix_claim_forfeit(&opponent.pubkey(), &created.game, &created.creator.pubkey()),
        &[&opponent],
    )
    .unwrap();

    assert_eq!(
        balance(&env, &opponent.pubkey()),
        opponent_before + 2 * stake
    );
    assert_eq!(
        balance(&env, &created.creator.pubkey()),
        creator_before + game_rent(&env),
        "rent returns to the creator"
    );
    assert_eq!(balance(&env, &env.treasury), treasury_before);
    assert!(!game_exists(&env, &created.game));
}

#[test]
fn a_late_reveal_is_accepted_until_the_forfeit_is_claimed() {
    let (mut env, _admin) = setup();
    let created = create(&mut env, 1, SOL); // paper beats rock
    let opponent = join(&mut env, &created, 0);
    let creator_before = balance(&env, &created.creator.pubkey());

    advance_clock(&mut env, DEFAULT_TIMEOUT + 3_600);
    reveal(&mut env, &created, &opponent.pubkey()).unwrap();

    assert_eq!(
        balance(&env, &created.creator.pubkey()),
        creator_before + game_rent(&env) + 2 * SOL - 50_000_000
    );
}

#[test]
fn reveal_after_a_forfeit_claim_fails() {
    let (mut env, _admin) = setup();
    let created = create(&mut env, 1, SOL);
    let opponent = join(&mut env, &created, 0);
    advance_clock(&mut env, DEFAULT_TIMEOUT);
    send(
        &mut env,
        ix_claim_forfeit(&opponent.pubkey(), &created.game, &created.creator.pubkey()),
        &[&opponent],
    )
    .unwrap();
    let opponent_after = balance(&env, &opponent.pubkey());

    let result = reveal(&mut env, &created, &opponent.pubkey());
    assert!(result.is_err());
    assert_eq!(balance(&env, &opponent.pubkey()), opponent_after);
}

#[test]
fn claiming_twice_fails() {
    let (mut env, _admin) = setup();
    let created = create(&mut env, 0, SOL);
    let opponent = join(&mut env, &created, 1);
    advance_clock(&mut env, DEFAULT_TIMEOUT);
    let ix = ix_claim_forfeit(&opponent.pubkey(), &created.game, &created.creator.pubkey());
    send(&mut env, ix.clone(), &[&opponent]).unwrap();
    let opponent_after = balance(&env, &opponent.pubkey());
    let result = send(&mut env, ix, &[&opponent]);
    assert!(result.is_err());
    assert_eq!(balance(&env, &opponent.pubkey()), opponent_after);
}

#[test]
fn forfeit_after_a_reveal_fails() {
    let (mut env, _admin) = setup();
    let created = create(&mut env, 0, SOL);
    let opponent = join(&mut env, &created, 1);
    reveal(&mut env, &created, &opponent.pubkey()).unwrap();
    advance_clock(&mut env, DEFAULT_TIMEOUT);
    let result = send(
        &mut env,
        ix_claim_forfeit(&opponent.pubkey(), &created.game, &created.creator.pubkey()),
        &[&opponent],
    );
    assert!(result.is_err());
}

#[test]
fn only_the_opponent_can_claim() {
    let (mut env, _admin) = setup();
    let created = create(&mut env, 0, SOL);
    let _opponent = join(&mut env, &created, 1);
    advance_clock(&mut env, DEFAULT_TIMEOUT);

    let stranger = funded(&mut env, SOL);
    let result = send(
        &mut env,
        ix_claim_forfeit(&stranger.pubkey(), &created.game, &created.creator.pubkey()),
        &[&stranger],
    );
    assert_rps_err(result, RpsError::Unauthorized);

    let result = send(
        &mut env,
        ix_claim_forfeit(
            &created.creator.pubkey(),
            &created.game,
            &created.creator.pubkey(),
        ),
        &[&created.creator],
    );
    assert!(
        result.is_err(),
        "the creator cannot claim their own forfeit"
    );
    assert!(game_exists(&env, &created.game));
}

#[test]
fn forfeit_on_a_game_nobody_joined_fails() {
    let (mut env, _admin) = setup();
    let created = create(&mut env, 0, SOL);
    advance_clock(&mut env, DEFAULT_TIMEOUT);
    let stranger = funded(&mut env, SOL);
    let result = send(
        &mut env,
        ix_claim_forfeit(&stranger.pubkey(), &created.game, &created.creator.pubkey()),
        &[&stranger],
    );
    assert_rps_err(result, RpsError::Unauthorized);
    assert_eq!(balance(&env, &created.game), SOL + game_rent(&env));
}

#[test]
fn the_rent_cannot_be_redirected_away_from_the_creator() {
    let (mut env, _admin) = setup();
    let created = create(&mut env, 0, SOL);
    let opponent = join(&mut env, &created, 1);
    advance_clock(&mut env, DEFAULT_TIMEOUT);
    let result = send(
        &mut env,
        ix_claim_forfeit(&opponent.pubkey(), &created.game, &opponent.pubkey()),
        &[&opponent],
    );
    assert!(result.is_err());
    assert!(game_exists(&env, &created.game));
}

#[test]
fn a_timeout_change_does_not_shorten_a_live_game() {
    let (mut env, admin) = setup();
    let created = create(&mut env, 0, SOL);
    let mut params = no_update();
    params.reveal_timeout = Some(60);
    send(
        &mut env,
        ix_update_config(&admin.pubkey(), params),
        &[&admin],
    )
    .unwrap();

    let opponent = join(&mut env, &created, 1);
    let ix = ix_claim_forfeit(&opponent.pubkey(), &created.game, &created.creator.pubkey());
    advance_clock(&mut env, 61);
    let result = send(&mut env, ix.clone(), &[&opponent]);
    assert_rps_err(result, RpsError::RevealTimeoutNotReached);

    advance_clock(&mut env, DEFAULT_TIMEOUT - 61);
    send(&mut env, ix, &[&opponent]).unwrap();
}

#[test]
fn forfeit_works_while_paused() {
    let (mut env, admin) = setup();
    let created = create(&mut env, 0, SOL);
    let opponent = join(&mut env, &created, 1);
    send(&mut env, ix_set_paused(&admin.pubkey(), true), &[&admin]).unwrap();
    advance_clock(&mut env, DEFAULT_TIMEOUT);
    send(
        &mut env,
        ix_claim_forfeit(&opponent.pubkey(), &created.game, &created.creator.pubkey()),
        &[&opponent],
    )
    .unwrap();
    assert!(!game_exists(&env, &created.game));
}
