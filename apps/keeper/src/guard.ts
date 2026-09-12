// Off-chain preview of the on-chain guard. The program is the judge; this
// exists so the keeper can skip a transaction it knows will defer (saving a
// fee and a deferral count) and so the UI's guard panel can show the same
// numbers the program would compute. Pure; unit tested.

import type { ParsedPrice } from "./hermes";

export const REASON = {
	OK: 0,
	REFERENCE_STALE: 1,
	CONFIDENCE_TOO_WIDE: 2,
	MARKET_CLOSED: 3,
	DIVERGENCE: 4,
	LOW_LIQUIDITY: 5,
	INSUFFICIENT_BALANCE: 6,
} as const;

export type Thresholds = {
	maxStalenessSecs: number;
	maxConfBps: number;
	maxDivergenceBps: number;
	minLiquidityUsdc: bigint;
};

export type VenueQuote = { price: bigint; expo: number; liquidityUsdc: bigint };

export type LegVerdict = {
	feedId: string;
	ageSecs: number;
	confBps: number;
	divergenceBps: number | null;
	reason: number;
};

export function checkLeg(now: number, ref: ParsedPrice, venue: VenueQuote | null, legUsdc: bigint, t: Thresholds): LegVerdict {
	const ageSecs = now - ref.publishTime;
	const confBps = Number((ref.conf * 10_000n) / ref.price);
	let divergenceBps: number | null = null;
	let reason: number = REASON.OK;

	if (ageSecs > t.maxStalenessSecs) reason = REASON.REFERENCE_STALE;
	else if (confBps > t.maxConfBps) reason = REASON.CONFIDENCE_TOO_WIDE;
	else if (venue) {
		const diff = venue.price > ref.price ? venue.price - ref.price : ref.price - venue.price;
		divergenceBps = Number((diff * 10_000n) / ref.price);
		if (divergenceBps > t.maxDivergenceBps) reason = REASON.DIVERGENCE;
		else if (venue.liquidityUsdc < legUsdc || venue.liquidityUsdc < t.minLiquidityUsdc) reason = REASON.LOW_LIQUIDITY;
	}
	return { feedId: ref.feedId, ageSecs, confBps, divergenceBps, reason };
}

/** USDC per leg from weights; the last leg takes the rounding remainder, as
 *  the program does. */
export function legAmounts(amountPerPeriod: bigint, weightsBps: number[]): bigint[] {
	const out: bigint[] = [];
	let allocated = 0n;
	weightsBps.forEach((w, i) => {
		const v = i === weightsBps.length - 1 ? amountPerPeriod - allocated : (amountPerPeriod * BigInt(w)) / 10_000n;
		allocated += v;
		out.push(v);
	});
	return out;
}
