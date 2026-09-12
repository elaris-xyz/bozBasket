use anchor_lang::prelude::*;

#[error_code]
pub enum BasketError {
	#[msg("A plan needs between 1 and 8 legs")]
	BadLegCount,
	#[msg("Leg weights must sum to 10000 basis points")]
	WeightsDoNotSum,
	#[msg("A leg weight must be greater than zero")]
	ZeroWeight,
	#[msg("The same mint appears twice in the basket")]
	DuplicateMint,
	#[msg("Amount per period must be greater than zero")]
	ZeroAmount,
	#[msg("Period is shorter than the minimum")]
	PeriodTooShort,
	#[msg("End timestamp is before the first execution")]
	EndBeforeStart,
	#[msg("Amount must be greater than zero")]
	ZeroTransfer,
	#[msg("Vault balance is too low for this withdrawal")]
	InsufficientVault,
	#[msg("Plan has ended and cannot be resumed")]
	PlanEnded,
	#[msg("Plan is already in that state")]
	NoStatusChange,
	#[msg("Signer is not the plan owner")]
	NotOwner,
	#[msg("Signer is not the config admin")]
	NotAdmin,
	#[msg("Arithmetic overflow")]
	Overflow,
}
