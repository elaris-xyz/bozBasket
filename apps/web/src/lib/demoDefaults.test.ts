import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_THRESHOLDS } from "@bozbasket/shared";
import { demoDrift, shouldAutoRestore } from "./demoDefaults";

const cfg = (o = {}) => ({ ...DEFAULT_THRESHOLDS, minLiquidityUsdc: { toString: () => String(DEFAULT_THRESHOLDS.minLiquidityUsdc) }, ...o });
const mk = (symbol: string, priceOverride = 0, liquidityUsdc = 50_000_000_000) => ({ symbol, priceOverride, liquidityUsdc });
const now = 1_789_420_000;

test("the demo as restore leaves it has no drift, even after fills draw depth down", () => {
	// Depths read on devnet on 2026-09-14, after the day's executions.
	assert.deepEqual(demoDrift(cfg(), [mk("mTSLA", 0, 49_790_000_000), mk("mQQQ", 0, 49_920_000_000), mk("mVOO")]), []);
});

test("every demo control shows up as drift", () => {
	assert.deepEqual(demoDrift(cfg({ maxStalenessSecs: 0 }), []), ["max staleness 0 s"]);
	assert.deepEqual(demoDrift(cfg({ maxConfBps: 0 }), []), ["max confidence 0 bps"]);
	assert.deepEqual(demoDrift(cfg(), [mk("mTSLA", 38_062_500_000)]), ["mTSLA price override"]);
	// The state the screenshot left behind on 2026-09-14.
	assert.deepEqual(demoDrift(cfg(), [mk("mTSLA", 0, 10_000_000)]), ["mTSLA depth $10"]);
});

test("restore waits for ten idle minutes, and never runs with nothing to restore", () => {
	assert.equal(shouldAutoRestore(["mTSLA depth $10"], now - 599, now), false);
	assert.equal(shouldAutoRestore(["mTSLA depth $10"], now - 600, now), true);
	assert.equal(shouldAutoRestore(["mTSLA depth $10"], null, now), true);
	assert.equal(shouldAutoRestore([], null, now), false);
});
