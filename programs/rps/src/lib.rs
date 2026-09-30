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
}
