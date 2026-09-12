//! mock_market: the devnet stand-in for two things bozBasket needs and devnet
//! does not have.
//!
//! 1. A fill venue. Devnet has no xStocks and no Jupiter liquidity, so this
//!    program owns the mint authority for mock stock tokens (mAAPL, mNVDA,
//!    mTSLA, mSPY; 6 decimals) and `fill` mints them for USDC at the
//!    reference price plus a spread. `set_liquidity` and `set_price_override`
//!    let the demo force LOW_LIQUIDITY and DIVERGENCE on stage.
//! 2. A reference price relay. Pyth's US equity feeds are behind a paid plan
//!    and nobody posts them to devnet, so `post_reference` writes accounts
//!    with Pyth's exact `PriceUpdateV2` layout, filled by the keeper from a
//!    public quote source with that source's timestamp. `basket_dca` checks
//!    only `owner == config.reference_program`, so on mainnet the same code
//!    reads the real Pyth receiver accounts.
//!
//! Everything here is synthetic and says so in the README.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount, Transfer};

pub mod state;
pub use state::*;

declare_id!("A6pvN8KEYn5EXcgsRbzZUqBNjA5hFqFn6Ks2Li7SPMxS");

#[program]
pub mod mock_market {
	use super::*;

	/// Creates a market and its stock mint. `symbol` is the ticker without
	/// suffix, at most 8 bytes; it seeds every PDA of this market. Call
	/// `init_market_accounts` next; the two steps exist because four `init`
	/// accounts in one instruction overflow the 4 KiB SBF stack frame.
	pub fn init_market(
		ctx: Context<InitMarket>,
		symbol: String,
		feed_id: [u8; 32],
		spread_bps: u16,
		liquidity_usdc: u64,
	) -> Result<()> {
		require!(!symbol.is_empty() && symbol.len() <= MAX_SYMBOL_LEN, MarketError::BadSymbol);
		require!(spread_bps < 10_000, MarketError::BadSpread);

		let market = &mut ctx.accounts.market;
		market.admin = ctx.accounts.admin.key();
		market.symbol = symbol;
		market.stock_mint = ctx.accounts.stock_mint.key();
		market.usdc_mint = ctx.accounts.usdc_mint.key();
		market.treasury = Pubkey::default();
		market.reference = Pubkey::default();
		market.feed_id = feed_id;
		market.spread_bps = spread_bps;
		market.liquidity_usdc = liquidity_usdc;
		market.price_override = 0;
		market.bump = ctx.bumps.market;
		market.stock_mint_bump = ctx.bumps.stock_mint;
		Ok(())
	}

	/// Second half of market creation: the USDC treasury and the reference
	/// price account (Pyth `PriceUpdateV2` layout, zero price until posted).
	pub fn init_market_accounts(ctx: Context<InitMarketAccounts>) -> Result<()> {
		let market = &mut ctx.accounts.market;
		require!(market.treasury == Pubkey::default(), MarketError::AlreadyInitialized);
		market.treasury = ctx.accounts.treasury.key();
		market.reference = ctx.accounts.reference.key();
		market.treasury_bump = ctx.bumps.treasury;
		market.reference_bump = ctx.bumps.reference;

		let reference = &mut ctx.accounts.reference;
		reference.write_authority = ctx.accounts.admin.key();
		reference.verification_level = VerificationLevel::Full;
		reference.price_message = PriceFeedMessage {
			feed_id: market.feed_id,
			price: 0,
			conf: 0,
			exponent: DEFAULT_EXPONENT,
			publish_time: 0,
			prev_publish_time: 0,
			ema_price: 0,
			ema_conf: 0,
		};
		reference.posted_slot = 0;
		Ok(())
	}

	/// Writes a reference price with the Pyth `PriceUpdateV2` layout.
	/// `publish_time` must be the source's own timestamp, not "now", or the
	/// staleness guard is meaningless.
	pub fn post_reference(
		ctx: Context<PostReference>,
		price: i64,
		conf: u64,
		exponent: i32,
		publish_time: i64,
	) -> Result<()> {
		require!(price > 0, MarketError::BadPrice);
		let reference = &mut ctx.accounts.reference;
		let previous = reference.price_message.publish_time;
		reference.price_message.price = price;
		reference.price_message.conf = conf;
		reference.price_message.exponent = exponent;
		reference.price_message.publish_time = publish_time;
		reference.price_message.prev_publish_time = previous;
		reference.price_message.ema_price = price;
		reference.price_message.ema_conf = conf;
		reference.posted_slot = Clock::get()?.slot;
		emit!(ReferencePosted {
			market: ctx.accounts.market.key(),
			price,
			conf,
			exponent,
			publish_time,
		});
		Ok(())
	}

