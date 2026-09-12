//! `execute_basket`: the whole product lives here.
//!
//! The keeper calls this once per period. The program re-checks everything
//! the keeper claims: schedule, vault balance, and for every leg the
//! reference price (a Pyth `PriceUpdateV2` account owned by
//! `config.reference_program`) and the venue quote (a `mock_market` market on
//! devnet). If any check fails the plan is *deferred*: the reason is written
//! on chain, `Deferred` is emitted and the instruction returns Ok, so the
//! deferral itself is a successful, auditable transaction. If every check
//! passes, every leg is filled by CPI in this one transaction; a failure in
//! any fill reverts all of them.

use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};
use mock_market::program::MockMarket;
use mock_market::{Market, PriceUpdateV2, VerificationLevel};

use crate::errors::BasketError;
use crate::events::*;
use crate::state::*;

/// Remaining accounts per leg, in this order:
/// reference (Pyth-layout price), market, stock_mint, treasury,
/// market_reference (the venue's own quote account), recipient (owner's ATA).
pub const ACCOUNTS_PER_LEG: usize = 6;

/// After a deferral the plan becomes due again this many seconds later. The
/// keeper additionally waits for the session to open, and the admin can pull
/// it forward with `nudge_plan` for the demo.
pub const DEFER_RETRY_SECONDS: i64 = 3600;

#[derive(Accounts)]
pub struct ExecuteBasket<'info> {
	#[account(
		seeds = [CONFIG_SEED],
		bump = config.bump,
		has_one = keeper @ BasketError::NotKeeper,
		has_one = fill_program @ BasketError::BadVenue,
	)]
	pub config: Box<Account<'info, Config>>,
	#[account(mut, has_one = vault)]
	pub plan: Box<Account<'info, Plan>>,
	#[account(mut)]
	pub vault: Box<Account<'info, TokenAccount>>,
	pub keeper: Signer<'info>,
	pub fill_program: Program<'info, MockMarket>,
	pub token_program: Program<'info, Token>,
}

/// Admin-only demo control: makes a plan due at `ts` (0 = now). Exists so the
/// 90-second demo can "advance the clock" on devnet, where time is real.
#[derive(Accounts)]
pub struct NudgePlan<'info> {
	#[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ BasketError::NotAdmin)]
	pub config: Box<Account<'info, Config>>,
	#[account(mut)]
	pub plan: Box<Account<'info, Plan>>,
	pub admin: Signer<'info>,
}

struct LegAccounts<'a, 'info> {
	reference: &'a AccountInfo<'info>,
	market: &'a AccountInfo<'info>,
	stock_mint: &'a AccountInfo<'info>,
	treasury: &'a AccountInfo<'info>,
	market_reference: &'a AccountInfo<'info>,
	recipient: &'a AccountInfo<'info>,
}

/// Everything the guard learned about one leg, kept for the fill and the event.
struct LegQuote {
	usdc_in: u64,
	reference_price: i64,
	venue_price: i64,
	exponent: i32,
}

enum Verdict {
	Go,
	Defer { reason: ReasonCode, leg_index: u8, detail: i64 },
}

