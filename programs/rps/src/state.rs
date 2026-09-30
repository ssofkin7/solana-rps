use anchor_lang::prelude::*;

use crate::{constants::*, errors::RpsError, logic::compute_fee};

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

impl Game {
    /// The fee owed on `pot`, or zero when paying it would leave the treasury
    /// below the rent-exempt minimum. Without the waiver an empty treasury
    /// would make small settlements fail outright.
    pub fn payable_fee(&self, pot: u64, treasury: &AccountInfo) -> Result<u64> {
        let fee = compute_fee(pot, self.fee_bps)?;
        if fee == 0 {
            return Ok(0);
        }
        let rent_minimum = Rent::get()?.minimum_balance(treasury.data_len());
        let balance_after = treasury
            .lamports()
            .checked_add(fee)
            .ok_or(RpsError::MathOverflow)?;
        if balance_after < rent_minimum {
            Ok(0)
        } else {
            Ok(fee)
        }
    }
}

/// How a settled game ended for one player.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Finish {
    Won,
    Lost,
    Tied,
}

/// Lifetime record for one player. Created on their first game, updated at
/// every settlement, and never closed, so the leaderboard can be read straight
/// from the chain. Cancelled games are not counted.
#[account]
#[derive(InitSpace)]
pub struct PlayerStats {
    pub player: Pubkey,
    pub games: u64,
    pub wins: u64,
    pub losses: u64,
    pub ties: u64,
    /// Games this player lost by not revealing in time.
    pub forfeits: u64,
    /// Lamports this player put in, one stake per settled game.
    pub staked: u64,
    /// Lamports paid back to this player: winnings and tie refunds.
    pub received: u64,
    /// Lamports of fee taken from this player's winnings.
    pub fees_paid: u64,
    pub bump: u8,
}

impl PlayerStats {
    /// Fills in the owner the first time the account is used.
    pub fn open(&mut self, player: Pubkey, bump: u8) {
        if self.player == Pubkey::default() {
            self.player = player;
            self.bump = bump;
        }
    }

    pub fn record(
        &mut self,
        finish: Finish,
        stake: u64,
        received: u64,
        fee_paid: u64,
        forfeited: bool,
    ) -> Result<()> {
        self.games = add(self.games, 1)?;
        match finish {
            Finish::Won => self.wins = add(self.wins, 1)?,
            Finish::Lost => self.losses = add(self.losses, 1)?,
            Finish::Tied => self.ties = add(self.ties, 1)?,
        }
        if forfeited {
            self.forfeits = add(self.forfeits, 1)?;
        }
        self.staked = add(self.staked, stake)?;
        self.received = add(self.received, received)?;
        self.fees_paid = add(self.fees_paid, fee_paid)?;
        Ok(())
    }
}

fn add(total: u64, amount: u64) -> Result<u64> {
    total
        .checked_add(amount)
        .ok_or_else(|| error!(RpsError::MathOverflow))
}
