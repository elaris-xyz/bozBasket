// The live weekend: what the mainnet check (./shadow) recorded while Pyth was
// silent, measured exactly as the eight-weekend backtest measures history
// (./backtest), so the two can sit in one table. The checks run every few
// minutes; they are folded into hourly candles (the median venue price of the
// hour) so a busy hour does not weigh more than a quiet one. Pure; the I/O is
// scripts/weekend-live.ts.

import { analyzeWeekend, bps, median, type Candle, type PricePoint, type WeekendResult, type WeekendWindow } from "./backtest";

/** One stored mainnet check, as `mainnet_shadow` holds it. `venuePrice` is per
 *  share, the issuer's multiplier already applied. */
export type ShadowCheck = { ts: number; symbol: string; venuePrice: number | null; refPrice: number | null; refAgeSecs: number | null; divergenceBps: number | null; reason: number | null };

export type LiveWeekend = {
	symbol: string;
	/** Checks inside the pause that got a venue price. */
	checks: number;
	/** The oldest the Pyth price was at a check. */
	maxRefAgeSecs: number | null;
	/** Checks at which the guard would have deferred, and why. */
	wouldDefer: number;
	byReason: Record<number, number>;
	/** The price the pause froze: Pyth's last before it. */
	frozen: PricePoint | null;
	/** Pyth's first fresh price after the pause; null while it lasts. */
	reopen: PricePoint | null;
	/** Hourly premiums against the reopen price, as in the backtest. */
	result: WeekendResult | null;
	/** The same pool-to-Pyth gap on the five weekdays before, while Pyth was fresh. */
	weekdayMedianAbsGapBps: number | null;
	weekdayChecks: number;
};

export function liveWeekend(all: ShadowCheck[], w: WeekendWindow, symbol: string, freshSecs = 120): LiveWeekend {
	const mine = all.filter((c) => c.symbol === symbol).sort((a, b) => a.ts - b.ts);
	const inside = mine.filter((c) => c.ts >= w.closeTs && c.ts < w.reopenTs && c.venuePrice !== null);
	const judged = inside.filter((c) => c.reason !== null);
	const byReason: Record<number, number> = {};
	for (const c of judged) if (c.reason !== 0) byReason[c.reason as number] = (byReason[c.reason as number] ?? 0) + 1;

	const firstStale = inside.find((c) => c.refPrice !== null && c.refAgeSecs !== null && c.refAgeSecs > freshSecs);
	const frozen = firstStale ? { ts: firstStale.ts - (firstStale.refAgeSecs as number), price: firstStale.refPrice as number } : null;
	// Pyth comes back at about Sunday 20:00 ET; a fresh price from earlier in
	// the pause would be a feed that never stopped, which is not this window.
	const back = mine.find((c) => c.ts >= w.reopenTs - 1800 && c.refPrice !== null && c.refAgeSecs !== null && c.refAgeSecs <= freshSecs);
	const reopen = back ? { ts: back.ts - (back.refAgeSecs as number), price: back.refPrice as number } : null;

	const hours = new Map<number, number[]>();
	for (const c of inside) {
		const h = Math.floor(c.ts / 3600) * 3600;
		hours.set(h, [...(hours.get(h) ?? []), c.venuePrice as number]);
	}
	const candles: Candle[] = [...hours.entries()].map(([ts, prices]) => ({ ts, close: median(prices) as number, volumeUsd: prices.length }));

	const weekday = mine.filter((c) => c.ts >= w.closeTs - 5 * 86_400 && c.ts < w.closeTs && c.refAgeSecs !== null && c.refAgeSecs <= freshSecs && c.divergenceBps !== null);
	return {
		symbol,
		checks: inside.length,
		maxRefAgeSecs: inside.reduce<number | null>((m, c) => (c.refAgeSecs === null ? m : Math.max(m ?? 0, c.refAgeSecs)), null),
		wouldDefer: judged.filter((c) => c.reason !== 0).length,
		byReason,
		frozen,
		reopen,
		result: frozen && reopen ? analyzeWeekend(w, frozen, reopen, candles, () => 1) : null,
		weekdayMedianAbsGapBps: median(weekday.map((c) => Math.abs(c.divergenceBps as number))),
		weekdayChecks: weekday.length,
	};
}

/** Premium of each check so far against the frozen price, for a report while
 *  the pause lasts and no reopen price exists yet. */
export const againstFrozen = (w: LiveWeekend, all: ShadowCheck[], window: WeekendWindow) =>
	w.frozen === null ? [] : all.filter((c) => c.symbol === w.symbol && c.ts >= window.closeTs && c.ts < window.reopenTs && c.venuePrice !== null).map((c) => bps(c.venuePrice as number, (w.frozen as PricePoint).price));
