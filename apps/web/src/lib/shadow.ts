// The mainnet shadow check, summarised for the landing page. The keeper
// writes one row per xStock every few minutes (apps/keeper/src/shadow.ts):
// what $100 of USDC buys on Jupiter, the Pyth price, and the guard's verdict
// with the default limits. Pure, so it is unit tested.

import { REASON } from "@bozbasket/shared";

export type ShadowPoint = {
	ts: number;
	symbol: string;
	venuePrice: number | null;
	refPrice: number | null;
	refAgeSecs: number | null;
	confBps: number | null;
	/** Signed: above zero the pool charges more than the reference. */
	divergenceBps: number | null;
	priceImpactBps: number | null;
	/** The guard's verdict; null when the check itself failed. */
	reason: number | null;
	session: string;
	error: string | null;
};

export type ShadowSummary = {
	since: number | null;
	/** Checks that reached a verdict. */
	checks: number;
	wouldBuy: number;
	/** Deferrals per reason code. */
	byReason: Record<number, number>;
	/** The most a blind $100 buy would have paid over the Pyth price; null
	 *  when no buy would have paid more than it. */
	worstPremium: { bps: number; ts: number; symbol: string; reason: number } | null;
	/** Median |pool - Pyth|, with a fresh reference and with a stale one. */
	medianGapBps: { fresh: number | null; stale: number | null };
};

export type SeriesRow = { ts: number } & Record<string, number | null>;

type Priced = ShadowPoint & { divergenceBps: number; reason: number };

function median(xs: number[]): number | null {
	if (xs.length === 0) return null;
	const s = [...xs].sort((a, b) => a - b);
	const m = s.length >> 1;
	return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function summarize(points: ShadowPoint[]): ShadowSummary {
	const judged = points.filter((p) => p.reason !== null);
	const byReason: Record<number, number> = {};
	for (const p of judged) if (p.reason !== REASON.OK) byReason[p.reason as number] = (byReason[p.reason as number] ?? 0) + 1;

	const priced = judged.filter((p): p is Priced => p.divergenceBps !== null);
	const worst = priced.reduce<Priced | null>((w, p) => (w === null || p.divergenceBps > w.divergenceBps ? p : w), null);
	const gaps = (stale: boolean) => priced.filter((p) => (p.reason === REASON.REFERENCE_STALE) === stale).map((p) => Math.abs(p.divergenceBps));

	return {
		since: points.reduce<number | null>((m, p) => (m === null || p.ts < m ? p.ts : m), null),
		checks: judged.length,
		wouldBuy: judged.filter((p) => p.reason === REASON.OK).length,
		byReason,
		worstPremium: worst && worst.divergenceBps > 0 ? { bps: worst.divergenceBps, ts: worst.ts, symbol: worst.symbol, reason: worst.reason } : null,
		medianGapBps: { fresh: median(gaps(false)), stale: median(gaps(true)) },
	};
}

export function latestBySymbol(points: ShadowPoint[]): Record<string, ShadowPoint> {
	const out: Record<string, ShadowPoint> = {};
	for (const p of points) if (!out[p.symbol] || p.ts > out[p.symbol].ts) out[p.symbol] = p;
	return out;
}

/** One row per time bucket holding each symbol's last gap in it, oldest
 *  first, for the chart. A symbol without a price in a bucket is null. */
export function bucketSeries(points: ShadowPoint[], symbols: string[], bucketSecs: number): SeriesRow[] {
	const buckets = new Map<number, Record<string, { ts: number; bps: number }>>();
	for (const p of points) {
		if (p.divergenceBps === null) continue;
		const key = Math.floor(p.ts / bucketSecs) * bucketSecs;
		const values = buckets.get(key) ?? {};
		if (!values[p.symbol] || p.ts >= values[p.symbol].ts) values[p.symbol] = { ts: p.ts, bps: p.divergenceBps };
		buckets.set(key, values);
	}
	return [...buckets.entries()]
		.sort(([a], [b]) => a - b)
		.map(([ts, values]) => {
			const row = { ts } as SeriesRow;
			for (const s of symbols) row[s] = values[s] ? Math.round(values[s].bps * 10) / 10 : null;
			return row;
		});
}
