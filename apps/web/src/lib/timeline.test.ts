import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTimeline, chartRows, sampleGrid, samplesFromReferences, SAMPLE_STEPS, type PriceSample } from "./timeline";
import { buildScorecard, type HistoryRow } from "./scorecard";

const STALE = 1;
const DIVERGENCE = 4;

const near = (actual: number | null, expected: number) => assert.ok(actual !== null && Math.abs(actual - expected) < 1e-9, `expected ${expected}, got ${actual}`);

let id = 0;
const row = (ts: number, kind: HistoryRow["kind"], extra: Partial<HistoryRow> = {}): HistoryRow => ({
	id: ++id,
	ts,
	kind,
	reason: 0,
	detail: null,
	signature: null,
	usdcIn: null,
	legs: null,
	forced: false,
	avoidedUsdc: null,
	...extra,
});
/** One fill leg: `usdc` spent on `units` whole shares, reference price `ref`. */
const leg = (mint: string, usdc: number, units: number, ref: number) => ({
	mint,
	usdcIn: String(usdc * 1e6),
	units: String(units * 1e6),
	referencePrice: String(Math.round(ref * 1e5)),
	venuePrice: String(Math.round(ref * 1e5)),
	exponent: -5,
});
const executed = (ts: number, legs: unknown[], usdcIn: number | null = null) => row(ts, "executed", { legs: legs as HistoryRow["legs"], usdcIn });
const deferred = (ts: number, reason: number, forced = false) => row(ts, "deferred", { reason, forced });
const sample = (ts: number, prices: Record<string, number> | null): PriceSample => ({ ts, prices });

test("the grid stays on multiples of its step, inside the window, and under the cap", () => {
	const from = 1_789_300_123;
	const to = from + 5 * 86_400;
	const grid = sampleGrid(from, to, 60);
	const step = grid[1] - grid[0];
	assert.ok(SAMPLE_STEPS.includes(step));
	assert.ok(grid.length <= 60);
	assert.ok(grid.every((t) => t % step === 0));
	assert.ok(grid[0] > from && grid[0] - from <= step);
	assert.ok(grid[grid.length - 1] <= to - 300);
	// Five days in 60 points needs the 3-hour step, not 1 hour (120 points).
	assert.equal(step, 3 * 3600);
});

test("a window shorter than the margin samples nothing", () => {
	assert.deepEqual(sampleGrid(1000, 1200), []);
});

test("value is units held times the sampled price, and invested steps at each fill", () => {
	const t = buildTimeline(
		[executed(100, [leg("A", 50, 0.5, 100), leg("B", 50, 1, 50)], 100), executed(400, [leg("A", 50, 0.25, 200), leg("B", 50, 0.5, 100)], 100)],
		[sample(200, { A: 110, B: 60 }), sample(300, { A: 120, B: 55 })],
	);
	assert.equal(t.invested, 200);
	const at = (ts: number) => t.points.filter((p) => p.ts === ts);
	near(at(100)[0].value, 0.5 * 100 + 1 * 50);
	near(at(200)[0].value, 0.5 * 110 + 1 * 60);
	near(at(300)[0].value, 0.5 * 120 + 1 * 55);
	// At the second fill: the old holdings at the fill's prices, then the new ones.
	const [before, after] = at(400);
	assert.equal(before.invested, 100);
	assert.equal(before.fill, false);
	near(before.value, 0.5 * 200 + 1 * 100);
	assert.equal(after.invested, 200);
	assert.equal(after.fill, true);
	near(after.value, 0.75 * 200 + 1.5 * 100);
});

test("a moment with no Pyth price keeps the last one and says so", () => {
	const t = buildTimeline([executed(100, [leg("A", 100, 1, 100)], 100)], [sample(200, null), sample(300, { A: 90 })]);
	const [first, silent, back] = t.points;
	assert.equal(first.stale, false);
	assert.equal(silent.stale, true);
	near(silent.value, 100);
	assert.equal(back.stale, false);
	near(back.value, 90);
});

test("retries of one held-back buy make one period, closed by the fill, judged by its opener", () => {
	const t = buildTimeline(
		[executed(100, [leg("A", 100, 1, 100)], 100), deferred(200, DIVERGENCE, true), deferred(250, DIVERGENCE), deferred(300, DIVERGENCE), executed(400, [leg("A", 100, 1, 100)], 100), deferred(500, STALE)],
		[],
	);
	assert.deepEqual(t.heldBack, [
		{ from: 200, to: 400, reason: DIVERGENCE, forced: true, attempts: 3 },
		{ from: 500, to: null, reason: STALE, forced: false, attempts: 1 },
	]);
});

test("the market deferring for its own reason ends the demo control's period", () => {
	// The demo plan on 2026-09-13: a scenario sweep's last test deferral, then the weekend.
	const t = buildTimeline([executed(100, [leg("A", 100, 1, 100)], 100), deferred(200, 6, true), deferred(300, STALE), deferred(400, STALE), executed(500, [leg("A", 100, 1, 100)], 100)], []);
	assert.deepEqual(t.heldBack, [
		{ from: 200, to: 300, reason: 6, forced: true, attempts: 1 },
		{ from: 300, to: 500, reason: STALE, forced: false, attempts: 2 },
	]);
});

