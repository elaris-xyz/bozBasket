//! bozBasket on-chain program: recurring basket buys of tokenized US stocks,
//! executed by a keeper only when the reference price can be trusted.
//!
//! `create_plan`/`deposit`/`withdraw`/`set_paused` are the user's side;
//! `execute_basket` in `execute.rs` is the keeper's side and holds the guard.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

pub mod errors;
pub mod events;
pub mod execute;
pub mod state;

pub use errors::BasketError;
pub use events::*;
pub use execute::*;
pub use state::*;

declare_id!("4Tv5nEbh6b6EGNhep7rpeLy7NXpiz8AkRmVi36iwxVuR");

#[program]
pub mod basket_dca {
	use super::*;

	/// One-time global parameters. The signer becomes admin.
	pub fn init_config(ctx: Context<InitConfig>, params: ConfigParams) -> Result<()> {
		let config = &mut ctx.accounts.config;
		config.admin = ctx.accounts.admin.key();
		config.keeper = params.keeper;
		config.usdc_mint = ctx.accounts.usdc_mint.key();
		config.max_staleness_secs = params.max_staleness_secs;
		config.max_conf_bps = params.max_conf_bps;
		config.max_divergence_bps = params.max_divergence_bps;
		config.min_liquidity_usdc = params.min_liquidity_usdc;
		config.fill_program = params.fill_program;
		config.reference_program = params.reference_program;
		config.bump = ctx.bumps.config;
		emit!(ConfigInitialized {
			admin: config.admin,
			keeper: config.keeper,
			usdc_mint: config.usdc_mint,
		});
		Ok(())
	}

	/// Admin can retune thresholds (demo controls use this too).
	pub fn update_config(ctx: Context<UpdateConfig>, params: ConfigParams) -> Result<()> {
		let config = &mut ctx.accounts.config;
		config.keeper = params.keeper;
		config.max_staleness_secs = params.max_staleness_secs;
		config.max_conf_bps = params.max_conf_bps;
		config.max_divergence_bps = params.max_divergence_bps;
		config.min_liquidity_usdc = params.min_liquidity_usdc;
		config.fill_program = params.fill_program;
		config.reference_program = params.reference_program;
		Ok(())
	}

	/// Creates a plan and its USDC vault. Weights must sum to 10_000.
	/// `start_ts` of 0 means "as soon as the keeper runs".
	pub fn create_plan(
		ctx: Context<CreatePlan>,
		plan_id: u16,
		amount_per_period: u64,
		period_seconds: u64,
		start_ts: i64,
		end_ts: i64,
		legs: Vec<LegInput>,
	) -> Result<()> {
		require!(!legs.is_empty() && legs.len() <= MAX_LEGS, BasketError::BadLegCount);
		require!(amount_per_period > 0, BasketError::ZeroAmount);
		require!(period_seconds >= MIN_PERIOD_SECONDS, BasketError::PeriodTooShort);

		let mut sum: u32 = 0;
		for (i, leg) in legs.iter().enumerate() {
			require!(leg.weight_bps > 0, BasketError::ZeroWeight);
			sum += leg.weight_bps as u32;
			for other in &legs[..i] {
				require!(other.mint != leg.mint, BasketError::DuplicateMint);
			}
		}
		require!(sum == BPS_DENOM as u32, BasketError::WeightsDoNotSum);

		let now = Clock::get()?.unix_timestamp;
		let next_execution = if start_ts == 0 { now } else { start_ts };
		require!(end_ts == 0 || end_ts > next_execution, BasketError::EndBeforeStart);

		// The Plan account is ~750 bytes and the SBF stack frame is 4 KiB, so
		// the account is boxed and every leg is written in place; no `[Leg; 8]`
		// temporary ever lives on the stack.
		let plan_key = ctx.accounts.plan.key();
		let plan = &mut **ctx.accounts.plan;
		plan.owner = ctx.accounts.owner.key();
		plan.plan_id = plan_id;
		plan.bump = ctx.bumps.plan;
		plan.amount_per_period = amount_per_period;
		plan.period_seconds = period_seconds;
		plan.next_execution = next_execution;
		plan.end_ts = end_ts;
		for (i, slot) in plan.legs.iter_mut().enumerate() {
			match legs.get(i) {
				Some(input) => {
					slot.mint = input.mint;
					slot.weight_bps = input.weight_bps;
					slot.pyth_feed_id = input.pyth_feed_id;
					slot.units_bought = 0;
				}
				None => *slot = Leg::default(),
			}
		}
		plan.leg_count = legs.len() as u8;
		plan.executions = 0;
		plan.deferrals = 0;
		plan.last_reason = ReasonCode::Ok as u8;
		plan.total_invested = 0;
		plan.status = PlanStatus::Active as u8;
		plan.vault = ctx.accounts.vault.key();
		plan.vault_bump = ctx.bumps.vault;

		emit!(PlanCreated {
			plan: plan_key,
			owner: plan.owner,
			plan_id,
			amount_per_period,
			period_seconds,
			next_execution,
			leg_count: plan.leg_count,
		});
		Ok(())
	}

