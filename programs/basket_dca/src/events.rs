use anchor_lang::prelude::*;

#[event]
pub struct ConfigInitialized {
	pub admin: Pubkey,
	pub keeper: Pubkey,
	pub usdc_mint: Pubkey,
}

#[event]
pub struct PlanCreated {
	pub plan: Pubkey,
	pub owner: Pubkey,
	pub plan_id: u16,
	pub amount_per_period: u64,
	pub period_seconds: u64,
	pub next_execution: i64,
	pub leg_count: u8,
}

#[event]
pub struct Deposited {
	pub plan: Pubkey,
	pub amount: u64,
	pub vault_balance: u64,
}

#[event]
pub struct Withdrawn {
	pub plan: Pubkey,
	pub amount: u64,
	pub vault_balance: u64,
	/// True when the withdrawal left less than one period and paused the plan.
	pub paused: bool,
}

#[event]
pub struct StatusChanged {
	pub plan: Pubkey,
	pub status: u8,
}

/// One leg of a completed execution.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct LegFill {
	pub mint: Pubkey,
	pub usdc_in: u64,
	pub units: u64,
	pub reference_price: i64,
	pub venue_price: i64,
	pub exponent: i32,
}

#[event]
pub struct Executed {
	pub plan: Pubkey,
	pub ts: i64,
	pub usdc_in: u64,
	pub vault_balance: u64,
	pub next_execution: i64,
	pub legs: Vec<LegFill>,
}

/// The guard said no. `detail` depends on the reason: publish age in seconds
/// for REFERENCE_STALE, basis points for CONFIDENCE_TOO_WIDE and DIVERGENCE,
/// remaining USDC for LOW_LIQUIDITY and INSUFFICIENT_BALANCE.
#[event]
pub struct Deferred {
	pub plan: Pubkey,
	pub ts: i64,
	pub reason: u8,
	pub leg_index: u8,
	pub detail: i64,
	pub next_execution: i64,
}

#[event]
pub struct PlanEnded {
	pub plan: Pubkey,
	pub ts: i64,
}

#[event]
pub struct PlanUpdated {
	pub plan: Pubkey,
	pub amount_per_period: u64,
	pub period_seconds: u64,
	pub end_ts: i64,
}