	/// Demo control: venue depth. Fills drain it; this resets it.
	pub fn set_liquidity(ctx: Context<AdminMarket>, liquidity_usdc: u64) -> Result<()> {
		ctx.accounts.market.liquidity_usdc = liquidity_usdc;
		Ok(())
	}

	/// Demo control: venue price that ignores the reference. 0 clears it.
	/// Same exponent as the reference account.
	pub fn set_price_override(ctx: Context<AdminMarket>, price: i64) -> Result<()> {
		require!(price >= 0, MarketError::BadPrice);
		ctx.accounts.market.price_override = price;
		Ok(())
	}

	pub fn set_spread(ctx: Context<AdminMarket>, spread_bps: u16) -> Result<()> {
		require!(spread_bps < 10_000, MarketError::BadSpread);
		ctx.accounts.market.spread_bps = spread_bps;
		Ok(())
	}

	/// Takes `usdc_in` from `payer_usdc` and mints stock units to `recipient`
	/// at the venue price. The venue price is the override if set, else the
	/// reference, plus `spread_bps`. Returns the units minted.
	pub fn fill(ctx: Context<Fill>, usdc_in: u64) -> Result<u64> {
		require!(usdc_in > 0, MarketError::ZeroAmount);
		let market = &ctx.accounts.market;
		require!(market.liquidity_usdc >= usdc_in, MarketError::LowLiquidity);

		let venue_price = market.venue_price(&ctx.accounts.reference)?;
		let exponent = ctx.accounts.reference.price_message.exponent;
		let units = units_for(usdc_in, venue_price, exponent)?;
		require!(units > 0, MarketError::DustFill);

		token::transfer(
			CpiContext::new(
				ctx.accounts.token_program.to_account_info(),
				Transfer {
					from: ctx.accounts.payer_usdc.to_account_info(),
					to: ctx.accounts.treasury.to_account_info(),
					authority: ctx.accounts.payer_authority.to_account_info(),
				},
			),
			usdc_in,
		)?;

		let symbol = market.symbol.clone();
		let seeds: &[&[u8]] = &[MARKET_SEED, symbol.as_bytes(), &[market.bump]];
		token::mint_to(
			CpiContext::new_with_signer(
				ctx.accounts.token_program.to_account_info(),
				MintTo {
					mint: ctx.accounts.stock_mint.to_account_info(),
					to: ctx.accounts.recipient.to_account_info(),
					authority: ctx.accounts.market.to_account_info(),
				},
				&[seeds],
			),
			units,
		)?;

		let market = &mut ctx.accounts.market;
		market.liquidity_usdc -= usdc_in;
		emit!(Filled {
			market: market.key(),
			recipient: ctx.accounts.recipient.key(),
			usdc_in,
			units,
			venue_price,
			exponent,
		});
		Ok(units)
	}
}

/// Stock units (6 decimals) for `usdc_in` (6 decimals) at `price * 10^exponent`
/// USD per unit. Both sides carry 6 decimals, so they cancel:
/// units = usdc_in * 10^(-exponent) / price.
pub fn units_for(usdc_in: u64, price: i64, exponent: i32) -> Result<u64> {
	require!(price > 0, MarketError::BadPrice);
	require!((-12..=0).contains(&exponent), MarketError::BadExponent);
	let scale = 10u128.pow((-exponent) as u32);
	let units = (usdc_in as u128)
		.checked_mul(scale)
		.ok_or(MarketError::Overflow)?
		/ (price as u128);
	u64::try_from(units).map_err(|_| MarketError::Overflow.into())
}