	/// Moves USDC from the owner into the plan vault.
	pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
		require!(amount > 0, BasketError::ZeroTransfer);
		token::transfer(
			CpiContext::new(
				ctx.accounts.token_program.to_account_info(),
				Transfer {
					from: ctx.accounts.owner_usdc.to_account_info(),
					to: ctx.accounts.vault.to_account_info(),
					authority: ctx.accounts.owner.to_account_info(),
				},
			),
			amount,
		)?;
		ctx.accounts.vault.reload()?;
		emit!(Deposited {
			plan: ctx.accounts.plan.key(),
			amount,
			vault_balance: ctx.accounts.vault.amount,
		});
		Ok(())
	}

	/// Pulls USDC out of the vault. Non-custodial: only the owner can, at any
	/// time. If less than one period remains, the plan pauses itself so the
	/// keeper does not burn a deferral on INSUFFICIENT_BALANCE.
	pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
		require!(amount > 0, BasketError::ZeroTransfer);
		require!(ctx.accounts.vault.amount >= amount, BasketError::InsufficientVault);

		let plan = &ctx.accounts.plan;
		let owner_key = plan.owner;
		let plan_id_bytes = plan.plan_id.to_le_bytes();
		let seeds: &[&[u8]] = &[PLAN_SEED, owner_key.as_ref(), &plan_id_bytes, &[plan.bump]];
		token::transfer(
			CpiContext::new_with_signer(
				ctx.accounts.token_program.to_account_info(),
				Transfer {
					from: ctx.accounts.vault.to_account_info(),
					to: ctx.accounts.owner_usdc.to_account_info(),
					authority: ctx.accounts.plan.to_account_info(),
				},
				&[seeds],
			),
			amount,
		)?;
		ctx.accounts.vault.reload()?;
		let remaining = ctx.accounts.vault.amount;

		let plan = &mut ctx.accounts.plan;
		let mut paused = false;
		if remaining < plan.amount_per_period && plan.status == PlanStatus::Active as u8 {
			plan.status = PlanStatus::Paused as u8;
			paused = true;
			emit!(StatusChanged { plan: plan.key(), status: plan.status });
		}
		emit!(Withdrawn { plan: plan.key(), amount, vault_balance: remaining, paused });
		Ok(())
	}

	/// Owner toggles between Active and Paused. Ended plans stay ended.
	pub fn set_paused(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
		let plan = &mut ctx.accounts.plan;
		require!(plan.status != PlanStatus::Ended as u8, BasketError::PlanEnded);
		let target = if paused { PlanStatus::Paused } else { PlanStatus::Active } as u8;
		require!(plan.status != target, BasketError::NoStatusChange);
		plan.status = target;
		emit!(StatusChanged { plan: plan.key(), status: target });
		Ok(())
	}

	/// Keeper-only. Checks the guard for every leg and either fills the whole
	/// basket atomically or records a deferral with a reason code. See
	/// `execute.rs`; remaining accounts are 6 per leg in leg order.
	pub fn execute_basket<'info>(ctx: Context<'_, '_, 'info, 'info, ExecuteBasket<'info>>) -> Result<()> {
		execute::execute_basket(ctx)
	}

	/// Admin-only demo control: make a plan due at `ts` (0 = now).
	pub fn nudge_plan(ctx: Context<NudgePlan>, ts: i64) -> Result<()> {
		execute::nudge_plan(ctx, ts)
	}
}

#[derive(Accounts)]
pub struct InitConfig<'info> {
	#[account(
		init,
		payer = admin,
		space = 8 + Config::INIT_SPACE,
		seeds = [CONFIG_SEED],
		bump,
	)]
	pub config: Account<'info, Config>,
	pub usdc_mint: Account<'info, Mint>,
	#[account(mut)]
	pub admin: Signer<'info>,
	pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
	#[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ BasketError::NotAdmin)]
	pub config: Account<'info, Config>,
	pub admin: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(plan_id: u16)]
pub struct CreatePlan<'info> {
	// Everything sizeable is boxed: this struct inits two accounts and the SBF
	// frame limit is 4 KiB (the build prints "Stack offset exceeded" otherwise).
	#[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = usdc_mint)]
	pub config: Box<Account<'info, Config>>,
	pub usdc_mint: Box<Account<'info, Mint>>,
	#[account(
		init,
		payer = owner,
		space = 8 + Plan::INIT_SPACE,
		seeds = [PLAN_SEED, owner.key().as_ref(), &plan_id.to_le_bytes()],
		bump,
	)]
	pub plan: Box<Account<'info, Plan>>,
	#[account(
		init,
		payer = owner,
		seeds = [VAULT_SEED, plan.key().as_ref()],
		bump,
		token::mint = usdc_mint,
		token::authority = plan,
	)]
	pub vault: Box<Account<'info, TokenAccount>>,
	#[account(mut)]
	pub owner: Signer<'info>,
	pub token_program: Program<'info, Token>,
	pub system_program: Program<'info, System>,
	pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
	#[account(has_one = owner @ BasketError::NotOwner, has_one = vault)]
	pub plan: Box<Account<'info, Plan>>,
	#[account(mut)]
	pub vault: Account<'info, TokenAccount>,
	#[account(mut, token::mint = vault.mint, token::authority = owner)]
	pub owner_usdc: Account<'info, TokenAccount>,
	pub owner: Signer<'info>,
	pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
	#[account(mut, has_one = owner @ BasketError::NotOwner, has_one = vault)]
	pub plan: Box<Account<'info, Plan>>,
	#[account(mut)]
	pub vault: Account<'info, TokenAccount>,
	#[account(mut, token::mint = vault.mint, token::authority = owner)]
	pub owner_usdc: Account<'info, TokenAccount>,
	pub owner: Signer<'info>,
	pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SetPaused<'info> {
	#[account(mut, has_one = owner @ BasketError::NotOwner)]
	pub plan: Box<Account<'info, Plan>>,
	pub owner: Signer<'info>,
}
