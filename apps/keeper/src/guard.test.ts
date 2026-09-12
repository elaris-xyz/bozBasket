import { test } from "node:test";
import assert from "node:assert/strict";
import { checkLeg, legAmounts, REASON } from "./guard";

const t = { maxStalenessSecs: 120, maxConfBps: 50, maxDivergenceBps: 150, minLiquidityUsdc: 500_000_000n };
const now = 1_789_400_000;
const ref = { feedId: "ab", price: 36_500_000_000n, conf: 20_000_000n, expo: -8, publishTime: now - 10 };
const venue = { price: 36_573_000_000n, expo: -8, liquidityUsdc: 50_000_000_000n };

test("fresh, tight, aligned, deep: OK", () => {
	const v = checkLeg(now, ref, venue, 50_000_000n, t);
	assert.equal(v.reason, REASON.OK);
	assert.equal(v.ageSecs, 10);
	assert.equal(v.confBps, 5);
	assert.equal(v.divergenceBps, 20);
});

test("stale wins over everything else", () => {
	const v = checkLeg(now, { ...ref, publishTime: now - 3600 }, venue, 1n, t);
	assert.equal(v.reason, REASON.REFERENCE_STALE);
});

test("confidence, divergence and liquidity in order", () => {
	assert.equal(checkLeg(now, { ...ref, conf: 500_000_000n }, venue, 1n, t).reason, REASON.CONFIDENCE_TOO_WIDE);
	assert.equal(checkLeg(now, ref, { ...venue, price: 38_500_000_000n }, 1n, t).reason, REASON.DIVERGENCE);
	assert.equal(checkLeg(now, ref, { ...venue, liquidityUsdc: 10_000_000n }, 50_000_000n, t).reason, REASON.LOW_LIQUIDITY);
});

test("leg amounts sum exactly and the last leg absorbs rounding", () => {
	const a = legAmounts(100_000_000n, [3333, 3333, 3334]);
	assert.deepEqual(a, [33_330_000n, 33_330_000n, 33_340_000n]);
	assert.equal(a.reduce((x, y) => x + y, 0n), 100_000_000n);
	assert.deepEqual(legAmounts(1n, [5000, 5000]), [0n, 1n]);
});
