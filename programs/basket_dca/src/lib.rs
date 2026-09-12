//! bozBasket on-chain program.
//!
//! Day 1: an empty program that carries the account model from
//! docs/PROPOSAL.md section 5 so the layout and sizes are compiled and
//! checked before any instruction logic exists. Instructions arrive on day 2.

use anchor_lang::prelude::*;

pub mod state;
pub use state::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod basket_dca {
	use super::*;

	/// Placeholder so `anchor build` produces an IDL. Replaced on day 2 by
	/// `init_config`, `create_plan`, `deposit`, `withdraw`, `execute_basket`.
	pub fn ping(_ctx: Context<Ping>) -> Result<()> {
		Ok(())
	}
}

#[derive(Accounts)]
pub struct Ping {}
