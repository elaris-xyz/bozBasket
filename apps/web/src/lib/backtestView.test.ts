import { test } from "node:test";
import assert from "node:assert/strict";
import { backtestView, type BacktestFile } from "./backtestView";
import real from "../generated/weekend-backtest.json";

const weekend = (friday: string, minPremiumBps: number, reopenMoveBps: number, premiums: number[][]) => ({
	friday,
	close: { ts: 1, price: 100 },
	reopen: { ts: 2, price: 101 },
	minPremiumBps,
	reopenMoveBps,
	premiums,
});

const file: BacktestFile = {
	generatedAt: "2026-09-15T07:57:00.000Z",
	divergenceLimitBps: 150,
	symbols: {
		TSLAx: {
			summary: {
				weekends: 2,
				tradedHours: 3,
				medianAbsPremiumBps: 53.4,
				worst: { bps: 192.4, ts: 30 },
				shareBeyondLimit: 0.059,
				timerMeanPremiumBps: -26.7,
				timerOverpaidWeekends: 1,
				timerWeekends: 2,
				baselineMedianAbsGapBps: 13.3,
			},
			weekends: [
				weekend("2026-09-11", -29.2, -70.1, [
					[10, 5],
					[30, 192.4],
				]),
				weekend("2026-07-24", -195.8, 157.2, [[50, -195.8]]),
			],
		},
		QQQx: {
			summary: {
				weekends: 1,
				tradedHours: 1,
				medianAbsPremiumBps: 45,
				worst: null,
				shareBeyondLimit: 0,
				timerMeanPremiumBps: null,
				timerOverpaidWeekends: 0,
				timerWeekends: 0,
				baselineMedianAbsGapBps: 15.2,
			},
			weekends: [weekend("2026-08-07", -44, -6.8, [[20, -44]])],
		},
	},
};

test("each symbol keeps the script's summary and adds the stale-price move and the widest underpay", () => {
	const v = backtestView(file);
	const t = v.symbols.find((s) => s.symbol === "TSLAx")!;
	assert.equal(t.weekendMedianGapBps, 53.4);
	assert.equal(t.weekdayMedianGapBps, 13.3);
	assert.deepEqual(t.worstOverpay, { bps: 192.4, ts: 30 });
	assert.equal(t.bestUnderpayBps, -195.8);
	assert.equal(t.staleMoveMaxBps, 157.2);
	assert.ok(Math.abs(t.staleMoveMedianBps! - 113.65) < 1e-9);
	assert.equal(v.from, "2026-07-24");
	assert.equal(v.to, "2026-09-11");
	assert.equal(v.limitBps, 150);
});

test("every point is drawn unless there are too many, and thinning keeps an even spread", () => {
	assert.equal(backtestView(file).points.length, 4);
	const thin = backtestView(file, 2).points;
	assert.equal(thin.length, 2);
	assert.deepEqual(
		thin.map((p) => p.bps),
		[5, -195.8],
	);
});

test("the committed backtest reads without loss", () => {
	const v = backtestView(real as unknown as BacktestFile);
	assert.equal(v.symbols.length, 2);
	for (const s of v.symbols) {
		assert.ok(s.weekends >= 1 && s.tradedHours > 0, s.symbol);
		assert.ok(s.weekendMedianGapBps !== null && s.weekdayMedianGapBps !== null, s.symbol);
	}
	assert.equal(
		v.points.length,
		v.symbols.reduce((n, s) => n + s.tradedHours, 0),
	);
});
