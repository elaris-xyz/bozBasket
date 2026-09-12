// Mirrors ReasonCode in programs/basket_dca/src/state.rs. Change both together.
export const REASON = {
	OK: 0,
	REFERENCE_STALE: 1,
	CONFIDENCE_TOO_WIDE: 2,
	MARKET_CLOSED: 3,
	DIVERGENCE: 4,
	LOW_LIQUIDITY: 5,
	INSUFFICIENT_BALANCE: 6,
} as const;

export type ReasonCode = (typeof REASON)[keyof typeof REASON];

export const REASON_LABEL: Record<ReasonCode, string> = {
	0: "Executed",
	1: "Reference price stale",
	2: "Confidence too wide",
	3: "Market closed",
	4: "Venue diverges from reference",
	5: "Low liquidity",
	6: "Insufficient vault balance",
};
