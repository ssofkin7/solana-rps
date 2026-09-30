mod common;

use {
    anchor_lang::prelude::Pubkey, common::*, rps::errors::RpsError, solana_signer::Signer,
};

#[test]
fn upgrade_authority_initializes_config_with_given_values() {
    let (env, admin) = setup();
    let config = read_config(&env);
    assert_eq!(config.admin, admin.pubkey());
    assert_eq!(config.treasury, env.treasury);
    assert_eq!(config.fee_bps, 250);
    assert_eq!(config.min_stake, 10_000_000);
    assert_eq!(config.reveal_timeout, 600);
    assert!(!config.paused);
}

#[test]
fn a_stranger_cannot_initialize_config() {
    let (mut env, _admin) = boot();
    let stranger = funded(&mut env, 10 * SOL);
    let treasury = env.treasury;
    let result = send(
        &mut env,
        ix_initialize_config(&stranger.pubkey(), default_params(treasury)),
        &[&stranger],
    );
    assert_rps_err(result, RpsError::Unauthorized);
}

#[test]
fn config_cannot_be_initialized_twice() {
    let (mut env, admin) = setup();
    let treasury = env.treasury;
    let result = send(
        &mut env,
        ix_initialize_config(&admin.pubkey(), default_params(treasury)),
        &[&admin],
    );
    assert!(result.is_err());
}

#[test]
fn initialize_rejects_out_of_range_values() {
    let cases = [
        (1_001u16, 10_000_000u64, 600i64, RpsError::FeeTooHigh),
        (250, 999_999, 600, RpsError::MinStakeTooLow),
        (250, 10_000_000, 59, RpsError::InvalidTimeout),
        (250, 10_000_000, 86_401, RpsError::InvalidTimeout),
    ];
    for (fee_bps, min_stake, reveal_timeout, expected) in cases {
        let (mut env, admin) = boot();
        let mut params = default_params(env.treasury);
        params.fee_bps = fee_bps;
        params.min_stake = min_stake;
        params.reveal_timeout = reveal_timeout;
        let result = send(
            &mut env,
            ix_initialize_config(&admin.pubkey(), params),
            &[&admin],
        );
        assert_rps_err(result, expected);
    }
}

#[test]
fn admin_updates_config() {
    let (mut env, admin) = setup();
    let new_treasury = Pubkey::new_unique();
    let mut params = no_update();
    params.treasury = Some(new_treasury);
    params.fee_bps = Some(1_000);
    params.min_stake = Some(1_000_000);
    params.reveal_timeout = Some(60);
    send(&mut env, ix_update_config(&admin.pubkey(), params), &[&admin]).unwrap();

    let config = read_config(&env);
    assert_eq!(config.treasury, new_treasury);
    assert_eq!(config.fee_bps, 1_000);
    assert_eq!(config.min_stake, 1_000_000);
    assert_eq!(config.reveal_timeout, 60);
    assert_eq!(config.admin, admin.pubkey());
}

#[test]
fn update_rejects_out_of_range_values() {
    let (mut env, admin) = setup();

    let mut params = no_update();
    params.fee_bps = Some(1_001);
    let result = send(&mut env, ix_update_config(&admin.pubkey(), params), &[&admin]);
    assert_rps_err(result, RpsError::FeeTooHigh);

    let mut params = no_update();
    params.min_stake = Some(999_999);
    let result = send(&mut env, ix_update_config(&admin.pubkey(), params), &[&admin]);
    assert_rps_err(result, RpsError::MinStakeTooLow);

    let mut params = no_update();
    params.reveal_timeout = Some(0);
    let result = send(&mut env, ix_update_config(&admin.pubkey(), params), &[&admin]);
    assert_rps_err(result, RpsError::InvalidTimeout);

    assert_eq!(read_config(&env).fee_bps, 250);
}

#[test]
fn a_stranger_cannot_update_or_pause() {
    let (mut env, _admin) = setup();
    let stranger = funded(&mut env, SOL);

    let mut params = no_update();
    params.fee_bps = Some(0);
    let result = send(
        &mut env,
        ix_update_config(&stranger.pubkey(), params),
        &[&stranger],
    );
    assert_rps_err(result, RpsError::Unauthorized);

    let result = send(
        &mut env,
        ix_set_paused(&stranger.pubkey(), true),
        &[&stranger],
    );
    assert_rps_err(result, RpsError::Unauthorized);
    assert!(!read_config(&env).paused);
}

#[test]
fn admin_can_hand_over_the_admin_role() {
    let (mut env, admin) = setup();
    let successor = funded(&mut env, SOL);
    let mut params = no_update();
    params.admin = Some(successor.pubkey());
    send(&mut env, ix_update_config(&admin.pubkey(), params), &[&admin]).unwrap();

    let result = send(&mut env, ix_set_paused(&admin.pubkey(), true), &[&admin]);
    assert_rps_err(result, RpsError::Unauthorized);
    send(
        &mut env,
        ix_set_paused(&successor.pubkey(), true),
        &[&successor],
    )
    .unwrap();
    assert!(read_config(&env).paused);
}

#[test]
fn admin_pauses_and_unpauses() {
    let (mut env, admin) = setup();
    send(&mut env, ix_set_paused(&admin.pubkey(), true), &[&admin]).unwrap();
    assert!(read_config(&env).paused);
    send(&mut env, ix_set_paused(&admin.pubkey(), false), &[&admin]).unwrap();
    assert!(!read_config(&env).paused);
}
