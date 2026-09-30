use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod logic;
pub mod state;

use instructions::*;

declare_id!("Fmi151zsEHFgRJeUXNgDjbo4aLA6PRQ63ktWM6sCEgkA");

#[program]
pub mod rps {
    use super::*;

    pub fn initialize_config(ctx: Context<InitializeConfig>, params: ConfigParams) -> Result<()> {
        let bump = ctx.bumps.config;
        ctx.accounts.handle(params, bump)
    }

    pub fn update_config(ctx: Context<AdminOnly>, params: UpdateConfigParams) -> Result<()> {
        ctx.accounts.update_config(params)
    }

    pub fn set_paused(ctx: Context<AdminOnly>, paused: bool) -> Result<()> {
        ctx.accounts.set_paused(paused)
    }

    pub fn create_game(
        ctx: Context<CreateGame>,
        game_id: u64,
        stake: u64,
        commitment: [u8; 32],
    ) -> Result<()> {
        let bump = ctx.bumps.game;
        ctx.accounts.handle(game_id, stake, commitment, bump)
    }

    pub fn cancel_game(ctx: Context<CancelGame>) -> Result<()> {
        ctx.accounts.handle()
    }
}
