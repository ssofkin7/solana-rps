use anchor_lang::prelude::*;

use crate::state::Outcome;

#[event]
pub struct GameCreated {
    pub game: Pubkey,
    pub creator: Pubkey,
    pub game_id: u64,
    pub stake: u64,
}

#[event]
pub struct GameJoined {
    pub game: Pubkey,
    pub creator: Pubkey,
    pub opponent: Pubkey,
    pub opponent_move: u8,
    pub reveal_deadline: i64,
}

#[event]
pub struct GameSettled {
    pub game: Pubkey,
    pub creator: Pubkey,
    pub opponent: Pubkey,
    pub creator_move: u8,
    pub opponent_move: u8,
    pub outcome: Outcome,
    pub stake: u64,
    pub creator_payout: u64,
    pub opponent_payout: u64,
    pub fee: u64,
}

#[event]
pub struct GameCancelled {
    pub game: Pubkey,
    pub creator: Pubkey,
    pub stake: u64,
}

#[event]
pub struct GameForfeited {
    pub game: Pubkey,
    pub creator: Pubkey,
    pub opponent: Pubkey,
    pub pot: u64,
}
