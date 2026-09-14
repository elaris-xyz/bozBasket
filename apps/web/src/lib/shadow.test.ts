import { test } from "node:test";
import assert from "node:assert/strict";
import { REASON } from "@bozbasket/shared";
import { bucketSeries, latestBySymbol, summarize, type ShadowPoint } from "./shadow";

const pt = (o: Partial<ShadowPoint>): ShadowPoint => ({
	ts: 1_000,
	symbol: "TSLAx",
	venuePrice: 360,
	refPrice: 360,
	refAgeSecs: 5,
	confBps: 1,
	divergenceBps: 0,
	priceImpactBps: 1,
	reason: REASON.OK,
	session: "outside regular hours",
	error: null,
	...o,
});

test("the summary counts verdicts and leaves failed checks out", () => {
	const s = summarize([
		pt({ ts: 300 }),
		pt({ ts: 100, reason: REASON.REFERENCE_STALE }),
		pt({ ts: 200, reason: REASON.DIVERGENCE, divergenceBps: 180 }),
		pt({ ts: 400, reason: null, divergenceBps: null, error: "Jupiter quote 503" }),
		pt({ ts: 500, reason: REASON.LOW_LIQUIDITY, divergenceBps: null, error: "not tradable" }),
	]);
	assert.equal(s.since, 100);
	assert.equal(s.checks, 4);
	assert.equal(s.wouldBuy, 1);
	assert.deepEqual(s.byReason, { [REASON.REFERENCE_STALE]: 1, [REASON.DIVERGENCE]: 1, [REASON.LOW_LIQUIDITY]: 1 });
});

test("the worst premium is the highest gap above Pyth, with its verdict", () => {
	const s = summarize([pt({ divergenceBps: 12 }), pt({ ts: 2_000, symbol: "QQQx", divergenceBps: 240, reason: REASON.REFERENCE_STALE }), pt({ divergenceBps: -300 })]);
	assert.deepEqual(s.worstPremium, { bps: 240, ts: 2_000, symbol: "QQQx", reason: REASON.REFERENCE_STALE });
});

test("no worst premium when no buy would have paid more than Pyth", () => {
	assert.equal(summarize([pt({ divergenceBps: -8 }), pt({ divergenceBps: 0 })]).worstPremium, null);
	assert.equal(summarize([]).worstPremium, null);
});

test("median gaps split fresh and stale references and use absolute values", () => {
	const s = summarize([
		pt({ divergenceBps: -10 }),
		pt({ divergenceBps: 20 }),
		pt({ divergenceBps: 30 }),
		pt({ divergenceBps: -90, reason: REASON.REFERENCE_STALE }),
		pt({ divergenceBps: 110, reason: REASON.REFERENCE_STALE }),
	]);
	assert.deepEqual(s.medianGapBps, { fresh: 20, stale: 100 });
	assert.deepEqual(summarize([pt({ divergenceBps: 5 })]).medianGapBps, { fresh: 5, stale: null });
});

test("the series keeps each symbol's last gap per bucket, oldest bucket first", () => {
	const rows = bucketSeries(
		[
			pt({ ts: 1_800, divergenceBps: 5 }),
			pt({ ts: 900, divergenceBps: 1.26 }),
			pt({ ts: 1_000, divergenceBps: 2 }),
			pt({ ts: 950, symbol: "QQQx", divergenceBps: -3 }),
			pt({ ts: 1_850, symbol: "QQQx", divergenceBps: null, reason: null }),
		],
		["TSLAx", "QQQx"],
		900,
	);
	assert.deepEqual(rows, [
		{ ts: 900, TSLAx: 2, QQQx: -3 },
		{ ts: 1_800, TSLAx: 5, QQQx: null },
	]);
});

test("latest picks the newest row per symbol", () => {
	const latest = latestBySymbol([pt({ ts: 5 }), pt({ ts: 9, divergenceBps: 7 }), pt({ ts: 3, symbol: "QQQx" })]);
	assert.equal(latest.TSLAx.divergenceBps, 7);
	assert.equal(latest.QQQx.ts, 3);
});
