// The latest weekend as the live mainnet check saw it, written by
// apps/keeper/scripts/weekend-live.ts into deploy/weekend-live-<friday>.json.
// Kept apart from the eight-weekend backtest on purpose: that table is built
// from pool trades, this from Jupiter quotes the keeper took every five
// minutes, and one table would blur two sources.

type Premium = { ts: number; bps: number };

export type LiveWeekendFile = {
	window: { friday: string; closeTs: number; reopenTs: number };
	measuredAt: string;
	symbols: {
		symbol: string;
		checks: number;
		maxRefAgeSecs: number;
		wouldDefer: number;
		weekdayMedianAbsGapBps: number | null;
		result: {
			tradedHours: number;
			hoursBeyondLimit: number;
			timerPremiumBps: number | null;
			reopenMoveBps: number | null;
			premiums: Premium[];
		} | null;
	}[];
};

export type LiveWeekendSymbol = {
	symbol: string;
	checks: number;
	wouldDefer: number;
	maxAgeHours: number;
	/** Median distance, either direction, from Pyth's first price back. */
	weekendGapBps: number | null;
	weekdayGapBps: number | null;
	tradedHours: number;
	hoursBeyondLimit: number;
	/** A buy at Saturday 12:00 ET against the reopen: negative is cheaper. */
	saturdayNoonBps: number | null;
};

export type LiveWeekendView = { friday: string; pauseHours: number; measuredAt: string; symbols: LiveWeekendSymbol[] };

/** Nearest-rank median, the definition the keeper's backtest and the
 *  weekend-live script use: the lower middle value when the count is even.
 *  Averaging the two instead gave 21.8 bps where the script printed 21.6, and
 *  one product quoting two medians for one weekend is a contradiction. */
const median = (xs: number[]): number | null => {
	if (xs.length === 0) return null;
	const s = [...xs].sort((a, b) => a - b);
	return s[Math.min(s.length - 1, Math.max(0, Math.ceil(s.length / 2) - 1))];
};

export function liveWeekendView(file: LiveWeekendFile): LiveWeekendView {
	return {
		friday: file.window.friday,
		pauseHours: Math.round((file.window.reopenTs - file.window.closeTs) / 3600),
		measuredAt: file.measuredAt,
		symbols: file.symbols.map((s) => ({
			symbol: s.symbol,
			checks: s.checks,
			wouldDefer: s.wouldDefer,
			maxAgeHours: s.maxRefAgeSecs / 3600,
			weekendGapBps: median((s.result?.premiums ?? []).map((p) => Math.abs(p.bps))),
			weekdayGapBps: s.weekdayMedianAbsGapBps,
			tradedHours: s.result?.tradedHours ?? 0,
			hoursBeyondLimit: s.result?.hoursBeyondLimit ?? 0,
			saturdayNoonBps: s.result?.timerPremiumBps ?? null,
		})),
	};
}
