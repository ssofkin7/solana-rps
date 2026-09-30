mod common;

use {
    anchor_lang::prelude::Pubkey, common::*, rps::errors::RpsError, solana_keypair::Keypair,
    solana_signer::Signer,
};

/// Written out by hand so the test does not share logic with the program.
const CREATOR_WINS: [(u8, u8); 3] = [(0, 2), (1, 0), (2, 1)];

fn set_fee_bps(env: &mut Env, admin: &Keypair, fee_bps: u16) {
    let mut params = no_update();
    params.fee_bps = Some(fee_bps);
    send(env, ix_update_config(&admin.pubkey(), params), &[admin]).unwrap();
}

#[test]
fn all_nine_move_combinations_settle_with_exact_balances() {
    for creator_move in 0..3u8 {
        for opponent_move in 0..3u8 {
            let (mut env, _admin) = setup();
            let stake = SOL;
            let pot = 2 * stake;
            let fee = 50_000_000; // 2.5% of 2 SOL
            let created = create(&mut env, creator_move, stake);
            let opponent = join(&mut env, &created, opponent_move);
            let rent = game_rent(&env);

            let creator_before = balance(&env, &created.creator.pubkey());
            let opponent_before = balance(&env, &opponent.pubkey());
            let treasury_before = balance(&env, &env.treasury);

            reveal(&mut env, &created, &opponent.pubkey()).unwrap();

            let (creator_gain, opponent_gain, treasury_gain) = if creator_move == opponent_move {
                (stake, stake, 0)
            } else if CREATOR_WINS.contains(&(creator_move, opponent_move)) {
                (pot - fee, 0, fee)
            } else {
                (0, pot - fee, fee)
            };
            let label = format!("creator {creator_move} vs opponent {opponent_move}");
            assert_eq!(
                balance(&env, &created.creator.pubkey()),
                creator_before + rent + creator_gain,
                "{label}: creator"
            );
            assert_eq!(
                balance(&env, &opponent.pubkey()),
                opponent_before + opponent_gain,
                "{label}: opponent"
            );
            assert_eq!(
                balance(&env, &env.treasury),
                treasury_before + treasury_gain,
                "{label}: treasury"
            );
            assert!(!game_exists(&env, &created.game), "{label}: game closed");
            assert_eq!(balance(&env, &created.game), 0, "{label}: game drained");
        }
    }
}

#[test]
fn the_wrong_salt_is_rejected() {
    let (mut env, _admin) = setup();
    let created = create(&mut env, 0, SOL);
    let opponent = join(&mut env, &created, 1);
    let treasury = env.treasury;
    let result = send(
        &mut env,
        ix_reveal(
            &created.creator.pubkey(),
            &created.game,
            &opponent.pubkey(),
            &treasury,
            created.mv,
            [43u8; 32],
        ),
        &[&created.creator],
    );
    assert_rps_err(result, RpsError::CommitmentMismatch);
    assert!(game_exists(&env, &created.game));
}

#[test]
fn a_different_move_than_the_committed_one_is_rejected() {
    let (mut env, _admin) = setup();
    // Creator committed rock and lost to paper; they try to claim scissors instead.
    let created = create(&mut env, 0, SOL);
    let opponent = join(&mut env, &created, 1);
    let treasury = env.treasury;
    let result = send(
        &mut env,
        ix_reveal(
            &created.creator.pubkey(),
            &created.game,
            &opponent.pubkey(),
            &treasury,
            2,
            created.salt,
        ),
        &[&created.creator],
    );
    assert_rps_err(result, RpsError::CommitmentMismatch);
}

