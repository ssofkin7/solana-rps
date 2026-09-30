pub const CONFIG_SEED: &[u8] = b"config";
pub const GAME_SEED: &[u8] = b"game";

pub const MAX_FEE_BPS: u16 = 1_000;
pub const BPS_DENOMINATOR: u128 = 10_000;

/// Refunds below the rent-exempt minimum cannot be paid into an empty wallet,
/// so stakes may never be configured below this.
pub const MIN_STAKE_FLOOR: u64 = 1_000_000;

pub const MIN_REVEAL_TIMEOUT: i64 = 60;
pub const MAX_REVEAL_TIMEOUT: i64 = 86_400;

/// One per player, created on their first game and never closed.
pub const STATS_SEED: &[u8] = b"stats";
