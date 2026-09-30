use anchor_lang::{
    prelude::*,
    system_program::{self, Transfer},
};

use crate::{
    constants::{CONFIG_SEED, GAME_SEED, STATS_SEED},
    errors::RpsError,
    events::GameCreated,
    state::{Config, Game, GameStatus, PlayerStats},
};

#[derive(Accounts)]
#[instruction(game_id: u64, stake: u64, commitment: [u8; 32])]
pub struct CreateGame<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = creator,
        space = 8 + Game::INIT_SPACE,
        seeds = [GAME_SEED, creator.key().as_ref(), &game_id.to_le_bytes()],
        bump
    )]
    pub game: Account<'info, Game>,
    /// Created on the first game, at the creator's cost.
    #[account(
        init_if_needed,
        payer = creator,
        space = 8 + PlayerStats::INIT_SPACE,
        seeds = [STATS_SEED, creator.key().as_ref()],
        bump
    )]
    pub creator_stats: Account<'info, PlayerStats>,
    pub system_program: Program<'info, System>,
}

impl<'info> CreateGame<'info> {
    pub fn handle(
        &mut self,
        game_id: u64,
        stake: u64,
        commitment: [u8; 32],
        bump: u8,
        stats_bump: u8,
    ) -> Result<()> {
        require!(!self.config.paused, RpsError::Paused);
        require!(stake >= self.config.min_stake, RpsError::StakeTooLow);
        require_keys_neq!(
            self.creator.key(),
            self.config.treasury,
            RpsError::TreasuryCannotPlay
        );
        self.creator_stats.open(self.creator.key(), stats_bump);

        // Fee, treasury and timeout are copied in, so later config changes
        // never alter the terms of this game.
        self.game.set_inner(Game {
            status: GameStatus::Open,
            creator: self.creator.key(),
            opponent: Pubkey::default(),
            game_id,
            stake,
            commitment,
            opponent_move: 0,
            created_at: Clock::get()?.unix_timestamp,
            joined_at: 0,
            fee_bps: self.config.fee_bps,
            treasury: self.config.treasury,
            reveal_timeout: self.config.reveal_timeout,
            bump,
        });

        system_program::transfer(
            CpiContext::new(
                system_program::ID,
                Transfer {
                    from: self.creator.to_account_info(),
                    to: self.game.to_account_info(),
                },
            ),
            stake,
        )?;

        emit!(GameCreated {
            game: self.game.key(),
            creator: self.creator.key(),
            game_id,
            stake,
        });
        Ok(())
    }
}
