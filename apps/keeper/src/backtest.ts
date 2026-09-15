// Weekend backtest: what a timer-based buy of an xStock paid on the weekends
// Pyth publishes nothing for US equities (Friday 20:00 ET to Sunday 20:00 ET),
// measured against the first price Pyth published when it came back. A
// positive premium means the blind buy paid more than that price.
//
// Pool prices come from GeckoTerminal's hourly candles, which quote per raw
// token: on 2026-09-14 QQQx closed 33 bps over Pyth, 27 of them its share
// multiplier. So every close is divided by the multiplier in effect at the
// time. Pure, so it is unit tested; scripts/backtest-weekends.ts does the I/O.

/** One hourly pool candle. `ts` is the start of the hour; `close` per raw token. */
export type Candle = { ts: number; close: number; volumeUsd: number };

/** A Pyth price, human units. */
export type PricePoint = { ts: number; price: number };

const NY = "America/New_York";

/** New York's offset from UTC at an instant, in minutes (-240 in summer). */
export function nyOffsetMinutes(utcMs: number): number {
	const name = new Intl.DateTimeFormat("en-US", { timeZone: NY, timeZoneName: "shortOffset" }).formatToParts(new Date(utcMs)).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
	const m = name.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
	return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0;
}

/** Unix seconds for a New York wall-clock time. Day overflow rolls into the
 *  next month, as Date.UTC does. */
export function nyTime(year: number, month: number, day: number, hour: number, minute = 0): number {
	const wall = Date.UTC(year, month - 1, day, hour, minute);
	const first = wall - nyOffsetMinutes(wall) * 60_000;
	return Math.floor((wall - nyOffsetMinutes(first) * 60_000) / 1000);
}

