use anchor_lang::prelude::*;

use crate::{constants::CONFIG_SEED, errors::RpsError, program::Rps, state::Config};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ConfigParams {
    pub treasury: Pubkey,
    pub fee_bps: u16,
    pub min_stake: u64,
    pub reveal_timeout: i64,
}

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + Config::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,
    #[account(
        constraint = program.programdata_address()? == Some(program_data.key()) @ RpsError::Unauthorized
    )]
    pub program: Program<'info, Rps>,
    /// Only the program's upgrade authority may create the config, so nobody
    /// can front-run initialization after a deploy.
    #[account(
        constraint = program_data.upgrade_authority_address == Some(authority.key()) @ RpsError::Unauthorized
    )]
    pub program_data: Account<'info, ProgramData>,
    pub system_program: Program<'info, System>,
}

impl<'info> InitializeConfig<'info> {
    pub fn handle(&mut self, params: ConfigParams, bump: u8) -> Result<()> {
        Config::validate(
            &params.treasury,
            params.fee_bps,
            params.min_stake,
            params.reveal_timeout,
        )?;
        self.config.set_inner(Config {
            admin: self.authority.key(),
            treasury: params.treasury,
            fee_bps: params.fee_bps,
            min_stake: params.min_stake,
            reveal_timeout: params.reveal_timeout,
            paused: false,
            bump,
        });
        Ok(())
    }
}