test("the chart counts the same held-back buys as the scorecard", () => {
	const rows = [
		deferred(50, STALE),
		executed(100, [leg("A", 100, 1, 100)], 100),
		deferred(200, DIVERGENCE, true),
		deferred(210, DIVERGENCE),
		deferred(220, 6, true),
		deferred(300, STALE),
		executed(500, [leg("A", 100, 1, 100)], 100),
		deferred(600, DIVERGENCE),
		deferred(700, STALE, true),
		executed(800, [leg("A", 100, 1, 100)], 100),
	];
	const organic = buildTimeline(rows, []).heldBack.filter((h) => !h.forced).length;
	assert.equal(organic, buildScorecard(rows, {}).heldBackBuys);
	assert.equal(organic, 3);
});

test("a plan held back before its first buy starts the chart at that deferral", () => {
	const t = buildTimeline([deferred(100, STALE), deferred(160, STALE), executed(300, [leg("A", 100, 1, 100)], 100)], [sample(120, null), sample(200, { A: 100 })]);
	assert.equal(t.points[0].ts, 100);
	assert.equal(t.points[0].invested, 0);
	near(t.points[0].value, 0);
	assert.deepEqual(t.heldBack, [{ from: 100, to: 300, reason: STALE, forced: false, attempts: 2 }]);
});

test("skips and errors neither open a period nor move money", () => {
	const t = buildTimeline([executed(100, [leg("A", 100, 1, 100)], 100), row(200, "skipped", { reason: 3 }), row(300, "error")], []);
	assert.deepEqual(t.heldBack, []);
	assert.equal(t.invested, 100);
	assert.equal(t.points.length, 1);
});

test("invested falls back to the legs when the row has no total, and unreadable legs are ignored", () => {
	// Anchor BNs serialize to hex without a prefix; rows from before the keeper
	// normalized them must not turn the holdings into NaN.
	const bad = { ...leg("A", 40, 1, 100), units: "1a2b" };
	const t = buildTimeline([executed(100, [leg("A", 60, 0.6, 100), bad])], []);
	near(t.invested, 100);
	near(t.points[0].value, 0.6 * 100);
});

const FEED_A = "aa";
const FEED_B = "bb";
const MINT_BY_FEED = { [FEED_A]: "A", [FEED_B]: "B" };
const ref = (ts: number, feedId: string, price: number | null, publishTime: number | null = ts) => ({ ts, feedId, price, publishTime });

test("each grid moment takes the latest stored prices at or before it, keyed by mint", () => {
	const rows = [ref(900, FEED_A, 10), ref(900, `0x${FEED_B}`, 20), ref(1800, FEED_A, 11), ref(1800, FEED_B, 21)];
	assert.deepEqual(samplesFromReferences(rows, [1000, 1800, 2500], MINT_BY_FEED), [
		{ ts: 1000, prices: { A: 10, B: 20 } },
		{ ts: 1800, prices: { A: 11, B: 21 } },
		{ ts: 2500, prices: { A: 11, B: 21 } },
	]);
});

test("a weekend price, or a moment Hermes had nothing for, is a silence", () => {
	const friday = 100_000;
	const rows = [ref(friday + 7200, FEED_A, 10, friday), ref(friday + 7200, FEED_B, 20, friday), ref(friday + 10_800, FEED_A, null, null), ref(friday + 10_800, FEED_B, null, null)];
	assert.deepEqual(samplesFromReferences(rows, [friday + 7200, friday + 10_800], MINT_BY_FEED), [
		{ ts: friday + 7200, prices: null },
		{ ts: friday + 10_800, prices: null },
	]);
});

test("a gap in the recording is left out, not called silent", () => {
	const rows = [ref(1000, FEED_A, 10), ref(1000, FEED_B, 20)];
	assert.deepEqual(samplesFromReferences(rows, [500, 1500, 1000 + 3601], MINT_BY_FEED), [{ ts: 1500, prices: { A: 10, B: 20 } }]);
});

test("the frozen line spans the silent stretch and joins the priced points beside it", () => {
	const rows = chartRows([
		{ ts: 1, invested: 1, value: 10, stale: false, fill: true },
		{ ts: 2, invested: 1, value: 10, stale: true, fill: false },
		{ ts: 3, invested: 1, value: 10, stale: true, fill: false },
		{ ts: 4, invested: 1, value: 12, stale: false, fill: false },
		{ ts: 5, invested: 1, value: 13, stale: false, fill: false },
	]);
	assert.deepEqual(
		rows.map((r) => [r.live, r.frozen]),
		[
			[10, 10],
			[null, 10],
			[null, 10],
			[12, 12],
			[13, null],
		],
	);
});
