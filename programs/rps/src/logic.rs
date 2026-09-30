use anchor_lang::prelude::*;
use solana_sha256_hasher::hashv;

use crate::{constants::BPS_DENOMINATOR, errors::RpsError, state::Outcome};

pub const ROCK: u8 = 0;
pub const PAPER: u8 = 1;
pub const SCISSORS: u8 = 2;

pub fn is_valid_move(mv: u8) -> bool {
    matches!(mv, ROCK | PAPER | SCISSORS)
}

/// sha256(move_byte || salt || creator_pubkey). The creator key stops another
/// player reusing someone else's commitment in their own game.
pub fn commitment_hash(mv: u8, salt: &[u8; 32], creator: &Pubkey) -> [u8; 32] {
    hashv(&[&[mv][..], &salt[..], creator.as_ref()]).to_bytes()
}

/// Both moves must already be validated with `is_valid_move`.
pub fn outcome(creator_move: u8, opponent_move: u8) -> Outcome {
    match (creator_move, opponent_move) {
        (ROCK, SCISSORS) | (PAPER, ROCK) | (SCISSORS, PAPER) => Outcome::CreatorWins,
        (a, b) if a == b => Outcome::Tie,
        _ => Outcome::OpponentWins,
    }
}

/// Fee in lamports, rounded down so rounding favours the winner.
pub fn compute_fee(pot: u64, fee_bps: u16) -> Result<u64> {
    let fee = u128::from(pot)
        .checked_mul(u128::from(fee_bps))
        .ok_or(RpsError::MathOverflow)?
        .checked_div(BPS_DENOMINATOR)
        .ok_or(RpsError::MathOverflow)?;
    u64::try_from(fee).map_err(|_| error!(RpsError::MathOverflow))
}

#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::prelude::Pubkey;

    #[test]
    fn moves_zero_to_two_are_valid() {
        assert!(is_valid_move(0));
        assert!(is_valid_move(1));
        assert!(is_valid_move(2));
        assert!(!is_valid_move(3));
        assert!(!is_valid_move(255));
    }

    #[test]
    fn outcome_table_covers_all_nine_combinations() {
        use crate::state::Outcome::*;
        let expected = [
            (0, 0, Tie),
            (0, 1, OpponentWins),
            (0, 2, CreatorWins),
            (1, 0, CreatorWins),
            (1, 1, Tie),
            (1, 2, OpponentWins),
            (2, 0, OpponentWins),
            (2, 1, CreatorWins),
            (2, 2, Tie),
        ];
        for (creator, opponent, want) in expected {
            assert_eq!(outcome(creator, opponent), want, "{creator} vs {opponent}");
        }
    }

    #[test]
    fn fee_rounds_down() {
        assert_eq!(compute_fee(20_000_002, 250).unwrap(), 500_000);
        assert_eq!(compute_fee(24_691_358, 333).unwrap(), 822_222);
        assert_eq!(compute_fee(2_000_000_000, 0).unwrap(), 0);
        assert_eq!(compute_fee(2_000_000_000, 1_000).unwrap(), 200_000_000);
        assert_eq!(compute_fee(39, 250).unwrap(), 0);
    }

    #[test]
    fn fee_does_not_overflow_at_the_top_of_the_range() {
        assert_eq!(compute_fee(u64::MAX, 1_000).unwrap(), u64::MAX / 10);
    }

    #[test]
    fn commitment_depends_on_move_salt_and_creator() {
        let creator = Pubkey::new_unique();
        let other = Pubkey::new_unique();
        let salt = [7u8; 32];
        let base = commitment_hash(0, &salt, &creator);
        assert_ne!(base, commitment_hash(1, &salt, &creator));
        assert_ne!(base, commitment_hash(0, &[8u8; 32], &creator));
        assert_ne!(base, commitment_hash(0, &salt, &other));
        assert_eq!(base, commitment_hash(0, &salt, &creator));
    }
}
