use anchor_lang::prelude::*;

pub const MAX_SYMBOL_LEN: usize = 8;
pub const STOCK_DECIMALS: u8 = 6;
/// Pyth US equity feeds publish with exponent -8 (and so do most others).
pub const DEFAULT_EXPONENT: i32 = -8;

pub const MARKET_SEED: &[u8] = b"market";
pub const STOCK_MINT_SEED: &[u8] = b"stock";
pub const TREASURY_SEED: &[u8] = b"treasury";
pub const REFERENCE_SEED: &[u8] = b"reference";

/// One mock stock. PDA: ["market", symbol].
#[account]
#[derive(InitSpace)]
pub struct Market {
	pub admin: Pubkey,
	#[max_len(8)]
	pub symbol: String,
	/// PDA ["stock", symbol]; mint authority is this market.
	pub stock_mint: Pubkey,
	pub usdc_mint: Pubkey,
	/// USDC paid by fills. PDA ["treasury", symbol].
	pub treasury: Pubkey,
	/// `PriceUpdateV2`-layout account. PDA ["reference", symbol].
	pub reference: Pubkey,
	/// Pyth feed id this market mirrors (informational).
	pub feed_id: [u8; 32],
	/// Added on top of the reference when filling.
	pub spread_bps: u16,
	/// Remaining depth in USDC base units. Fills subtract from it.
	pub liquidity_usdc: u64,
	/// If non-zero, the venue quotes this instead of the reference. Demo
	/// control for the DIVERGENCE scenario. Same exponent as the reference.
	pub price_override: i64,
	pub bump: u8,
	pub stock_mint_bump: u8,
	pub treasury_bump: u8,
	pub reference_bump: u8,
}

impl Market {
	/// Price the venue fills at: override or reference, plus spread.
	pub fn venue_price(&self, reference: &PriceUpdateV2) -> Result<i64> {
		let base = if self.price_override > 0 {
			self.price_override
		} else {
			reference.price_message.price
		};
		require!(base > 0, crate::MarketError::BadPrice);
		let with_spread = (base as u128)
			.checked_mul(10_000 + self.spread_bps as u128)
			.ok_or(crate::MarketError::Overflow)?
			/ 10_000;
		i64::try_from(with_spread).map_err(|_| crate::MarketError::Overflow.into())
	}
}

// ---- Pyth `PriceUpdateV2` mirror -------------------------------------------
//
// Field order and types copy pyth-solana-receiver-sdk 0.3 exactly, and the
// struct is named `PriceUpdateV2` so Anchor derives the same 8-byte
// discriminator (sha256("account:PriceUpdateV2")[..8]). A consumer that
// deserializes the real Pyth account can deserialize this one unchanged.

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum VerificationLevel {
	Partial { num_signatures: u8 },
	Full,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub struct PriceFeedMessage {
	pub feed_id: [u8; 32],
	pub price: i64,
	pub conf: u64,
	pub exponent: i32,
	pub publish_time: i64,
	pub prev_publish_time: i64,
	pub ema_price: i64,
	pub ema_conf: u64,
}

#[account]
#[derive(InitSpace)]
pub struct PriceUpdateV2 {
	pub write_authority: Pubkey,
	pub verification_level: VerificationLevel,
	pub price_message: PriceFeedMessage,
	pub posted_slot: u64,
}

#[cfg(test)]
mod tests {
	use super::*;
	use anchor_lang::Discriminator;

	#[test]
	fn discriminator_matches_pyth() {
		// From pyth-solana-receiver-sdk: PriceUpdateV2::DISCRIMINATOR.
		assert_eq!(PriceUpdateV2::DISCRIMINATOR, [34, 241, 35, 99, 157, 126, 244, 205]);
	}

	#[test]
	fn layout_size_matches_pyth() {
		// Serialized with Full: 32 + 1 (enum tag) + 84 (message) + 8 = 125 bytes.
		// Allocated: 32 + 2 (tag + Partial's u8) + 84 + 8 = 126, plus the 8-byte
		// discriminator = 134, which is pyth-solana-receiver-sdk's LEN.
		let full = PriceUpdateV2 {
			write_authority: Pubkey::default(),
			verification_level: VerificationLevel::Full,
			price_message: PriceFeedMessage {
				feed_id: [0; 32],
				price: 1,
				conf: 1,
				exponent: -8,
				publish_time: 1,
				prev_publish_time: 0,
				ema_price: 1,
				ema_conf: 1,
			},
			posted_slot: 1,
		};
		let mut bytes = Vec::new();
		full.serialize(&mut bytes).unwrap();
		assert_eq!(bytes.len(), 125);
		assert_eq!(8 + PriceUpdateV2::INIT_SPACE, 134);
	}
}
