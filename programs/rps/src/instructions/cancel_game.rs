use anchor_lang::prelude::*;

use crate::{
    constants::GAME_SEED,
    errors::RpsError,
    events::GameCancelled,
    state::{Game, GameStatus},
};

#[derive(Accounts)]
pub struct CancelGame<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    /// Closing the account returns the stake and the rent together.
    #[account(
        mut,
        seeds = [GAME_SEED, game.creator.as_ref(), &game.game_id.to_le_bytes()],
        bump = game.bump,
        has_one = creator @ RpsError::Unauthorized,
        close = creator
    )]
    pub game: Account<'info, Game>,
}

impl<'info> CancelGame<'info> {
    pub fn handle(&mut self) -> Result<()> {
        require!(
            self.game.status == GameStatus::Open,
            RpsError::InvalidGameState
        );
        emit!(GameCancelled {
            game: self.game.key(),
            creator: self.creator.key(),
            stake: self.game.stake,
        });
        Ok(())
    }
}
