// The weekend backtest, shaped for the landing page. The numbers come from
// deploy/weekend-backtest.json, written by apps/keeper/scripts/backtest-weekends.ts
// from real pool candles and Pyth history. Pure, so it is unit tested.

type Point = { ts: number; price: number };

export type BacktestFile = {
	generatedAt: string;
	divergenceLimitBps: number;
	symbols: Record<
		string,
		{
			summary: {
				weekends: number;
				tradedHours: number;
				medianAbsPremiumBps: number | null;
				worst: { bps: number; ts: number } | null;
				shareBeyondLimit: number | null;
				timerMeanPremiumBps: number | null;
				timerOverpaidWeekends: number;
				timerWeekends: number;
				baselineMedianAbsGapBps: number | null;
			};
			weekends: {
				friday: string;
				close: Point;
				reopen: Point;
				minPremiumBps: number | null;
				reopenMoveBps: number | null;
				/** [ts, bps] per traded hour. */
				premiums: (number | null)[][];
			}[];
		}
	>;
};

export type SymbolView = {
	symbol: string;
	weekends: number;
	tradedHours: number;
	/** A weekend buy against the first Pyth price after the weekend. */
	weekendMedianGapBps: number | null;
	/** The pool against Pyth at the same moment, on weekdays. */
	weekdayMedianGapBps: number | null;
	worstOverpay: { bps: number; ts: number } | null;
	/** The most negative premium: the cheapest a blind buy came in. */
	bestUnderpayBps: number | null;
	shareBeyondLimit: number | null;
	timerMeanBps: number | null;
	timerOverpaid: number;
	timerWeekends: number;
	/** How far Friday's stale Pyth price was from where Pyth came back. */
	staleMoveMedianBps: number | null;
	staleMoveMaxBps: number | null;
};

export type BacktestView = {
	generatedAt: string;
	from: string | null;
	to: string | null;
	limitBps: number;
	symbols: SymbolView[];
	points: { ts: number; symbol: string; bps: number }[];
};

function median(xs: number[]): number | null {
	if (xs.length === 0) return null;
	const s = [...xs].sort((a, b) => a - b);
	const m = s.length >> 1;
	return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function backtestView(file: BacktestFile, maxPoints = 1200): BacktestView {
	const symbols = Object.entries(file.symbols).map(([symbol, r]): SymbolView => {
		const moves = r.weekends.map((w) => w.reopenMoveBps).filter((v): v is number => v !== null).map(Math.abs);
		const mins = r.weekends.map((w) => w.minPremiumBps).filter((v): v is number => v !== null);
		return {
			symbol,
			weekends: r.summary.weekends,
			tradedHours: r.summary.tradedHours,
			weekendMedianGapBps: r.summary.medianAbsPremiumBps,
			weekdayMedianGapBps: r.summary.baselineMedianAbsGapBps,
			worstOverpay: r.summary.worst,
			bestUnderpayBps: mins.length ? Math.min(...mins) : null,
			shareBeyondLimit: r.summary.shareBeyondLimit,
			timerMeanBps: r.summary.timerMeanPremiumBps,
			timerOverpaid: r.summary.timerOverpaidWeekends,
			timerWeekends: r.summary.timerWeekends,
			staleMoveMedianBps: median(moves),
			staleMoveMaxBps: moves.length ? Math.max(...moves) : null,
		};
	});

	const all = Object.entries(file.symbols).flatMap(([symbol, r]) =>
		r.weekends.flatMap((w) => w.premiums.flatMap(([ts, bps]) => (ts === null || bps === null ? [] : [{ ts, symbol, bps }]))),
	);
	// Keep every k-th point when there are too many to draw; the summary numbers
	// above are computed from all of them, never from the thinned set.
	const step = Math.max(1, Math.ceil(all.length / maxPoints));
	const points = all.filter((_, i) => i % step === 0);

	const fridays = Object.values(file.symbols)
		.flatMap((r) => r.weekends.map((w) => w.friday))
		.sort();
	return { generatedAt: file.generatedAt, from: fridays[0] ?? null, to: fridays[fridays.length - 1] ?? null, limitBps: file.divergenceLimitBps, symbols, points };
}