/** New York calendar date and weekday (0 = Sunday) of an instant. */
export function nyDate(ts: number): { year: number; month: number; day: number; weekday: number } {
	const parts = new Intl.DateTimeFormat("en-US", { timeZone: NY, year: "numeric", month: "numeric", day: "numeric", weekday: "short" }).formatToParts(new Date(ts * 1000));
	const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
	return { year: Number(get("year")), month: Number(get("month")), day: Number(get("day")), weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")) };
}

export type WeekendWindow = {
	/** The Friday, as a New York date. */
	friday: string;
	/** Friday 20:00 ET, when Pyth stops publishing. */
	closeTs: number;
	/** Sunday 20:00 ET, when it normally starts again. */
	reopenTs: number;
};

/** Every weekend whose pause lies wholly inside [fromTs, toTs]. */
export function weekendWindows(fromTs: number, toTs: number): WeekendWindow[] {
	const out: WeekendWindow[] = [];
	const start = nyDate(fromTs);
	for (let offset = 0; ; offset++) {
		const noon = nyTime(start.year, start.month, start.day + offset, 12);
		if (noon > toTs) break;
		const d = nyDate(noon);
		if (d.weekday !== 5) continue;
		const w = {
			friday: `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`,
			closeTs: nyTime(d.year, d.month, d.day, 20),
			reopenTs: nyTime(d.year, d.month, d.day + 2, 20),
		};
		if (w.closeTs >= fromTs && w.reopenTs <= toTs) out.push(w);
	}
	return out;
}

export const bps = (price: number, reference: number) => ((price - reference) / reference) * 10_000;

function median(xs: number[]): number | null {
	if (xs.length === 0) return null;
	const s = [...xs].sort((a, b) => a - b);
	const m = s.length >> 1;
	return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Nearest-rank percentile, p in (0, 100]. */
export function percentile(xs: number[], p: number): number | null {
	if (xs.length === 0) return null;
	const s = [...xs].sort((a, b) => a - b);
	return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
}

export type WeekendResult = {
	friday: string;
	/** Last Pyth price before the pause. */
	close: PricePoint;
	/** First Pyth price after it. */
	reopen: PricePoint;
	/** Hours inside the pause in which the pool traded. */
	tradedHours: number;
	volumeUsd: number;
	medianPremiumBps: number | null;
	/** The most a blind buy paid over the reopen price. */
	maxPremiumBps: number | null;
	minPremiumBps: number | null;
	/** Traded hours whose |premium| exceeds the guard's divergence limit. */
	hoursBeyondLimit: number;
	/** A weekly timer that buys at Saturday 12:00 ET: the first traded hour from then. */
	timerPremiumBps: number | null;
	/** Where Pyth reopened, against where it closed. */
	reopenMoveBps: number;
	premiums: { ts: number; bps: number }[];
};

/** Premiums of every traded hour that starts after Pyth's last price and ends
 *  before its first price back. */
export function analyzeWeekend(
	w: WeekendWindow,
	close: PricePoint,
	reopen: PricePoint,
	candles: Candle[],
	multiplierAt: (ts: number) => number,
	limitBps = 150,
): WeekendResult {
	const inside = candles.filter((c) => c.volumeUsd > 0 && c.ts >= close.ts && c.ts + 3600 <= reopen.ts).sort((a, b) => a.ts - b.ts);
	const premiums = inside.map((c) => ({ ts: c.ts, bps: bps(c.close / multiplierAt(c.ts), reopen.price) }));
	const values = premiums.map((p) => p.bps);
	const saturday = nyDate(w.closeTs + 86_400);
	const timerTs = nyTime(saturday.year, saturday.month, saturday.day, 12);
	const timer = premiums.find((p) => p.ts >= timerTs);
	return {
		friday: w.friday,
		close,
		reopen,
		tradedHours: inside.length,
		volumeUsd: inside.reduce((s, c) => s + c.volumeUsd, 0),
		medianPremiumBps: median(values),
		maxPremiumBps: values.length ? Math.max(...values) : null,
		minPremiumBps: values.length ? Math.min(...values) : null,
		hoursBeyondLimit: values.filter((v) => Math.abs(v) > limitBps).length,
		timerPremiumBps: timer ? timer.bps : null,
		reopenMoveBps: bps(reopen.price, close.price),
		premiums,
	};
}

export type BacktestSummary = {
	weekends: number;
	tradedHours: number;
	medianAbsPremiumBps: number | null;
	p90AbsPremiumBps: number | null;
	worst: { bps: number; ts: number } | null;
	/** Of traded hours, the share beyond the divergence limit. */
	shareBeyondLimit: number | null;
	timerMeanPremiumBps: number | null;
	timerOverpaidWeekends: number;
	timerWeekends: number;
	/** The same pool-to-Pyth gap on weekdays, while Pyth is fresh. */
	baselineMedianAbsGapBps: number | null;
	baselineSamples: number;
};

export function summarizeBacktest(results: WeekendResult[], baselineGapsBps: number[]): BacktestSummary {
	const all = results.flatMap((r) => r.premiums);
	const abs = all.map((p) => Math.abs(p.bps));
	const worst = all.reduce<{ bps: number; ts: number } | null>((w, p) => (w === null || p.bps > w.bps ? p : w), null);
	const timers = results.map((r) => r.timerPremiumBps).filter((v): v is number => v !== null);
	return {
		weekends: results.length,
		tradedHours: all.length,
		medianAbsPremiumBps: median(abs),
		p90AbsPremiumBps: percentile(abs, 90),
		worst,
		shareBeyondLimit: all.length ? results.reduce((s, r) => s + r.hoursBeyondLimit, 0) / all.length : null,
		timerMeanPremiumBps: timers.length ? timers.reduce((s, v) => s + v, 0) / timers.length : null,
		timerOverpaidWeekends: timers.filter((v) => v > 0).length,
		timerWeekends: timers.length,
		baselineMedianAbsGapBps: median(baselineGapsBps.map(Math.abs)),
		baselineSamples: baselineGapsBps.length,
	};
}
