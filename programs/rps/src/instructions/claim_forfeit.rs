use anchor_lang::prelude::*;

use crate::{
    constants::GAME_SEED,
    errors::RpsError,
    events::GameForfeited,
    state::{Game, GameStatus},
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
        close = creator
    )]
    pub game: Account<'info, Game>,
    /// CHECK: only receives the game account's rent; `has_one` pins it to the stored creator.
    #[account(mut)]
    pub creator: UncheckedAccount<'info>,
}

impl<'info> ClaimForfeit<'info> {
    pub fn handle(&mut self) -> Result<()> {
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

        // The whole pot, with no fee: a forfeit is not a win on the merits.
        let pot = self
            .game
            .stake
            .checked_mul(2)
            .ok_or(RpsError::MathOverflow)?;
        self.game.sub_lamports(pot)?;
        self.opponent.add_lamports(pot)?;

        emit!(GameForfeited {
            game: self.game.key(),
            creator: self.creator.key(),
            opponent: self.opponent.key(),
            pot,
        });
        Ok(())
    }
}
