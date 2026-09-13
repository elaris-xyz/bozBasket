// Display names for the reason codes. The codes themselves live in guard.ts
// next to the logic that produces them, and mirror `ReasonCode` in
// programs/basket_dca/src/state.rs. Change all three together.

import { REASON, type ReasonCode } from "./guard";

export const REASON_LABEL: Record<ReasonCode, string> = {
	[REASON.OK]: "Executed",
	[REASON.REFERENCE_STALE]: "Reference price stale",
	[REASON.CONFIDENCE_TOO_WIDE]: "Confidence too wide",
	[REASON.MARKET_CLOSED]: "Market closed",
	[REASON.DIVERGENCE]: "Venue diverged from reference",
	[REASON.LOW_LIQUIDITY]: "Low liquidity",
	[REASON.INSUFFICIENT_BALANCE]: "Insufficient vault balance",
};

/** Label for a code read off the chain, where the type is just `u8`. An
 *  unrecognised code must not crash a page. */
export const reasonLabel = (code: number): string => REASON_LABEL[code as ReasonCode] ?? `Unknown reason ${code}`;
