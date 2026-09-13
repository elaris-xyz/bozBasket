// Off-chain twin of the on-chain guard in programs/basket_dca/src/execute.rs.
//
// The program is the judge: it recomputes all of this from the accounts in
// the transaction and it alone decides. This copy exists so the keeper can
// see what will happen before paying a fee, and so the guard panel in the
// web app shows the reader exactly the numbers the program will use. Keep
// the two in step; the thresholds come from the on-chain Config either way.
//
// Pure, no chain or network access, so it is unit tested.

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

export type Thresholds = {
	maxStalenessSecs: number;
	maxConfBps: number;
	maxDivergenceBps: number;
	minLiquidityUsdc: bigint;
};

/** What `init_config` / `setup-devnet` write, and what the demo "restore"
 *  control puts back. One home so the two cannot drift. */
export const DEFAULT_THRESHOLDS: { maxStalenessSecs: number; maxConfBps: number; maxDivergenceBps: number; minLiquidityUsdc: number } = {
	maxStalenessSecs: 120,
	maxConfBps: 50,
	maxDivergenceBps: 150,
	minLiquidityUsdc: 500_000_000,
};

/** Per mock market, also restored by the demo control. */
export const DEFAULT_MARKET: { spreadBps: number; liquidityUsdc: number } = { spreadBps: 20, liquidityUsdc: 50_000_000_000 };

/** A Pyth price, however it was obtained (Hermes, or a price account). */
export type ReferencePrice = {
	feedId: string;
	price: bigint;
	conf: bigint;
	expo: number;
	publishTime: number;
};

/** What the fill venue would charge, and how much depth it has. */
export type VenueQuote = { price: bigint; expo: number; liquidityUsdc: bigint };

export type LegVerdict = {
	feedId: string;
	/** Seconds between the reference publish time and now. */
	ageSecs: number;
	/** conf / price, in basis points. */
	confBps: number;
	/** |venue - reference| / reference, in basis points. Null without a venue. */
	divergenceBps: number | null;
	/** Human-scale prices, for display. */
	referencePrice: number;
	venuePrice: number | null;
	liquidityUsdc: number | null;
	/** USDC this leg would spend. */
	legUsdc: number;
	reason: ReasonCode;
};

const bpsOf = (part: bigint, whole: bigint) => Number((part * 10_000n) / whole);

/** Same order of checks as the program: staleness, confidence, divergence,
 *  liquidity. The first failure wins, so the reason code matches. */
export function checkLeg(now: number, ref: ReferencePrice, venue: VenueQuote | null, legUsdc: bigint, t: Thresholds): LegVerdict {
	const ageSecs = now - ref.publishTime;
	const confBps = bpsOf(ref.conf, ref.price);
	const scale = 10 ** ref.expo;
	let divergenceBps: number | null = null;
	let reason: ReasonCode = REASON.OK;

	if (ageSecs > t.maxStalenessSecs) reason = REASON.REFERENCE_STALE;
	else if (confBps > t.maxConfBps) reason = REASON.CONFIDENCE_TOO_WIDE;
	else if (venue) {
		const diff = venue.price > ref.price ? venue.price - ref.price : ref.price - venue.price;
		divergenceBps = bpsOf(diff, ref.price);
		if (divergenceBps > t.maxDivergenceBps) reason = REASON.DIVERGENCE;
		else if (venue.liquidityUsdc < legUsdc || venue.liquidityUsdc < t.minLiquidityUsdc) reason = REASON.LOW_LIQUIDITY;
	}

	return {
		feedId: ref.feedId,
		ageSecs,
		confBps,
		divergenceBps,
		referencePrice: Number(ref.price) * scale,
		venuePrice: venue ? Number(venue.price) * scale : null,
		liquidityUsdc: venue ? Number(venue.liquidityUsdc) / 1e6 : null,
		legUsdc: Number(legUsdc) / 1e6,
		reason,
	};
}

/** USDC per leg from weights. The last leg takes the rounding remainder,
 *  exactly as `execute_basket` does, so the parts always sum to the whole. */
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

/** The basket's verdict: the first failing leg, or OK. Vault shortfall is
 *  checked before any leg, as the program does. */
export function basketVerdict(legs: LegVerdict[], vaultUsdc: number, amountPerPeriod: number): { reason: ReasonCode; legIndex: number | null } {
	if (vaultUsdc < amountPerPeriod) return { reason: REASON.INSUFFICIENT_BALANCE, legIndex: null };
	const i = legs.findIndex((l) => l.reason !== REASON.OK);
	return i === -1 ? { reason: REASON.OK, legIndex: null } : { reason: legs[i].reason, legIndex: i };
}