#[derive(Accounts)]
#[instruction(symbol: String)]
pub struct InitMarket<'info> {
	#[account(
		init,
		payer = admin,
		space = 8 + Market::INIT_SPACE,
		seeds = [MARKET_SEED, symbol.as_bytes()],
		bump,
	)]
	pub market: Box<Account<'info, Market>>,
	#[account(
		init,
		payer = admin,
		seeds = [STOCK_MINT_SEED, symbol.as_bytes()],
		bump,
		mint::decimals = STOCK_DECIMALS,
		mint::authority = market,
	)]
	pub stock_mint: Box<Account<'info, Mint>>,
	pub usdc_mint: Box<Account<'info, Mint>>,
	#[account(mut)]
	pub admin: Signer<'info>,
	pub token_program: Program<'info, Token>,
	pub system_program: Program<'info, System>,
	pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct InitMarketAccounts<'info> {
	#[account(mut, has_one = admin @ MarketError::NotAdmin, has_one = usdc_mint)]
	pub market: Box<Account<'info, Market>>,
	pub usdc_mint: Box<Account<'info, Mint>>,
	#[account(
		init,
		payer = admin,
		seeds = [TREASURY_SEED, market.symbol.as_bytes()],
		bump,
		token::mint = usdc_mint,
		token::authority = market,
	)]
	pub treasury: Box<Account<'info, TokenAccount>>,
	#[account(
		init,
		payer = admin,
		space = 8 + PriceUpdateV2::INIT_SPACE,
		seeds = [REFERENCE_SEED, market.symbol.as_bytes()],
		bump,
	)]
	pub reference: Box<Account<'info, PriceUpdateV2>>,
	#[account(mut)]
	pub admin: Signer<'info>,
	pub token_program: Program<'info, Token>,
	pub system_program: Program<'info, System>,
	pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct PostReference<'info> {
	#[account(has_one = admin @ MarketError::NotAdmin, has_one = reference)]
	pub market: Account<'info, Market>,
	#[account(mut)]
	pub reference: Account<'info, PriceUpdateV2>,
	pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct AdminMarket<'info> {
	#[account(mut, has_one = admin @ MarketError::NotAdmin)]
	pub market: Account<'info, Market>,
	pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct Fill<'info> {
	#[account(mut, has_one = stock_mint, has_one = treasury, has_one = reference)]
	pub market: Box<Account<'info, Market>>,
	#[account(mut)]
	pub stock_mint: Box<Account<'info, Mint>>,
	#[account(mut)]
	pub treasury: Box<Account<'info, TokenAccount>>,
	pub reference: Box<Account<'info, PriceUpdateV2>>,
	/// USDC leaves here. Its authority signs (a user, or the plan PDA via CPI).
	#[account(mut, token::mint = market.usdc_mint, token::authority = payer_authority)]
	pub payer_usdc: Account<'info, TokenAccount>,
	pub payer_authority: Signer<'info>,
	/// Stock units land here. Any token account of `stock_mint`.
	#[account(mut, token::mint = stock_mint)]
	pub recipient: Account<'info, TokenAccount>,
	pub token_program: Program<'info, Token>,
}

#[event]
pub struct ReferencePosted {
	pub market: Pubkey,
	pub price: i64,
	pub conf: u64,
	pub exponent: i32,
	pub publish_time: i64,
}

#[event]
pub struct Filled {
	pub market: Pubkey,
	pub recipient: Pubkey,
	pub usdc_in: u64,
	pub units: u64,
	pub venue_price: i64,
	pub exponent: i32,
}

#[error_code]
pub enum MarketError {
	#[msg("Symbol must be 1 to 8 bytes")]
	BadSymbol,
	#[msg("Spread must be below 10000 basis points")]
	BadSpread,
	#[msg("Price must be positive")]
	BadPrice,
	#[msg("Exponent must be between -12 and 0")]
	BadExponent,
	#[msg("Amount must be greater than zero")]
	ZeroAmount,
	#[msg("Venue liquidity is below the requested amount")]
	LowLiquidity,
	#[msg("Amount is too small to buy one unit")]
	DustFill,
	#[msg("Signer is not the market admin")]
	NotAdmin,
	#[msg("Market accounts already initialized")]
	AlreadyInitialized,
	#[msg("Arithmetic overflow")]
	Overflow,
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn units_cancel_decimals() {
		// $100 at $250.00 (exponent -8) = 0.4 units = 400_000 base units.
		assert_eq!(units_for(100_000_000, 250_00000000, -8).unwrap(), 400_000);
		// $1 at $1.00 = 1 unit.
		assert_eq!(units_for(1_000_000, 100_000_000, -8).unwrap(), 1_000_000);
		// exponent -2 works the same way.
		assert_eq!(units_for(100_000_000, 25_000, -2).unwrap(), 400_000);
	}

	#[test]
	fn units_reject_bad_inputs() {
		assert!(units_for(1, 0, -8).is_err());
		assert!(units_for(1, 100, 1).is_err());
	}
}
