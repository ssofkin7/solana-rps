use anchor_lang::prelude::*;

use crate::{constants::CONFIG_SEED, errors::RpsError, state::Config};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpdateConfigParams {
    pub admin: Option<Pubkey>,
    pub fee_bps: Option<u16>,
    pub min_stake: Option<u64>,
    pub reveal_timeout: Option<i64>,
}

// No admin instruction takes a game account, so the admin has no path to
// player funds.

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ RpsError::Unauthorized
    )]
    pub config: Account<'info, Config>,
    /// Pass this to change the fee wallet. It must be a system-owned account
    /// that can be write-locked, for the same reason as in `initialize_config`.
    #[account(mut)]
    pub new_treasury: Option<SystemAccount<'info>>,
}

impl<'info> UpdateConfig<'info> {
    pub fn handle(&mut self, params: UpdateConfigParams) -> Result<()> {
        let config = &mut self.config;
        let treasury = match &self.new_treasury {
            Some(account) => account.key(),
            None => config.treasury,
        };
        let fee_bps = params.fee_bps.unwrap_or(config.fee_bps);
        let min_stake = params.min_stake.unwrap_or(config.min_stake);
        let reveal_timeout = params.reveal_timeout.unwrap_or(config.reveal_timeout);
        Config::validate(&treasury, fee_bps, min_stake, reveal_timeout)?;

        if let Some(admin) = params.admin {
            require_keys_neq!(admin, Pubkey::default(), RpsError::Unauthorized);
            config.admin = admin;
        }
        config.treasury = treasury;
        config.fee_bps = fee_bps;
        config.min_stake = min_stake;
        config.reveal_timeout = reveal_timeout;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct SetPaused<'info> {
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ RpsError::Unauthorized
    )]
    pub config: Account<'info, Config>,
}

impl<'info> SetPaused<'info> {
    pub fn handle(&mut self, paused: bool) -> Result<()> {
        self.config.paused = paused;
        Ok(())
    }
}