#[test]
fn an_invalid_move_value_is_rejected_on_reveal() {
    let (mut env, _admin) = setup();
    let creator = funded(&mut env, 2 * SOL);
    let salt = [5u8; 32];
    // A commitment to move 3 is accepted at creation because the move is hidden.
    let commitment = commit(3, &salt, &creator.pubkey());
    send(
        &mut env,
        ix_create_game(&creator.pubkey(), 1, SOL, commitment),
        &[&creator],
    )
    .unwrap();
    let game = game_address(&creator.pubkey(), 1);
    let opponent = funded(&mut env, 2 * SOL);
    send(
        &mut env,
        ix_join_game(&opponent.pubkey(), &game, 0, SOL),
        &[&opponent],
    )
    .unwrap();
    let treasury = env.treasury;
    let result = send(
        &mut env,
        ix_reveal(
            &creator.pubkey(),
            &game,
            &opponent.pubkey(),
            &treasury,
            3,
            salt,
        ),
        &[&creator],
    );
    assert_rps_err(result, RpsError::InvalidMove);
}

#[test]
fn a_commitment_copied_from_another_creator_cannot_be_revealed() {
    let (mut env, _admin) = setup();
    let original = create(&mut env, 1, SOL);
    let original_commitment = read_game(&env, &original.game).unwrap().commitment;

    // The copier reuses the commitment, and later somehow learns the move and salt.
    let copier = funded(&mut env, 2 * SOL);
    send(
        &mut env,
        ix_create_game(&copier.pubkey(), 7, SOL, original_commitment),
        &[&copier],
    )
    .unwrap();
    let copied_game = game_address(&copier.pubkey(), 7);
    let opponent = funded(&mut env, 2 * SOL);
    send(
        &mut env,
        ix_join_game(&opponent.pubkey(), &copied_game, 0, SOL),
        &[&opponent],
    )
    .unwrap();
    let treasury = env.treasury;
    let result = send(
        &mut env,
        ix_reveal(
            &copier.pubkey(),
            &copied_game,
            &opponent.pubkey(),
            &treasury,
            original.mv,
            original.salt,
        ),
        &[&copier],
    );
    assert_rps_err(result, RpsError::CommitmentMismatch);
}

#[test]
fn revealing_twice_fails() {
    let (mut env, _admin) = setup();
    let created = create(&mut env, 0, SOL);
    let opponent = join(&mut env, &created, 2);
    reveal(&mut env, &created, &opponent.pubkey()).unwrap();
    let creator_after = balance(&env, &created.creator.pubkey());
    let result = reveal(&mut env, &created, &opponent.pubkey());
    assert!(result.is_err());
    assert_eq!(balance(&env, &created.creator.pubkey()), creator_after);
}

#[test]
fn reveal_before_anyone_joined_fails() {
    let (mut env, _admin) = setup();
    let created = create(&mut env, 0, SOL);
    let nobody = Pubkey::new_unique();
    let result = reveal(&mut env, &created, &nobody);
    assert_rps_err(result, RpsError::Unauthorized);
    assert!(game_exists(&env, &created.game));
}

#[test]
fn cancel_after_settlement_fails() {
    let (mut env, _admin) = setup();
    let created = create(&mut env, 0, SOL);
    let opponent = join(&mut env, &created, 2);
    reveal(&mut env, &created, &opponent.pubkey()).unwrap();
    let result = send(
        &mut env,
        ix_cancel_game(&created.creator.pubkey(), &created.game),
        &[&created.creator],
    );
    assert!(result.is_err());
}

#[test]
fn only_the_creator_can_reveal() {
    let (mut env, _admin) = setup();
    let created = create(&mut env, 0, SOL);
    let opponent = join(&mut env, &created, 1);
    let treasury = env.treasury;
    let stranger = funded(&mut env, SOL);
    // Even with the right move and salt, a non-creator signer is refused.
    for impostor in [&opponent, &stranger] {
        let result = send(
            &mut env,
            ix_reveal(
                &impostor.pubkey(),
                &created.game,
                &opponent.pubkey(),
                &treasury,
                created.mv,
                created.salt,
            ),
            &[impostor],
        );
        assert!(result.is_err());
    }
    assert!(game_exists(&env, &created.game));
}

