import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeWeekend, nyDate, nyTime, percentile, summarizeBacktest, weekendWindows, type Candle } from "./backtest";

test("New York wall-clock times convert across daylight saving", () => {
	// Friday 2026-09-11 20:00 EDT is Saturday 00:00 UTC.
	assert.equal(nyTime(2026, 9, 11, 20), Date.UTC(2026, 8, 12, 0) / 1000);
	// Friday 2026-01-09 20:00 EST is Saturday 01:00 UTC.
	assert.equal(nyTime(2026, 1, 9, 20), Date.UTC(2026, 0, 10, 1) / 1000);
	assert.deepEqual(nyDate(Date.UTC(2026, 8, 12, 0) / 1000 - 1), { year: 2026, month: 9, day: 11, weekday: 5 });
});

test("weekend windows run Friday 20:00 to Sunday 20:00 ET, across a month end", () => {
	const ws = weekendWindows(Date.UTC(2026, 6, 29) / 1000, Date.UTC(2026, 7, 5) / 1000);
	assert.deepEqual(ws, [{ friday: "2026-07-31", closeTs: Date.UTC(2026, 7, 1, 0) / 1000, reopenTs: Date.UTC(2026, 7, 3, 0) / 1000 }]);
	// A window cut off by either end of the range is left out.
	assert.equal(weekendWindows(Date.UTC(2026, 7, 1, 12) / 1000, Date.UTC(2026, 7, 5) / 1000).length, 0);
	assert.equal(weekendWindows(Date.UTC(2026, 6, 29) / 1000, Date.UTC(2026, 7, 2) / 1000).length, 0);
});

const [w] = weekendWindows(Date.UTC(2026, 8, 10) / 1000, Date.UTC(2026, 8, 15) / 1000);
const close = { ts: w.closeTs - 1, price: 100 };
const reopen = { ts: w.reopenTs + 5, price: 102 };
const saturdayNoon = nyTime(2026, 9, 12, 12);
const candles: Candle[] = [
	{ ts: w.closeTs - 3600, close: 90, volumeUsd: 100 }, // before the pause
	{ ts: w.closeTs, close: 101, volumeUsd: 10 },
	{ ts: saturdayNoon, close: 104, volumeUsd: 5 },
	{ ts: saturdayNoon + 7200, close: 99, volumeUsd: 0 }, // no trade
	{ ts: w.reopenTs - 1800, close: 120, volumeUsd: 100 }, // ends after the reopen
];

test("a weekend is scored against the reopen price, traded hours inside the pause only", () => {
	const r = analyzeWeekend(w, close, reopen, candles, () => 1);
	assert.equal(w.friday, "2026-09-11");
	assert.equal(r.tradedHours, 2);
	assert.equal(r.volumeUsd, 15);
	assert.ok(Math.abs(r.maxPremiumBps! - 196.08) < 0.01);
	assert.ok(Math.abs(r.minPremiumBps! - -98.04) < 0.01);
	assert.ok(Math.abs(r.medianPremiumBps! - 49.02) < 0.01);
	assert.equal(r.hoursBeyondLimit, 1);
	assert.ok(Math.abs(r.timerPremiumBps! - 196.08) < 0.01);
	assert.equal(r.reopenMoveBps, 200);
});

test("pool closes are divided by the share multiplier in effect", () => {
	const r = analyzeWeekend(w, close, reopen, [{ ts: w.closeTs, close: 204, volumeUsd: 1 }], (ts) => (ts >= w.closeTs ? 2 : 1));
	assert.equal(r.maxPremiumBps, 0);
});

test("the summary pools every weekend and keeps the weekday baseline apart", () => {
	const a = analyzeWeekend(w, close, reopen, candles, () => 1);
	const b = analyzeWeekend(w, close, { ...reopen, price: 101 }, [{ ts: w.closeTs, close: 100, volumeUsd: 3 }], () => 1);
	const s = summarizeBacktest([a, b], [-4, 6, 2]);
	assert.equal(s.weekends, 2);
	assert.equal(s.tradedHours, 3);
	assert.equal(s.worst?.ts, saturdayNoon);
	assert.ok(Math.abs(s.shareBeyondLimit! - 1 / 3) < 1e-9);
	assert.equal(s.timerWeekends, 1);
	assert.equal(s.timerOverpaidWeekends, 1);
	assert.equal(s.baselineMedianAbsGapBps, 4);
	assert.equal(s.baselineSamples, 3);
	assert.equal(percentile([5, 1, 3, 2, 4], 90), 5);
	assert.equal(summarizeBacktest([], []).medianAbsPremiumBps, null);
});
