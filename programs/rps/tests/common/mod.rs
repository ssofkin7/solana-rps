#![allow(dead_code, unused_imports, clippy::result_large_err)]

use {
    anchor_lang::{
        prelude::{Clock, Pubkey},
        solana_program::{bpf_loader_upgradeable, instruction::Instruction, system_program},
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    litesvm::{
        types::{FailedTransactionMetadata, TransactionMetadata},
        LiteSVM,
    },
    rps::{
        constants::{CONFIG_SEED, GAME_SEED, STATS_SEED},
        errors::RpsError,
        instructions::{ConfigParams, UpdateConfigParams},
        state::{Config, Game, PlayerStats},
    },
    sha2::{Digest, Sha256},
    solana_account::Account,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

pub const SOL: u64 = 1_000_000_000;
pub const DEFAULT_FEE_BPS: u16 = 250;
pub const DEFAULT_MIN_STAKE: u64 = 10_000_000;
pub const DEFAULT_TIMEOUT: i64 = 600;

pub type TxResult = Result<TransactionMetadata, FailedTransactionMetadata>;

pub struct Env {
    pub svm: LiteSVM,
    pub payer: Keypair,
    pub treasury: Pubkey,
}

pub fn config_address() -> Pubkey {
    Pubkey::find_program_address(&[CONFIG_SEED], &rps::ID).0
}

pub fn program_data_address() -> Pubkey {
    Pubkey::find_program_address(&[rps::ID.as_ref()], &bpf_loader_upgradeable::ID).0
}

pub fn game_address(creator: &Pubkey, game_id: u64) -> Pubkey {
    Pubkey::find_program_address(
        &[GAME_SEED, creator.as_ref(), &game_id.to_le_bytes()],
        &rps::ID,
    )
    .0
}

/// Gives `address` exactly `lamports` as a plain system-owned wallet.
pub fn fund(env: &mut Env, address: &Pubkey, lamports: u64) {
    env.svm
        .set_account(
            *address,
            Account {
                lamports,
                data: vec![],
                owner: system_program::ID,
                executable: false,
                rent_epoch: 0,
            },
        )
        .unwrap();
}

pub fn funded(env: &mut Env, lamports: u64) -> Keypair {
    let keypair = Keypair::new();
    fund(env, &keypair.pubkey(), lamports);
    keypair
}

pub fn balance(env: &Env, address: &Pubkey) -> u64 {
    env.svm.get_balance(address).unwrap_or(0)
}

/// LiteSVM creates the ProgramData account with no upgrade authority. Its
/// header is: enum tag (0..4), slot (4..12), Option tag (12), authority (13..45).
fn set_upgrade_authority(svm: &mut LiteSVM, authority: &Pubkey) {
    let address = program_data_address();
    let mut account = svm
        .get_account(&address)
        .expect("LiteSVM should create a ProgramData account for the program");
    account.data[12] = 1;
    account.data[13..45].copy_from_slice(authority.as_ref());
    svm.set_account(address, account).unwrap();
}

/// Program loaded, fee payer funded, `admin` set as upgrade authority. No config yet.
pub fn boot() -> (Env, Keypair) {
    let mut svm = LiteSVM::new();
    let bytes = include_bytes!(concat!(env!("CARGO_TARGET_TMPDIR"), "/../deploy/rps.so"));
    svm.add_program(rps::ID, bytes).unwrap();

    let mut env = Env {
        svm,
        payer: Keypair::new(),
        treasury: Pubkey::new_unique(),
    };
    let payer = env.payer.pubkey();
    fund(&mut env, &payer, 1_000 * SOL);
    let admin = funded(&mut env, 10 * SOL);
    set_upgrade_authority(&mut env.svm, &admin.pubkey());
    (env, admin)
}

/// Test-side view of `initialize_config`: the treasury travels as an account,
/// the rest as instruction arguments.
pub struct InitParams {
    pub treasury: Pubkey,
    pub fee_bps: u16,
    pub min_stake: u64,
    pub reveal_timeout: i64,
}

/// Test-side view of `update_config`: a new treasury travels as an optional
/// account, the rest as instruction arguments.
pub struct Update {
    pub admin: Option<Pubkey>,
    pub treasury: Option<Pubkey>,
    pub fee_bps: Option<u16>,
    pub min_stake: Option<u64>,
    pub reveal_timeout: Option<i64>,
}

pub fn default_params(treasury: Pubkey) -> InitParams {
    InitParams {
        treasury,
        fee_bps: DEFAULT_FEE_BPS,
        min_stake: DEFAULT_MIN_STAKE,
        reveal_timeout: DEFAULT_TIMEOUT,
    }
}

/// `boot` plus an initialized config with defaults and a treasury holding 1 SOL.
pub fn setup() -> (Env, Keypair) {
    let (mut env, admin) = boot();
    let treasury = env.treasury;
    fund(&mut env, &treasury, SOL);
    send(
        &mut env,
        ix_initialize_config(&admin.pubkey(), default_params(treasury)),
        &[&admin],
    )
    .unwrap();
    (env, admin)
}

/// Every transaction is paid for by `env.payer`, so player balances change
/// only through the game. The blockhash is expired first so two identical
/// instructions are two distinct transactions.
pub fn send(env: &mut Env, ix: Instruction, signers: &[&Keypair]) -> TxResult {
    send_many(env, &[ix], signers)
}

/// For failures raised by Anchor's own account checks rather than by `RpsError`.
pub fn assert_anchor_err(result: TxResult, accepted_codes: &[u32]) {
    let failed = result.expect_err("transaction should have failed");
    let shown = format!("{:?}", failed.err);
    assert!(
        accepted_codes
            .iter()
            .any(|code| shown.contains(&format!("Custom({code})"))),
        "expected one of {accepted_codes:?}, got {shown}\n{}",
        failed.meta.pretty_logs()
    );
}

// Anchor's built-in error codes used by these tests.
pub const ANCHOR_CONSTRAINT_MUT: u32 = 2000;
pub const ANCHOR_CONSTRAINT_SEEDS: u32 = 2006;
pub const ANCHOR_ACCOUNT_OWNED_BY_WRONG_PROGRAM: u32 = 3007;
pub const ANCHOR_ACCOUNT_NOT_SYSTEM_OWNED: u32 = 3011;
pub const ANCHOR_ACCOUNT_NOT_INITIALIZED: u32 = 3012;

pub fn assert_rps_err(result: TxResult, expected: RpsError) {
    let code: u32 = expected.into();
    let failed = result.expect_err("transaction should have failed");
    let shown = format!("{:?}", failed.err);
    assert!(
        shown.contains(&format!("Custom({code})")),
        "expected Custom({code}), got {shown}\n{}",
        failed.meta.pretty_logs()
    );
}

pub fn read_config(env: &Env) -> Config {
    let account = env.svm.get_account(&config_address()).unwrap();
    Config::try_deserialize(&mut account.data.as_slice()).unwrap()
}

pub fn no_update() -> Update {
    Update {
        admin: None,
        treasury: None,
        fee_bps: None,
        min_stake: None,
        reveal_timeout: None,
    }
}

pub fn ix_initialize_config(authority: &Pubkey, params: InitParams) -> Instruction {
    Instruction::new_with_bytes(
        rps::ID,
        &rps::instruction::InitializeConfig {
            params: ConfigParams {
                fee_bps: params.fee_bps,
                min_stake: params.min_stake,
                reveal_timeout: params.reveal_timeout,
            },
        }
        .data(),
        rps::accounts::InitializeConfig {
            authority: *authority,
            config: config_address(),
            program: rps::ID,
            program_data: program_data_address(),
            treasury: params.treasury,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

pub fn ix_update_config(admin: &Pubkey, update: Update) -> Instruction {
    Instruction::new_with_bytes(
        rps::ID,
        &rps::instruction::UpdateConfig {
            params: UpdateConfigParams {
                admin: update.admin,
                fee_bps: update.fee_bps,
                min_stake: update.min_stake,
                reveal_timeout: update.reveal_timeout,
            },
        }
        .data(),
        rps::accounts::UpdateConfig {
            admin: *admin,
            config: config_address(),
            new_treasury: update.treasury,
        }
        .to_account_metas(None),
    )
}

pub fn ix_set_paused(admin: &Pubkey, paused: bool) -> Instruction {
    Instruction::new_with_bytes(
        rps::ID,
        &rps::instruction::SetPaused { paused }.data(),
        rps::accounts::SetPaused {
            admin: *admin,
            config: config_address(),
        }
        .to_account_metas(None),
    )
}

/// Hashes with the `sha2` crate rather than the program's own function, so a
/// wrong formula in the program cannot hide.
pub fn commit(mv: u8, salt: &[u8; 32], creator: &Pubkey) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update([mv]);
    hasher.update(salt);
    hasher.update(creator.as_ref());
    hasher.finalize().into()
}

pub fn game_rent(env: &Env) -> u64 {
    env.svm
        .minimum_balance_for_rent_exemption(8 + <Game as anchor_lang::Space>::INIT_SPACE)
}

pub fn read_game(env: &Env, address: &Pubkey) -> Option<Game> {
    let account = env.svm.get_account(address)?;
    if account.lamports == 0 || account.data.is_empty() {
        return None;
    }
    Game::try_deserialize(&mut account.data.as_slice()).ok()
}

pub fn game_exists(env: &Env, address: &Pubkey) -> bool {
    read_game(env, address).is_some()
}

pub fn ix_create_game(
    creator: &Pubkey,
    game_id: u64,
    stake: u64,
    commitment: [u8; 32],
) -> Instruction {
    Instruction::new_with_bytes(
        rps::ID,
        &rps::instruction::CreateGame {
            game_id,
            stake,
            commitment,
        }
        .data(),
        rps::accounts::CreateGame {
            creator: *creator,
            config: config_address(),
            game: game_address(creator, game_id),
            creator_stats: stats_address(creator),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

pub fn ix_cancel_game(creator: &Pubkey, game: &Pubkey) -> Instruction {
    Instruction::new_with_bytes(
        rps::ID,
        &rps::instruction::CancelGame {}.data(),
        rps::accounts::CancelGame {
            creator: *creator,
            game: *game,
        }
        .to_account_metas(None),
    )
}

pub struct Created {
    pub creator: Keypair,
    pub game_id: u64,
    pub game: Pubkey,
    pub mv: u8,
    pub salt: [u8; 32],
    pub commitment: [u8; 32],
    pub stake: u64,
}

/// A fresh creator holding `stake + 1 SOL` opens a game with `mv`.
pub fn create(env: &mut Env, mv: u8, stake: u64) -> Created {
    let creator = funded(env, stake.checked_add(SOL).unwrap());
    let game_id = 1;
    let salt = [42u8; 32];
    let commitment = commit(mv, &salt, &creator.pubkey());
    send(
        env,
        ix_create_game(&creator.pubkey(), game_id, stake, commitment),
        &[&creator],
    )
    .unwrap();
    let game = game_address(&creator.pubkey(), game_id);
    Created {
        creator,
        game_id,
        game,
        mv,
        salt,
        commitment,
        stake,
    }
}

pub fn ix_join_game(
    opponent: &Pubkey,
    game: &Pubkey,
    mv: u8,
    expected_stake: u64,
    expected_commitment: [u8; 32],
) -> Instruction {
    Instruction::new_with_bytes(
        rps::ID,
        &rps::instruction::JoinGame {
            mv,
            expected_stake,
            expected_commitment,
        }
        .data(),
        rps::accounts::JoinGame {
            opponent: *opponent,
            config: config_address(),
            game: *game,
            opponent_stats: stats_address(opponent),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

/// A fresh opponent holding `stake + 1 SOL` joins with `mv`.
pub fn join(env: &mut Env, created: &Created, mv: u8) -> Keypair {
    let opponent = funded(env, created.stake.checked_add(SOL).unwrap());
    send(
        env,
        ix_join_game(
            &opponent.pubkey(),
            &created.game,
            mv,
            created.stake,
            created.commitment,
        ),
        &[&opponent],
    )
    .unwrap();
    opponent
}

pub fn now(env: &Env) -> i64 {
    env.svm.get_sysvar::<Clock>().unix_timestamp
}

pub fn advance_clock(env: &mut Env, secs: i64) {
    let mut clock = env.svm.get_sysvar::<Clock>();
    clock.unix_timestamp = clock.unix_timestamp.checked_add(secs).unwrap();
    env.svm.set_sysvar::<Clock>(&clock);
}

pub fn ix_reveal(
    creator: &Pubkey,
    game: &Pubkey,
    opponent: &Pubkey,
    treasury: &Pubkey,
    mv: u8,
    salt: [u8; 32],
) -> Instruction {
    Instruction::new_with_bytes(
        rps::ID,
        &rps::instruction::Reveal { mv, salt }.data(),
        rps::accounts::Reveal {
            creator: *creator,
            game: *game,
            opponent: *opponent,
            treasury: *treasury,
            creator_stats: stats_address(creator),
            opponent_stats: stats_address(opponent),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

/// The honest reveal: the creator's real move and salt, the game's own treasury.
pub fn reveal(env: &mut Env, created: &Created, opponent: &Pubkey) -> TxResult {
    let treasury = read_game(env, &created.game)
        .map(|game| game.treasury)
        .unwrap_or(env.treasury);
    send(
        env,
        ix_reveal(
            &created.creator.pubkey(),
            &created.game,
            opponent,
            &treasury,
            created.mv,
            created.salt,
        ),
        &[&created.creator],
    )
}

pub fn ix_claim_forfeit(
    opponent: &Pubkey,
    game: &Pubkey,
    creator: &Pubkey,
    treasury: &Pubkey,
) -> Instruction {
    Instruction::new_with_bytes(
        rps::ID,
        &rps::instruction::ClaimForfeit {}.data(),
        rps::accounts::ClaimForfeit {
            opponent: *opponent,
            game: *game,
            creator: *creator,
            treasury: *treasury,
            creator_stats: stats_address(creator),
            opponent_stats: stats_address(opponent),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

/// Several instructions in one atomic transaction.
pub fn send_many(env: &mut Env, ixs: &[Instruction], signers: &[&Keypair]) -> TxResult {
    env.svm.expire_blockhash();
    let blockhash = env.svm.latest_blockhash();
    let message = Message::new_with_blockhash(ixs, Some(&env.payer.pubkey()), &blockhash);
    let mut all: Vec<&Keypair> = vec![&env.payer];
    all.extend_from_slice(signers);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(message), &all).unwrap();
    env.svm.send_transaction(tx)
}

pub fn stats_address(player: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[STATS_SEED, player.as_ref()], &rps::ID).0
}

pub fn read_stats(env: &Env, player: &Pubkey) -> Option<PlayerStats> {
    let account = env.svm.get_account(&stats_address(player))?;
    if account.lamports == 0 || account.data.is_empty() {
        return None;
    }
    PlayerStats::try_deserialize(&mut account.data.as_slice()).ok()
}

/// Rent a player pays once, for their stats account, on their first game.
pub fn stats_rent(env: &Env) -> u64 {
    env.svm
        .minimum_balance_for_rent_exemption(8 + <PlayerStats as anchor_lang::Space>::INIT_SPACE)
}

/// Points the two stats accounts of a reveal or forfeit instruction at the
/// real players of the game, as an attacker who read the chain would. The
/// builders otherwise derive them from whichever wallets are passed.
pub fn aimed_at(mut ix: Instruction, creator: &Pubkey, opponent: &Pubkey) -> Instruction {
    let count = ix.accounts.len();
    ix.accounts[count - 3].pubkey = stats_address(creator);
    ix.accounts[count - 2].pubkey = stats_address(opponent);
    ix
}