#[test]
fn substituted_opponent_or_treasury_accounts_are_rejected() {
    let (mut env, _admin) = setup();
    // Creator loses, and tries to redirect the payout and the fee.
    let created = create(&mut env, 0, SOL);
    let opponent = join(&mut env, &created, 1);
    let treasury = env.treasury;
    let accomplice = funded(&mut env, SOL);

    let result = send(
        &mut env,
        ix_reveal(
            &created.creator.pubkey(),
            &created.game,
            &accomplice.pubkey(),
            &treasury,
            created.mv,
            created.salt,
        ),
        &[&created.creator],
    );
    assert_rps_err(result, RpsError::Unauthorized);

    let result = send(
        &mut env,
        ix_reveal(
            &created.creator.pubkey(),
            &created.game,
            &opponent.pubkey(),
            &accomplice.pubkey(),
            created.mv,
            created.salt,
        ),
        &[&created.creator],
    );
    assert_rps_err(result, RpsError::InvalidTreasury);
}

#[test]
fn fee_math_rounds_down_for_every_rate() {
    // (stake, fee_bps, expected fee in lamports)
    let cases = [
        (10_000_001u64, 250u16, 500_000u64),
        (12_345_679, 333, 822_222),
        (SOL, 0, 0),
        (SOL, 1_000, 200_000_000),
        (SOL, 1, 200_000),
    ];
    for (stake, fee_bps, expected_fee) in cases {
        let (mut env, admin) = setup();
        set_fee_bps(&mut env, &admin, fee_bps);
        let created = create(&mut env, 1, stake); // paper
        let opponent = join(&mut env, &created, 0); // rock: creator wins
        let creator_before = balance(&env, &created.creator.pubkey());
        let treasury_before = balance(&env, &env.treasury);

        reveal(&mut env, &created, &opponent.pubkey()).unwrap();

        let label = format!("stake {stake} at {fee_bps} bps");
        assert_eq!(
            balance(&env, &env.treasury),
            treasury_before + expected_fee,
            "{label}: treasury"
        );
        assert_eq!(
            balance(&env, &created.creator.pubkey()),
            creator_before + game_rent(&env) + 2 * stake - expected_fee,
            "{label}: winner"
        );
    }
}

#[test]
fn config_changes_after_creation_do_not_touch_a_live_game() {
    let (mut env, admin) = setup();
    let original_treasury = env.treasury;
    let created = create(&mut env, 1, SOL);

    let new_treasury = Pubkey::new_unique();
    fund(&mut env, &new_treasury, SOL);
    let mut params = no_update();
    params.fee_bps = Some(1_000);
    params.treasury = Some(new_treasury);
    send(
        &mut env,
        ix_update_config(&admin.pubkey(), params),
        &[&admin],
    )
    .unwrap();

    let opponent = join(&mut env, &created, 0);
    let treasury_before = balance(&env, &original_treasury);
    reveal(&mut env, &created, &opponent.pubkey()).unwrap();

    assert_eq!(
        balance(&env, &original_treasury),
        treasury_before + 50_000_000,
        "the fee is the 2.5% agreed at creation, paid to the original treasury"
    );
    assert_eq!(balance(&env, &new_treasury), SOL);
}

#[test]
fn the_fee_is_waived_when_it_cannot_be_paid_into_an_empty_treasury() {
    let (mut env, admin) = setup();
    let empty_treasury = Pubkey::new_unique();
    let mut params = no_update();
    params.treasury = Some(empty_treasury);
    send(
        &mut env,
        ix_update_config(&admin.pubkey(), params),
        &[&admin],
    )
    .unwrap();

    // Pot 0.02 SOL, fee 500,000 lamports: below the rent-exempt minimum of 890,880.
    let stake = DEFAULT_MIN_STAKE;
    let created = create(&mut env, 1, stake);
    let opponent = join(&mut env, &created, 0);
    let creator_before = balance(&env, &created.creator.pubkey());

    reveal(&mut env, &created, &opponent.pubkey()).unwrap();

    assert_eq!(balance(&env, &empty_treasury), 0);
    assert_eq!(
        balance(&env, &created.creator.pubkey()),
        creator_before + game_rent(&env) + 2 * stake
    );
}

