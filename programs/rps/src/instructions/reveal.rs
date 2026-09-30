use anchor_lang::prelude::*;

use crate::{
    constants::{GAME_SEED, STATS_SEED},
    errors::RpsError,
    events::GameSettled,
    logic::{commitment_hash, is_valid_move, outcome},
    state::{Finish, Game, GameStatus, Outcome, PlayerStats},
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
    /// Normally created when the game was. `init_if_needed` covers a game that
    /// predates stats, so it can always be settled.
    #[account(
        init_if_needed,
        payer = creator,
        space = 8 + PlayerStats::INIT_SPACE,
        seeds = [STATS_SEED, game.creator.as_ref()],
        bump
    )]
    pub creator_stats: Account<'info, PlayerStats>,
    #[account(
        init_if_needed,
        payer = creator,
        space = 8 + PlayerStats::INIT_SPACE,
        seeds = [STATS_SEED, game.opponent.as_ref()],
        bump
    )]
    pub opponent_stats: Account<'info, PlayerStats>,
    pub system_program: Program<'info, System>,
}

impl<'info> Reveal<'info> {
    pub fn handle(
        &mut self,
        mv: u8,
        salt: [u8; 32],
        creator_stats_bump: u8,
        opponent_stats_bump: u8,
    ) -> Result<()> {
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
                let fee = self
                    .game
                    .payable_fee(pot, &self.treasury.to_account_info())?;
                (pot.checked_sub(fee).ok_or(RpsError::MathOverflow)?, 0, fee)
            }
            Outcome::OpponentWins => {
                let fee = self
                    .game
                    .payable_fee(pot, &self.treasury.to_account_info())?;
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

        let (creator_finish, opponent_finish, creator_fee, opponent_fee) = match result {
            Outcome::Tie => (Finish::Tied, Finish::Tied, 0, 0),
            Outcome::CreatorWins => (Finish::Won, Finish::Lost, fee, 0),
            Outcome::OpponentWins => (Finish::Lost, Finish::Won, 0, fee),
        };
        self.creator_stats
            .open(self.game.creator, creator_stats_bump);
        self.creator_stats
            .record(creator_finish, stake, creator_payout, creator_fee, false)?;
        self.opponent_stats
            .open(self.game.opponent, opponent_stats_bump);
        self.opponent_stats
            .record(opponent_finish, stake, opponent_payout, opponent_fee, false)?;

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
}
