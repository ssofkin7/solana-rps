use anchor_lang::prelude::*;

use crate::{
    constants::GAME_SEED,
    errors::RpsError,
    events::GameSettled,
    logic::{commitment_hash, compute_fee, is_valid_move, outcome},
    state::{Game, GameStatus, Outcome},
};

#[derive(Accounts)]
pub struct Reveal<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    /// Payouts leave this account first; whatever remains is the rent, which
    /// `close` returns to the creator.
    #[account(
        mut,
        seeds = [GAME_SEED, game.creator.as_ref(), &game.game_id.to_le_bytes()],
        bump = game.bump,
        has_one = creator @ RpsError::Unauthorized,
        has_one = opponent @ RpsError::Unauthorized,
        has_one = treasury @ RpsError::InvalidTreasury,
        close = creator
    )]
    pub game: Account<'info, Game>,
    /// CHECK: only receives lamports; `has_one` pins it to the opponent stored in the game.
    #[account(mut)]
    pub opponent: UncheckedAccount<'info>,
    /// CHECK: only receives lamports; `has_one` pins it to the treasury stored in the game.
    #[account(mut)]
    pub treasury: UncheckedAccount<'info>,
}

impl<'info> Reveal<'info> {
    pub fn handle(&mut self, mv: u8, salt: [u8; 32]) -> Result<()> {
        require!(
            self.game.status == GameStatus::Joined,
            RpsError::InvalidGameState
        );
        require!(is_valid_move(mv), RpsError::InvalidMove);
        require!(
            commitment_hash(mv, &salt, &self.creator.key()) == self.game.commitment,
            RpsError::CommitmentMismatch
        );

        let stake = self.game.stake;
        let pot = stake.checked_mul(2).ok_or(RpsError::MathOverflow)?;
        let result = outcome(mv, self.game.opponent_move);

        let (creator_payout, opponent_payout, fee) = match result {
            Outcome::Tie => (stake, stake, 0),
            Outcome::CreatorWins => {
                let fee = self.payable_fee(pot)?;
                (pot.checked_sub(fee).ok_or(RpsError::MathOverflow)?, 0, fee)
            }
            Outcome::OpponentWins => {
                let fee = self.payable_fee(pot)?;
                (0, pot.checked_sub(fee).ok_or(RpsError::MathOverflow)?, fee)
            }
        };

        if creator_payout > 0 {
            self.game.sub_lamports(creator_payout)?;
            self.creator.add_lamports(creator_payout)?;
        }
        if opponent_payout > 0 {
            self.game.sub_lamports(opponent_payout)?;
            self.opponent.add_lamports(opponent_payout)?;
        }
        if fee > 0 {
            self.game.sub_lamports(fee)?;
            self.treasury.add_lamports(fee)?;
        }

        emit!(GameSettled {
            game: self.game.key(),
            creator: self.creator.key(),
            opponent: self.opponent.key(),
            creator_move: mv,
            opponent_move: self.game.opponent_move,
            outcome: result,
            stake,
            creator_payout,
            opponent_payout,
            fee,
        });
        Ok(())
    }

    /// The fee, or zero when paying it would leave the treasury below the
    /// rent-exempt minimum. Without this an empty treasury would make small
    /// reveals fail and push creators into forfeit.
    fn payable_fee(&self, pot: u64) -> Result<u64> {
        let fee = compute_fee(pot, self.game.fee_bps)?;
        if fee == 0 {
            return Ok(0);
        }
        let treasury = self.treasury.to_account_info();
        let rent_minimum = Rent::get()?.minimum_balance(treasury.data_len());
        let balance_after = treasury
            .lamports()
            .checked_add(fee)
            .ok_or(RpsError::MathOverflow)?;
        if balance_after < rent_minimum {
            Ok(0)
        } else {
            Ok(fee)
        }
    }
}