pub fn execute_basket<'info>(ctx: Context<'_, '_, 'info, 'info, ExecuteBasket<'info>>) -> Result<()> {
	let clock = Clock::get()?;
	let now = clock.unix_timestamp;
	let config = &ctx.accounts.config;
	let plan_key = ctx.accounts.plan.key();

	// ---- schedule ------------------------------------------------------------
	{
		let plan = &mut **ctx.accounts.plan;
		require!(plan.status == PlanStatus::Active as u8, BasketError::PlanNotActive);
		require!(now >= plan.next_execution, BasketError::NotDue);
		if plan.end_ts != 0 && now >= plan.end_ts {
			plan.status = PlanStatus::Ended as u8;
			emit!(PlanEnded { plan: plan_key, ts: now });
			return Ok(());
		}
	}

	let plan = &ctx.accounts.plan;
	let leg_count = plan.leg_count as usize;
	require!(
		ctx.remaining_accounts.len() == leg_count * ACCOUNTS_PER_LEG,
		BasketError::WrongLegAccountCount
	);

	// ---- guard: nothing below touches state until every leg has passed ------
	let mut quotes: Vec<LegQuote> = Vec::with_capacity(leg_count);
	let mut verdict = Verdict::Go;

	if ctx.accounts.vault.amount < plan.amount_per_period {
		verdict = Verdict::Defer {
			reason: ReasonCode::InsufficientBalance,
			leg_index: 0,
			detail: ctx.accounts.vault.amount as i64,
		};
	}

	let mut allocated: u64 = 0;
	if matches!(verdict, Verdict::Go) {
		for (i, leg) in plan.active_legs().iter().enumerate() {
			let la = leg_accounts(&ctx.remaining_accounts[i * ACCOUNTS_PER_LEG..(i + 1) * ACCOUNTS_PER_LEG]);
			let leg_index = i as u8;

			// Reference price: Pyth layout, owned by the configured program.
			require_keys_eq!(*la.reference.owner, config.reference_program, BasketError::BadReference);
			let reference = read_price_update(la.reference)?;
			require!(reference.price_message.feed_id == leg.pyth_feed_id, BasketError::BadReference);
			require!(reference.verification_level == VerificationLevel::Full, BasketError::BadReference);
			let msg = reference.price_message;
			require!(msg.price > 0, BasketError::BadReference);

			let age = now.saturating_sub(msg.publish_time);
			if age > config.max_staleness_secs as i64 {
				verdict = Verdict::Defer { reason: ReasonCode::ReferenceStale, leg_index, detail: age };
				break;
			}
			let conf_bps = mul_div(msg.conf, 10_000, msg.price as u64)?;
			if conf_bps > config.max_conf_bps as u64 {
				verdict = Verdict::Defer { reason: ReasonCode::ConfidenceTooWide, leg_index, detail: conf_bps as i64 };
				break;
			}

			// Venue: the mock market for this leg's mint.
			require_keys_eq!(*la.market.owner, config.fill_program, BasketError::BadVenue);
			let market = read_market(la.market)?;
			require_keys_eq!(market.stock_mint, leg.mint, BasketError::BadVenue);
			require_keys_eq!(market.stock_mint, la.stock_mint.key(), BasketError::BadVenue);
			require_keys_eq!(market.treasury, la.treasury.key(), BasketError::BadVenue);
			require_keys_eq!(market.reference, la.market_reference.key(), BasketError::BadVenue);
			require_keys_eq!(market.usdc_mint, config.usdc_mint, BasketError::BadVenue);
			require_keys_eq!(*la.market_reference.owner, config.fill_program, BasketError::BadVenue);
			let market_reference = read_price_update(la.market_reference)?;
			require!(market_reference.price_message.exponent == msg.exponent, BasketError::MismatchedExponent);
			let venue_price = market.venue_price(&market_reference)?;

			let divergence_bps = mul_div((venue_price - msg.price).unsigned_abs(), 10_000, msg.price as u64)?;
			if divergence_bps > config.max_divergence_bps as u64 {
				verdict = Verdict::Defer { reason: ReasonCode::Divergence, leg_index, detail: divergence_bps as i64 };
				break;
			}

			let usdc_in = if i + 1 == leg_count {
				plan.amount_per_period - allocated
			} else {
				mul_div(plan.amount_per_period, leg.weight_bps as u64, BPS_DENOM as u64)?
			};
			allocated += usdc_in;

			if market.liquidity_usdc < usdc_in || market.liquidity_usdc < config.min_liquidity_usdc {
				verdict = Verdict::Defer { reason: ReasonCode::LowLiquidity, leg_index, detail: market.liquidity_usdc as i64 };
				break;
			}

			quotes.push(LegQuote { usdc_in, reference_price: msg.price, venue_price, exponent: msg.exponent });
		}
	}

	if let Verdict::Defer { reason, leg_index, detail } = verdict {
		let plan = &mut **ctx.accounts.plan;
		plan.last_reason = reason as u8;
		plan.deferrals = plan.deferrals.saturating_add(1);
		plan.next_execution = now + DEFER_RETRY_SECONDS;
		emit!(Deferred {
			plan: plan_key,
			ts: now,
			reason: reason as u8,
			leg_index,
			detail,
			next_execution: plan.next_execution,
		});
		return Ok(());
	}

	// ---- execute: every leg or none ------------------------------------------
	let owner = plan.owner;
	let plan_id_bytes = plan.plan_id.to_le_bytes();
	let bump = [plan.bump];
	let seeds: &[&[u8]] = &[PLAN_SEED, owner.as_ref(), &plan_id_bytes, &bump];
	let signer_seeds: &[&[&[u8]]] = &[seeds];

	let mut fills: Vec<LegFill> = Vec::with_capacity(leg_count);
	for (i, quote) in quotes.iter().enumerate() {
		let la = leg_accounts(&ctx.remaining_accounts[i * ACCOUNTS_PER_LEG..(i + 1) * ACCOUNTS_PER_LEG]);
		let cpi = CpiContext::new_with_signer(
			ctx.accounts.fill_program.to_account_info(),
			mock_market::cpi::accounts::Fill {
				market: la.market.clone(),
				stock_mint: la.stock_mint.clone(),
				treasury: la.treasury.clone(),
				reference: la.market_reference.clone(),
				payer_usdc: ctx.accounts.vault.to_account_info(),
				payer_authority: ctx.accounts.plan.to_account_info(),
				recipient: la.recipient.clone(),
				token_program: ctx.accounts.token_program.to_account_info(),
			},
			signer_seeds,
		);
		let units = mock_market::cpi::fill(cpi, quote.usdc_in)?.get();
		fills.push(LegFill {
			mint: plan.legs[i].mint,
			usdc_in: quote.usdc_in,
			units,
			reference_price: quote.reference_price,
			venue_price: quote.venue_price,
			exponent: quote.exponent,
		});
	}

	let plan = &mut **ctx.accounts.plan;
	for (i, fill) in fills.iter().enumerate() {
		plan.legs[i].units_bought = plan.legs[i].units_bought.checked_add(fill.units).ok_or(BasketError::Overflow)?;
	}
	plan.total_invested = plan.total_invested.checked_add(plan.amount_per_period).ok_or(BasketError::Overflow)?;
	plan.executions = plan.executions.saturating_add(1);
	plan.last_reason = ReasonCode::Ok as u8;
	// Next slot on the grid; if the keeper was late by more than a period,
	// do not burst-catch-up, just resume from now.
	let mut next = plan.next_execution + plan.period_seconds as i64;
	if next <= now {
		next = now + plan.period_seconds as i64;
	}
	plan.next_execution = next;

	ctx.accounts.vault.reload()?;
	emit!(Executed {
		plan: plan_key,
		ts: now,
		usdc_in: plan.amount_per_period,
		vault_balance: ctx.accounts.vault.amount,
		next_execution: next,
		legs: fills,
	});
	Ok(())
}

