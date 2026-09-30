use anchor_lang::prelude::*;

#[error_code]
pub enum RpsError {
    #[msg("New games and joins are paused")]
    Paused,
    #[msg("Move must be 0 (rock), 1 (paper) or 2 (scissors)")]
    InvalidMove,
    #[msg("Stake is below the minimum")]
    StakeTooLow,
    #[msg("Stake does not match the game's stake")]
    StakeMismatch,
    #[msg("The game is not in the right state for this action")]
    InvalidGameState,
    #[msg("Move and salt do not match the commitment")]
    CommitmentMismatch,
    #[msg("You cannot join your own game")]
    CannotJoinOwnGame,
    #[msg("The reveal timeout has not passed yet")]
    RevealTimeoutNotReached,
    #[msg("You are not allowed to do this")]
    Unauthorized,
    #[msg("Treasury account is invalid")]
    InvalidTreasury,
    #[msg("The treasury wallet cannot play")]
    TreasuryCannotPlay,
    #[msg("Fee is above the maximum of 1000 bps")]
    FeeTooHigh,
    #[msg("Reveal timeout must be between 60 and 86400 seconds")]
    InvalidTimeout,
    #[msg("Minimum stake is below the allowed floor")]
    MinStakeTooLow,
    #[msg("Arithmetic overflow")]
    MathOverflow,
}
