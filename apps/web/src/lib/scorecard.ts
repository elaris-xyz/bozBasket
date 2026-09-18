// The guard's scorecard, computed from keeper ledger rows.
//
// Pure: no database, no network, no path aliases, so it runs under
// `node --test`. The number the whole product rests on is tested, not
// asserted.
//
// The unit of account is the *held-back buy*. A timer-based bot makes one
// fill per scheduled slot; when the guard defers, the keeper retries every
// hour until the slot clears. Crediting each retry would multiply one avoided
// fill by however long the market stayed closed. So a period (the rows
// between two executions) is judged once, by the deferral that opened it:
// that is the moment the blind fill would have happened.

import { REASON } from "@bozbasket/shared";

/** One filled leg of an execution, as the keeper stores it (decimal strings). */
export type FillLeg = { mint: string; usdcIn: string; units: string; referencePrice: string; venuePrice: string; exponent: number };

/** The guard's per-leg snapshot stored with a deferral (a LegVerdict). */
export type GuardLeg = {
	feedId: string;
	referencePrice: number;
	venuePrice: number | null;
	liquidityUsdc?: number | null;
	legUsdc: number;
	ageSecs: number;
	confBps: number;
	divergenceBps: number | null;
	reason: number;
};

export type HistoryRow = {
	id: number;
	ts: number;
	kind: "executed" | "deferred" | "skipped" | "error";
	reason: number;
	detail: string | null;
	signature: string | null;
	usdcIn: number | null;
	legs: FillLeg[] | GuardLeg[] | null;
	/** A demo control caused this deferral, not the market. */
	forced: boolean;
	/** Overpayment avoided, recorded by the keeper for divergence deferrals. */
	avoidedUsdc: number | null;
};

export type Scorecard = {
	executions: number;
	/** Every deferral attempt, retries included. */
	deferrals: number;
	forcedDeferrals: number;
	/** Scheduled buys the market caused the guard to hold back, one per period. */
	heldBackBuys: number;
	/** Venue quoted above fair value: what one blind fill per held-back buy would have overpaid. */
	avoidedUsdc: number;
	/** Saved (+) or cost (-) by not buying on a stale reference price. */
	staleSavedUsdc: number;
	/** Organic deferral attempts per reason code. */
	byReason: Record<number, number>;
};

export const isFillLeg = (l: unknown): l is FillLeg =>
	typeof l === "object" && l !== null && typeof (l as FillLeg).mint === "string" && typeof (l as FillLeg).units === "string";

export const isGuardLeg = (l: unknown): l is GuardLeg =>
	typeof l === "object" && l !== null && typeof (l as GuardLeg).feedId === "string" && typeof (l as GuardLeg).referencePrice === "number";

/** A Pyth integer price with its exponent, as a number. Divides by an exact
 *  power of ten rather than multiplying by an inexact one, so 9500000000 at
 *  -8 is exactly 95. */
export function scaledPrice(price: string | number, exponent: number): number {
	const p = Number(price);
	return exponent < 0 ? p / 10 ** -exponent : p * 10 ** exponent;
}

const normFeed = (feedId: string) => feedId.replace(/^0x/i, "").toLowerCase();

const hasSnapshot = (r: HistoryRow) => Array.isArray(r.legs) && (r.legs as unknown[]).some(isGuardLeg);

/** The stale-price outcome of one held-back buy.
 *
 *  Legs are matched to the fill that closed the period by **mint**, never by
 *  amount: `update_plan` can change the amount in between, and matching on
 *  size would drop the pair without a word. Prices are compared **reference
 *  to reference**, because the fill's venue price carries the venue spread,
 *  and reporting the spread as "the market moved" would inflate the result.
 *
 *  Buying `legUsdc` at the stale price P_old instead of the next price P_new
 *  loses `legUsdc * (P_old - P_new) / P_old` of value. Positive: the price
 *  fell while the feed sat still and waiting saved money. Negative: it rose,
 *  and waiting cost money. */
function staleOutcome(opener: HistoryRow, closer: HistoryRow, mintByFeed: Record<string, string>): number {
	if (!Array.isArray(opener.legs) || !Array.isArray(closer.legs)) return 0;
	const fills = (closer.legs as unknown[]).filter(isFillLeg);
	let total = 0;
	for (const leg of opener.legs as unknown[]) {
		if (!isGuardLeg(leg) || !(leg.referencePrice > 0) || !(leg.legUsdc > 0)) continue;
		const mint = mintByFeed[normFeed(leg.feedId)];
		if (!mint) continue;
		const fill = fills.find((f) => f.mint === mint);
		if (!fill) continue;
		const next = scaledPrice(fill.referencePrice, fill.exponent);
		if (!(next > 0)) continue;
		total += (leg.legUsdc * (leg.referencePrice - next)) / leg.referencePrice;
	}
	return total;
}

export function buildScorecard(rows: HistoryRow[], mintByFeed: Record<string, string>): Scorecard {
	const mints: Record<string, string> = {};
	for (const [feed, mint] of Object.entries(mintByFeed)) mints[normFeed(feed)] = mint;

	const ascending = [...rows].sort((a, b) => a.ts - b.ts || a.id - b.id);
	const card: Scorecard = { executions: 0, deferrals: 0, forcedDeferrals: 0, heldBackBuys: 0, avoidedUsdc: 0, staleSavedUsdc: 0, byReason: {} };

	// The first deferral of the open period, forced or not. A period opened by
	// a demo control is not credited, even if a later retry was organic.
	let opener: HistoryRow | null = null;
	// The earliest organic stale deferral in the period that carries a guard
	// snapshot. Rows written before the keeper stored snapshots have none, and
	// a period opened by one would otherwise always score zero. While a feed is
	// stale its price does not move, so a later snapshot in the same period
	// quotes the same frozen price the opener saw. It never crosses periods.
	let staleSnapshot: HistoryRow | null = null;

	for (const r of ascending) {
		if (r.kind === "deferred") {
			card.deferrals++;
			if (r.forced) card.forcedDeferrals++;
			else card.byReason[r.reason] = (card.byReason[r.reason] ?? 0) + 1;
			if (!opener) {
				opener = r;
				if (!r.forced) {
					card.heldBackBuys++;
					if (r.reason === REASON.DIVERGENCE) card.avoidedUsdc += r.avoidedUsdc ?? 0;
				}
			}
			if (!staleSnapshot && !r.forced && r.reason === REASON.REFERENCE_STALE && hasSnapshot(r)) staleSnapshot = r;
		} else if (r.kind === "executed") {
			card.executions++;
			// A demo fill runs on the mock reference: it ends the period, since
			// the plan did buy, but its price says nothing about the stale one.
			if (opener && !opener.forced && !r.forced && opener.reason === REASON.REFERENCE_STALE) {
				const source = hasSnapshot(opener) ? opener : staleSnapshot;
				if (source) card.staleSavedUsdc += staleOutcome(source, r, mints);
			}
			opener = null;
			staleSnapshot = null;
		}
	}
	return card;
}
