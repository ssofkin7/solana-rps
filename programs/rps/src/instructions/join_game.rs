use anchor_lang::{
    prelude::*,
    system_program::{self, Transfer},
};

use crate::{
    constants::{CONFIG_SEED, GAME_SEED},
    errors::RpsError,
    events::GameJoined,
    logic::is_valid_move,
    state::{Config, Game, GameStatus},
};

#[derive(Accounts)]
pub struct JoinGame<'info> {
    #[account(mut)]
    pub opponent: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [GAME_SEED, game.creator.as_ref(), &game.game_id.to_le_bytes()],
        bump = game.bump
    )]
    pub game: Account<'info, Game>,
    pub system_program: Program<'info, System>,
}

impl<'info> JoinGame<'info> {
    pub fn handle(
        &mut self,
        mv: u8,
        expected_stake: u64,
        expected_commitment: [u8; 32],
    ) -> Result<()> {
        require!(!self.config.paused, RpsError::Paused);
        require!(
            self.game.status == GameStatus::Open,
            RpsError::InvalidGameState
        );
        require!(is_valid_move(mv), RpsError::InvalidMove);
        require_keys_neq!(
            self.opponent.key(),
            self.game.creator,
            RpsError::CannotJoinOwnGame
        );
        require_keys_neq!(
            self.opponent.key(),
            self.game.treasury,
            RpsError::TreasuryCannotPlay
        );
        require!(expected_stake == self.game.stake, RpsError::StakeMismatch);
        // The game address can be reused after a cancel, so the stake alone does
        // not identify the game the opponent saw. Binding the commitment stops a
        // creator swapping their move under a join that is already in flight.
        require!(
            expected_commitment == self.game.commitment,
            RpsError::GameChanged
        );

        system_program::transfer(
            CpiContext::new(
                system_program::ID,
                Transfer {
                    from: self.opponent.to_account_info(),
                    to: self.game.to_account_info(),
                },
            ),
            self.game.stake,
        )?;

        let joined_at = Clock::get()?.unix_timestamp;
        let reveal_deadline = joined_at
            .checked_add(self.game.reveal_timeout)
            .ok_or(RpsError::MathOverflow)?;

        let opponent = self.opponent.key();
        let game = &mut self.game;
        game.status = GameStatus::Joined;
        game.opponent = opponent;
        game.opponent_move = mv;
        game.joined_at = joined_at;

        emit!(GameJoined {
            game: game.key(),
            creator: game.creator,
            opponent,
            opponent_move: mv,
            reveal_deadline,
        });
        Ok(())
    }
}
