//! Account model. Mirrors docs/PROPOSAL.md section 5 exactly; change the
//! proposal first if this has to move.

use anchor_lang::prelude::*;

/// Legs per plan. Capped at 4 for the demo (tx size); the array allows 8.
pub const MAX_LEGS: usize = 8;

/// Weights across legs must sum to this.
pub const BPS_DENOM: u16 = 10_000;

/// Why the last `execute_basket` attempt did or did not fill.
/// Stored as `u8` on the Plan; the keeper ledger and the UI use the same numbers.
#[repr(u8)]
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum ReasonCode {
	Ok = 0,
	/// Pyth publish time older than `Config::max_staleness_secs`.
	ReferenceStale = 1,
	/// `conf * 10_000 / price` above `Config::max_conf_bps`.
	ConfidenceTooWide = 2,
	/// Session calendar says closed and no fresh price. Enforced by the keeper.
	MarketClosed = 3,
	/// |venue - reference| above `Config::max_divergence_bps`.
	Divergence = 4,
	/// Venue depth below `Config::min_liquidity_usdc`.
	LowLiquidity = 5,
	/// Vault cannot cover `amount_per_period`.
	InsufficientBalance = 6,
}

#[repr(u8)]
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum PlanStatus {
	Active = 0,
	Paused = 1,
	Ended = 2,
}

/// One stock in a basket.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Default, PartialEq, Eq, InitSpace)]
pub struct Leg {
	/// Stock token mint (mock on devnet, xStocks on mainnet).
	pub mint: Pubkey,
	/// Share of `amount_per_period`, in basis points. Sums to 10_000 across legs.
	pub weight_bps: u16,
	/// Pyth price feed id, identical on devnet and mainnet.
	pub pyth_feed_id: [u8; 32],
	/// Cumulative units received, for average cost.
	pub units_bought: u64,
}

/// One recurring basket order. PDA: ["plan", owner, plan_id].
#[account]
#[derive(InitSpace)]
pub struct Plan {
	pub owner: Pubkey,
	pub plan_id: u16,
	pub bump: u8,
	/// USDC base units (6 decimals) spent per period.
	pub amount_per_period: u64,
	/// 604_800 for weekly; the demo also allows daily.
	pub period_seconds: u64,
	/// Unix timestamp of the next allowed execution.
	pub next_execution: i64,
	/// 0 = open-ended.
	pub end_ts: i64,
	/// Fixed array; entries past `leg_count` are zeroed.
	pub legs: [Leg; MAX_LEGS],
	pub leg_count: u8,
	pub executions: u32,
	pub deferrals: u32,
	/// `ReasonCode` of the last attempt.
	pub last_reason: u8,
	pub total_invested: u64,
	/// `PlanStatus`.
	pub status: u8,
}

/// Global parameters, admin-only. PDA: ["config"].
#[account]
#[derive(InitSpace)]
pub struct Config {
	pub admin: Pubkey,
	pub keeper: Pubkey,
	/// Max age of a Pyth price during session, seconds (e.g. 60).
	pub max_staleness_secs: u32,
	/// Confidence / price ceiling, basis points (e.g. 50).
	pub max_conf_bps: u16,
	/// |venue - reference| / reference ceiling, basis points (e.g. 150).
	pub max_divergence_bps: u16,
	/// Minimum venue depth per leg, USDC base units.
	pub min_liquidity_usdc: u64,
	/// mock_market on devnet.
	pub fill_program: Pubkey,
	pub bump: u8,
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn plan_fits_in_one_small_account() {
		// 8-byte discriminator + fields. Watch this when adding fields;
		// rent for ~700 bytes is about 0.006 SOL.
		let size = 8 + Plan::INIT_SPACE;
		assert!(size < 1024, "Plan is {size} bytes");
	}

	#[test]
	fn reason_codes_match_proposal() {
		assert_eq!(ReasonCode::ReferenceStale as u8, 1);
		assert_eq!(ReasonCode::ConfidenceTooWide as u8, 2);
		assert_eq!(ReasonCode::MarketClosed as u8, 3);
		assert_eq!(ReasonCode::Divergence as u8, 4);
		assert_eq!(ReasonCode::LowLiquidity as u8, 5);
		assert_eq!(ReasonCode::InsufficientBalance as u8, 6);
	}
}
