import { test } from "node:test";
import assert from "node:assert/strict";
import { weekendWindows, bps } from "./backtest";
import { liveWeekend, againstFrozen, type ShadowCheck } from "./weekendLive";

// The weekend of Friday 2026-09-18: Pyth silent from 20:00 ET that evening
// (2026-09-19T00:00Z, EDT) to Sunday 20:00 ET (2026-09-21T00:00Z).
const [w] = weekendWindows(Date.parse("2026-09-18T12:00:00Z") / 1000, Date.parse("2026-09-22T00:00:00Z") / 1000);
const check = (ts: number, venuePrice: number, refPrice: number, refAgeSecs: number, divergenceBps: number, reason: number): ShadowCheck => ({ ts, symbol: "TSLAx", venuePrice, refPrice, refAgeSecs, divergenceBps, reason });

// Weekday: fresh, 10 and 20 bps apart. Pause: hourly, pool at 101 against a
// frozen 100 that ages. Sunday 20:05 ET: Pyth is back at 102.
const weekday = [check(w.closeTs - 8 * 3600, 100.1, 100, 3, 10, 0), check(w.closeTs - 4 * 3600, 99.8, 100, 2, -20, 0)];
const pause = Array.from({ length: 47 }, (_, k) => {
	const ts = w.closeTs + (k + 1) * 3600;
	return check(ts, 101, 100, ts - (w.closeTs - 1), 100, 1);
});
const back = check(w.reopenTs + 300, 102.2, 102, 5, 20, 0);

test("the window is the one the backtest uses", () => {
	assert.equal(new Date(w.closeTs * 1000).toISOString(), "2026-09-19T00:00:00.000Z");
	assert.equal(new Date(w.reopenTs * 1000).toISOString(), "2026-09-21T00:00:00.000Z");
});

test("a finished weekend is measured against Pyth's first price back, hour by hour", () => {
	const r = liveWeekend([...weekday, ...pause, back], w, "TSLAx");
	assert.equal(r.checks, 47);
	assert.equal(r.wouldDefer, 47);
	assert.deepEqual(r.byReason, { 1: 47 });
	assert.deepEqual(r.frozen, { ts: w.closeTs - 1, price: 100 });
	assert.deepEqual(r.reopen, { ts: w.reopenTs + 295, price: 102 });
	assert.equal(r.result?.tradedHours, 47);
	assert.ok(Math.abs((r.result?.medianPremiumBps ?? 0) - bps(101, 102)) < 1e-9);
	assert.equal(r.weekdayMedianAbsGapBps, 15);
	assert.equal(r.weekdayChecks, 2);
});

test("while the pause lasts there is no reopen price, and no premium is invented", () => {
	const r = liveWeekend([...weekday, ...pause.slice(0, 10)], w, "TSLAx");
	assert.equal(r.reopen, null);
	assert.equal(r.result, null);
	assert.equal(r.maxRefAgeSecs, 10 * 3600 + 1);
	assert.deepEqual(againstFrozen(r, pause.slice(0, 10), w).map((x) => Math.round(x)), Array(10).fill(100));
});

test("several checks in one hour count as one hour, at their median", () => {
	const ts = w.closeTs + 2 * 3600;
	const busy = [check(ts + 60, 101, 100, 7000, 100, 1), check(ts + 600, 103, 100, 7600, 300, 1), check(ts + 1200, 102, 100, 8200, 200, 1)];
	const r = liveWeekend([...busy, back], w, "TSLAx");
	assert.equal(r.result?.tradedHours, 1);
	assert.ok(Math.abs((r.result?.medianPremiumBps ?? 0) - bps(102, 102)) < 1e-9);
});