pub fn nudge_plan(ctx: Context<NudgePlan>, ts: i64) -> Result<()> {
	let now = Clock::get()?.unix_timestamp;
	let plan = &mut **ctx.accounts.plan;
	plan.next_execution = if ts == 0 { now } else { ts };
	Ok(())
}

fn leg_accounts<'a, 'info>(slice: &'a [AccountInfo<'info>]) -> LegAccounts<'a, 'info> {
	LegAccounts {
		reference: &slice[0],
		market: &slice[1],
		stock_mint: &slice[2],
		treasury: &slice[3],
		market_reference: &slice[4],
		recipient: &slice[5],
	}
}

/// Deserializes a `PriceUpdateV2` without Anchor's owner check; the caller
/// has already matched the owner against config.
fn read_price_update(info: &AccountInfo) -> Result<PriceUpdateV2> {
	let data = info.try_borrow_data()?;
	let mut slice: &[u8] = &data;
	let parsed = PriceUpdateV2::try_deserialize(&mut slice).map_err(|_| error!(BasketError::BadReference));
	parsed
}

fn read_market(info: &AccountInfo) -> Result<Market> {
	let data = info.try_borrow_data()?;
	let mut slice: &[u8] = &data;
	let parsed = Market::try_deserialize(&mut slice).map_err(|_| error!(BasketError::BadVenue));
	parsed
}

/// a * b / c in u128, back to u64.
pub fn mul_div(a: u64, b: u64, c: u64) -> Result<u64> {
	require!(c > 0, BasketError::Overflow);
	let v = (a as u128).checked_mul(b as u128).ok_or(BasketError::Overflow)? / (c as u128);
	u64::try_from(v).map_err(|_| BasketError::Overflow.into())
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn mul_div_basics() {
		assert_eq!(mul_div(100_000_000, 5_000, 10_000).unwrap(), 50_000_000);
		// 0.5% confidence on a $250 price.
		assert_eq!(mul_div(125_000_000, 10_000, 25_000_000_000).unwrap(), 50);
		assert!(mul_div(1, 1, 0).is_err());
	}
}
