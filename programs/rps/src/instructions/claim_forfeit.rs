use anchor_lang::prelude::*;

use crate::{
    constants::{GAME_SEED, STATS_SEED},
    errors::RpsError,
    events::GameForfeited,
    state::{Finish, Game, GameStatus, PlayerStats},
};

#[derive(Accounts)]
pub struct ClaimForfeit<'info> {
    #[account(mut)]
    pub opponent: Signer<'info>,
    #[account(
        mut,
        seeds = [GAME_SEED, game.creator.as_ref(), &game.game_id.to_le_bytes()],
        bump = game.bump,
        has_one = opponent @ RpsError::Unauthorized,
        has_one = creator @ RpsError::Unauthorized,
        has_one = treasury @ RpsError::InvalidTreasury,
        close = creator
    )]
    pub game: Account<'info, Game>,
    /// CHECK: only receives the game account's rent; `has_one` pins it to the stored creator.
    #[account(mut)]
    pub creator: UncheckedAccount<'info>,
    /// CHECK: only receives lamports; `has_one` pins it to the treasury stored in the game.
    #[account(mut)]
    pub treasury: UncheckedAccount<'info>,
    /// Normally created when the game was. `init_if_needed` covers a game that
    /// predates stats, so a forfeit can always be claimed.
    #[account(
        init_if_needed,
        payer = opponent,
        space = 8 + PlayerStats::INIT_SPACE,
        seeds = [STATS_SEED, game.creator.as_ref()],
        bump
    )]
    pub creator_stats: Account<'info, PlayerStats>,
    #[account(
        init_if_needed,
        payer = opponent,
        space = 8 + PlayerStats::INIT_SPACE,
        seeds = [STATS_SEED, game.opponent.as_ref()],
        bump
    )]
    pub opponent_stats: Account<'info, PlayerStats>,
    pub system_program: Program<'info, System>,
}

impl<'info> ClaimForfeit<'info> {
    pub fn handle(&mut self, creator_stats_bump: u8, opponent_stats_bump: u8) -> Result<()> {
        require!(
            self.game.status == GameStatus::Joined,
            RpsError::InvalidGameState
        );
        let deadline = self
            .game
            .joined_at
            .checked_add(self.game.reveal_timeout)
            .ok_or(RpsError::MathOverflow)?;
        require!(
            Clock::get()?.unix_timestamp >= deadline,
            RpsError::RevealTimeoutNotReached
        );

        // The opponent wins by forfeit and pays the same fee as any winner.
        // Otherwise a creator who has lost could starve the treasury simply by
        // never revealing.
        let pot = self
            .game
            .stake
            .checked_mul(2)
            .ok_or(RpsError::MathOverflow)?;
        let fee = self
            .game
            .payable_fee(pot, &self.treasury.to_account_info())?;
        let payout = pot.checked_sub(fee).ok_or(RpsError::MathOverflow)?;

        self.game.sub_lamports(payout)?;
        self.opponent.add_lamports(payout)?;
        if fee > 0 {
            self.game.sub_lamports(fee)?;
            self.treasury.add_lamports(fee)?;
        }

        let stake = self.game.stake;
        self.creator_stats
            .open(self.game.creator, creator_stats_bump);
        self.creator_stats.record(Finish::Lost, stake, 0, 0, true)?;
        self.opponent_stats
            .open(self.game.opponent, opponent_stats_bump);
        self.opponent_stats
            .record(Finish::Won, stake, payout, fee, false)?;

        emit!(GameForfeited {
            game: self.game.key(),
            creator: self.creator.key(),
            opponent: self.opponent.key(),
            pot,
            payout,
            fee,
        });
        Ok(())
    }
}
