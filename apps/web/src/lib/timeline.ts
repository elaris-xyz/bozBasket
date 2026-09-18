// A plan's invested amount and value over time, for the chart on the plan page.
//
// Pure: no database, no network, no path aliases, so it runs under
// `node --test`. The route (app/api/timeline) reads the ledger and samples
// Pyth history; this file turns both into points and held-back periods.
//
// Value is units held times the Pyth reference price, as the Portfolio card
// values them. Between fills the prices come from Hermes history. When Pyth
// published nothing near a moment (Friday 20:00 to Sunday 20:00 ET, holidays)
// the point keeps the last price it did publish and says so: that flat stretch
// is the window in which the guard refuses to buy.

import { isFillLeg, scaledPrice, type HistoryRow } from "./scorecard";

/** Stock mints and USDC both have 6 decimals, as the Portfolio card assumes. */
const BASE_UNITS = 1e6;

/** Pyth prices at one moment keyed by stock mint; null when Pyth published
 *  nothing near that moment. */
export type PriceSample = { ts: number; prices: Record<string, number> | null };

export type TimelinePoint = {
	ts: number;
	/** USDC spent on fills so far. */
	invested: number;
	/** Holdings at the reference price of the moment; null while a held leg has no price. */
	value: number | null;
	/** Pyth published nothing near this moment: valued at the last price it did. */
	stale: boolean;
	/** A fill landed here. */
	fill: boolean;
};

/** A stretch in which the guard held the scheduled buy back: from the first
 *  deferral after a fill to the fill that ended it, `to` null while it lasts.
 *  Judged by its opening deferral, as the scorecard judges a period. */
export type HeldBack = { from: number; to: number | null; reason: number; forced: boolean; attempts: number };

export type Timeline = { points: TimelinePoint[]; heldBack: HeldBack[]; invested: number };

/** Sampling steps, finest first. */
export const SAMPLE_STEPS = [300, 900, 1800, 3600, 3 * 3600, 6 * 3600, 12 * 3600, 86_400];

/** Moments strictly after `from` and at least `margin` seconds before `to`, on
 *  multiples of the finest step that keeps them to `maxPoints`. Aligned to the
 *  step, so every plan asks Hermes for the same moments and reuses its answers. */
export function sampleGrid(from: number, to: number, maxPoints = 60, margin = 300): number[] {
	const end = to - margin;
	if (!(end > from)) return [];
	const step = SAMPLE_STEPS.find((s) => (end - from) / s <= maxPoints) ?? SAMPLE_STEPS[SAMPLE_STEPS.length - 1];
	const out: number[] = [];
	for (let t = Math.floor(from / step) * step + step; t <= end; t += step) out.push(t);
	return out;
}

/** A stored reference price, as the keeper records it (keeper/src/references.ts):
 *  `price` null when Pyth had nothing near `ts`. */
export type ReferenceRow = { ts: number; feedId: string; price: number | null; publishTime: number | null };

/** A price this much older than the moment it stands for is Pyth's silence
 *  (the weekend, a holiday), not a quote. */
export const SILENT_AFTER_SECS = 1800;

/** One sample per grid moment: the latest stored moment at or before it, and
 *  no further back than `maxGap`, which a keeper outage leaves out rather than
 *  calls silent. A moment where any feed is missing or old is a silence. */
export function samplesFromReferences(rows: ReferenceRow[], grid: number[], mintByFeed: Record<string, string>, maxGap = 3600): PriceSample[] {
	const moments = new Map<number, ReferenceRow[]>();
	for (const r of rows) moments.set(r.ts, [...(moments.get(r.ts) ?? []), r]);
	const times = [...moments.keys()].sort((a, b) => a - b);
	const out: PriceSample[] = [];
	let i = -1;
	for (const g of grid) {
		while (i + 1 < times.length && times[i + 1] <= g) i++;
		if (i < 0 || g - times[i] > maxGap) continue;
		const at = times[i];
		let prices: Record<string, number> | null = {};
		for (const r of moments.get(at)!) {
			const mint = mintByFeed[r.feedId.replace(/^0x/i, "").toLowerCase()];
			if (!mint) continue;
			if (r.price === null || r.publishTime === null || at - r.publishTime > SILENT_AFTER_SECS) {
				prices = null;
				break;
			}
			prices[mint] = r.price;
		}
		if (prices && Object.keys(prices).length === 0) continue;
		out.push({ ts: g, prices });
	}
	return out;
}

