import { test } from "node:test";
import assert from "node:assert/strict";
import { REASON } from "@bozbasket/shared";
import { effectiveMultiplier, failedRow, MAINNET_RPC_DEFAULT, mainnetRpcFor, shadowRow } from "./shadow";

const now = 1_789_400_000;
const ref = (price: number, ageSecs = 5, confBps = 1) => {
	const raw = BigInt(Math.round(price * 1e5));
	return { feedId: "9695e2", price: raw, conf: (raw * BigInt(confBps)) / 10_000n, expo: -5, publishTime: now - ageSecs };
};
const qqqx = { symbol: "QQQx", mint: "Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ", decimals: 8 };
const base = { now, stock: qqqx, usdcIn: 100, priceImpactPct: 0.00001, route: "Raydium CLMM", liquidityUsd: 1_600_000 };
// Measured on 2026-09-14: $100 of USDC quoted 0.14147100 raw QQQx while Pyth read 703.73.
const measuredOut = String(Math.round(0.141471 * 1e8));

test("the multiplier in force switches at its effective timestamp", () => {
	const c = { multiplier: "1.0019546533977475", newMultiplier: "1.0027250296551051", newMultiplierEffectiveTimestamp: 1782086100 };
	assert.equal(effectiveMultiplier(c, 1782086099), 1.0019546533977475);
	assert.equal(effectiveMultiplier(c, 1782086100), 1.0027250296551051);
	assert.equal(effectiveMultiplier({ multiplier: "1", newMultiplier: "1", newMultiplierEffectiveTimestamp: 0 }, now), 1);
});

test("the share multiplier is applied, so a dividend-paying xStock is not read as a premium", () => {
	const raw = shadowRow({ ...base, ref: ref(703.73), outAmount: measuredOut, multiplier: 1 });
	const scaled = shadowRow({ ...base, ref: ref(703.73), outAmount: measuredOut, multiplier: 1.0027250296551051 });
	assert.ok(Math.abs(raw.divergenceBps! - 44.5) < 0.5, `raw ${raw.divergenceBps}`);
	assert.ok(Math.abs(scaled.divergenceBps! - 17.2) < 0.5, `scaled ${scaled.divergenceBps}`);
	assert.ok(Math.abs(scaled.venuePrice! - 704.94) < 0.01);
	assert.equal(scaled.reason, REASON.OK);
});

test("a pool below the reference is a negative gap", () => {
	// TSLAx on 2026-09-14: 0.27779 for $100 while Pyth read 360.28.
	const r = shadowRow({ ...base, stock: { ...qqqx, symbol: "TSLAx" }, ref: ref(360.28), outAmount: String(Math.round(0.27779 * 1e8)), multiplier: 1 });
	assert.ok(r.divergenceBps! < 0 && r.divergenceBps! > -10, `${r.divergenceBps}`);
	assert.equal(r.reason, REASON.OK);
});

test("a stale reference defers even with a tight gap, and the gap is still recorded", () => {
	const r = shadowRow({ ...base, ref: ref(703.73, 169_215), outAmount: measuredOut, multiplier: 1.0027250296551051 });
	assert.equal(r.reason, REASON.REFERENCE_STALE);
	assert.equal(r.refAgeSecs, 169_215);
	assert.ok(r.divergenceBps !== null && Math.abs(r.divergenceBps - 17.2) < 0.5);
});

test("a gap past the 150 bps limit defers with DIVERGENCE, in either direction", () => {
	const shares = 100 / (703.73 * 1.02);
	const above = shadowRow({ ...base, ref: ref(703.73), outAmount: String(Math.round(shares * 1e8)), multiplier: 1 });
	assert.equal(above.reason, REASON.DIVERGENCE);
	const below = shadowRow({ ...base, ref: ref(703.73), outAmount: String(Math.round((100 / (703.73 * 0.98)) * 1e8)), multiplier: 1 });
	assert.equal(below.reason, REASON.DIVERGENCE);
	assert.ok(below.divergenceBps! < -150);
});

test("unknown depth does not read as shallow; known shallow depth does", () => {
	assert.equal(shadowRow({ ...base, ref: ref(703.73), outAmount: measuredOut, multiplier: 1.0027, liquidityUsd: null }).reason, REASON.OK);
	assert.equal(shadowRow({ ...base, ref: ref(703.73), outAmount: measuredOut, multiplier: 1.0027, liquidityUsd: 400 }).reason, REASON.LOW_LIQUIDITY);
});

test("a failed check carries no prices, and only a missing pool counts as a verdict", () => {
	const noPool = failedRow(now, qqqx, "The token is not tradable", REASON.LOW_LIQUIDITY);
	assert.equal(noPool.reason, REASON.LOW_LIQUIDITY);
	assert.equal(noPool.divergenceBps, null);
	assert.equal(failedRow(now, qqqx, "Jupiter quote 503", null).reason, null);
});

test("the mainnet RPC is the Helius twin of a Helius devnet URL, else the public endpoint", () => {
	assert.equal(mainnetRpcFor("https://devnet.helius-rpc.com/?api-key=k1"), "https://mainnet.helius-rpc.com/?api-key=k1");
	assert.equal(mainnetRpcFor("https://api.devnet.solana.com"), MAINNET_RPC_DEFAULT);
	assert.equal(mainnetRpcFor("not a url"), MAINNET_RPC_DEFAULT);
});

test("caller limits replace the defaults, and a failed check keeps the caller's size", () => {
	const strict = shadowRow({ ...base, ref: ref(703.73), outAmount: measuredOut, multiplier: 1.0027250296551051, limits: { maxStalenessSecs: 120, maxConfBps: 50, maxDivergenceBps: 10, minLiquidityUsdc: 500_000_000 } });
	assert.equal(strict.reason, REASON.DIVERGENCE);
	assert.equal(failedRow(now, qqqx, "no route", REASON.LOW_LIQUIDITY, 2500).usdcIn, 2500);
});