#[test]
fn an_empty_treasury_still_receives_a_fee_large_enough_to_be_rent_exempt() {
    let (mut env, admin) = setup();
    let empty_treasury = Pubkey::new_unique();
    let mut params = no_update();
    params.treasury = Some(empty_treasury);
    send(
        &mut env,
        ix_update_config(&admin.pubkey(), params),
        &[&admin],
    )
    .unwrap();

    let created = create(&mut env, 1, SOL);
    let opponent = join(&mut env, &created, 0);
    reveal(&mut env, &created, &opponent.pubkey()).unwrap();
    assert_eq!(balance(&env, &empty_treasury), 50_000_000);
}

#[test]
fn an_opponent_with_a_zero_balance_is_still_settled() {
    // Tie: the refund lands in an emptied wallet.
    let (mut env, _admin) = setup();
    let created = create(&mut env, 0, SOL);
    let opponent = funded(&mut env, SOL);
    send(
        &mut env,
        ix_join_game(&opponent.pubkey(), &created.game, 0, SOL),
        &[&opponent],
    )
    .unwrap();
    assert_eq!(balance(&env, &opponent.pubkey()), 0);
    reveal(&mut env, &created, &opponent.pubkey()).unwrap();
    assert_eq!(balance(&env, &opponent.pubkey()), SOL);

    // Loss: the opponent receives nothing and settlement still succeeds.
    let (mut env, _admin) = setup();
    let created = create(&mut env, 1, SOL);
    let opponent = funded(&mut env, SOL);
    send(
        &mut env,
        ix_join_game(&opponent.pubkey(), &created.game, 0, SOL),
        &[&opponent],
    )
    .unwrap();
    reveal(&mut env, &created, &opponent.pubkey()).unwrap();
    assert_eq!(balance(&env, &opponent.pubkey()), 0);
    assert!(!game_exists(&env, &created.game));
}

#[test]
fn a_very_large_stake_settles_exactly() {
    let (mut env, _admin) = setup();
    let stake: u64 = 9_000_000_000_000_000_000; // 9 billion SOL; the pot still fits in u64
    let created = create(&mut env, 1, stake);
    let opponent = join(&mut env, &created, 0);
    let creator_before = balance(&env, &created.creator.pubkey());
    let treasury_before = balance(&env, &env.treasury);

    reveal(&mut env, &created, &opponent.pubkey()).unwrap();

    let fee: u64 = 450_000_000_000_000_000; // 2.5% of 18e18
    assert_eq!(balance(&env, &env.treasury), treasury_before + fee);
    assert_eq!(
        balance(&env, &created.creator.pubkey()),
        creator_before + game_rent(&env) + 2 * stake - fee
    );
}

#[test]
fn a_stake_too_large_to_double_cannot_be_joined_and_can_be_cancelled() {
    let (mut env, _admin) = setup();
    let stake: u64 = 10_000_000_000_000_000_000; // doubling overflows u64
    let created = create(&mut env, 0, stake);
    let opponent = funded(&mut env, stake + SOL);
    let result = send(
        &mut env,
        ix_join_game(&opponent.pubkey(), &created.game, 1, stake),
        &[&opponent],
    );
    assert!(result.is_err());
    assert_eq!(balance(&env, &opponent.pubkey()), stake + SOL);

    send(
        &mut env,
        ix_cancel_game(&created.creator.pubkey(), &created.game),
        &[&created.creator],
    )
    .unwrap();
    assert_eq!(balance(&env, &created.creator.pubkey()), stake + SOL);
}

#[test]
fn reveal_works_while_paused() {
    let (mut env, admin) = setup();
    let created = create(&mut env, 0, SOL);
    let opponent = join(&mut env, &created, 2);
    send(&mut env, ix_set_paused(&admin.pubkey(), true), &[&admin]).unwrap();
    reveal(&mut env, &created, &opponent.pubkey()).unwrap();
    assert!(!game_exists(&env, &created.game));
}
