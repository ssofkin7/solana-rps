use anchor_lang::prelude::*;

use crate::{constants::*, errors::RpsError};

#[derive(AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, Debug, PartialEq, Eq)]
pub enum GameStatus {
    Open,
    Joined,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum Outcome {
    CreatorWins,
    OpponentWins,
    Tie,
}

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub treasury: Pubkey,
    pub fee_bps: u16,
    pub min_stake: u64,
    pub reveal_timeout: i64,
    pub paused: bool,
    pub bump: u8,
}

impl Config {
    pub fn validate(
        treasury: &Pubkey,
        fee_bps: u16,
        min_stake: u64,
        reveal_timeout: i64,
    ) -> Result<()> {
        require_keys_neq!(*treasury, Pubkey::default(), RpsError::InvalidTreasury);
        require!(fee_bps <= MAX_FEE_BPS, RpsError::FeeTooHigh);
        require!(min_stake >= MIN_STAKE_FLOOR, RpsError::MinStakeTooLow);
        require!(
            (MIN_REVEAL_TIMEOUT..=MAX_REVEAL_TIMEOUT).contains(&reveal_timeout),
            RpsError::InvalidTimeout
        );
        Ok(())
    }
}

/// Field order is part of the public interface: the frontend filters on
/// `status` at byte 8, `creator` at byte 9 and `opponent` at byte 41.
#[account]
#[derive(InitSpace)]
pub struct Game {
    pub status: GameStatus,
    pub creator: Pubkey,
    pub opponent: Pubkey,
    pub game_id: u64,
    pub stake: u64,
    pub commitment: [u8; 32],
    pub opponent_move: u8,
    pub created_at: i64,
    pub joined_at: i64,
    pub fee_bps: u16,
    pub treasury: Pubkey,
    pub reveal_timeout: i64,
    pub bump: u8,
}
