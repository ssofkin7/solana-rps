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
