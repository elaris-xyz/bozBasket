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