const finite = (s: string) => {
	const n = Number(s);
	return Number.isFinite(n) ? n : null;
};

export function buildTimeline(rows: HistoryRow[], samples: PriceSample[]): Timeline {
	// Skips and errors are the keeper's, never the program's: they do not
	// open a held-back period and move no money.
	const ascending = rows.filter((r) => r.kind === "executed" || r.kind === "deferred").sort((a, b) => a.ts - b.ts || a.id - b.id);
	const pending = [...samples].sort((a, b) => a.ts - b.ts);
	const units: Record<string, number> = {};
	const price: Record<string, number> = {};
	const points: TimelinePoint[] = [];
	const heldBack: HeldBack[] = [];
	let open: HeldBack | null = null;
	let invested = 0;
	let next = 0;

	const value = (): number | null => {
		let v = 0;
		for (const [mint, u] of Object.entries(units)) {
			if (u === 0) continue;
			if (price[mint] === undefined) return null;
			v += u * price[mint];
		}
		return v;
	};
	// Samples before the first row have nothing to value, so the chart starts
	// at the plan's first activity.
	const samplesBefore = (ts: number) => {
		for (; next < pending.length && pending[next].ts < ts; next++) {
			const s = pending[next];
			if (points.length === 0) continue;
			if (s.prices) Object.assign(price, s.prices);
			points.push({ ts: s.ts, invested, value: value(), stale: s.prices === null, fill: false });
		}
	};

	for (const r of ascending) {
		samplesBefore(r.ts);
		if (r.kind === "deferred") {
			if (open) open.attempts++;
			else {
				open = { from: r.ts, to: null, reason: r.reason, forced: r.forced, attempts: 1 };
				heldBack.push(open);
			}
			if (points.length === 0) points.push({ ts: r.ts, invested, value: value(), stale: false, fill: false });
			continue;
		}
		const fills = Array.isArray(r.legs) ? (r.legs as unknown[]).filter(isFillLeg) : [];
		for (const f of fills) {
			const p = finite(f.referencePrice);
			if (p !== null && p > 0) price[f.mint] = scaledPrice(p, f.exponent);
		}
		// The holdings just before the fill, at the fill's prices, so the value
		// line rises at the fill instead of sloping in from the previous sample.
		if (points.length > 0) points.push({ ts: r.ts, invested, value: value(), stale: false, fill: false });
		for (const f of fills) {
			const u = finite(f.units);
			if (u !== null) units[f.mint] = (units[f.mint] ?? 0) + u / BASE_UNITS;
		}
		invested += r.usdcIn ?? fills.reduce((s, f) => s + (finite(f.usdcIn) ?? 0) / BASE_UNITS, 0);
		if (open) {
			open.to = r.ts;
			open = null;
		}
		points.push({ ts: r.ts, invested, value: value(), stale: false, fill: true });
	}
	samplesBefore(Infinity);
	return { points, heldBack, invested };
}

/** Rows for the chart: `live` breaks where Pyth was silent, and `frozen`
 *  spans that stretch, joined to the priced points on either side. */
export function chartRows(points: TimelinePoint[]) {
	return points.map((p, i) => ({
		...p,
		live: p.stale ? null : p.value,
		frozen: p.stale || points[i - 1]?.stale || points[i + 1]?.stale ? p.value : null,
	}));
}
