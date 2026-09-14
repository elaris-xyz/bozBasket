import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_THRESHOLDS, MAINNET_XSTOCKS, REASON } from "@bozbasket/shared";
import type { ShadowRow } from "keeper/shadow";
import { overallVerdict, parseHistoryQuery, parseVerdictQuery, toResult, verdictBody } from "./guardApi";

const [TSLAX, QQQX] = MAINNET_XSTOCKS;
const qs = (s: string) => new URLSearchParams(s);
const now = 1_789_403_108;

// A production row from 2026-09-14, during the US session.
const row = (o: Partial<ShadowRow> = {}): ShadowRow => ({
	ts: now,
	symbol: "TSLAx",
	mint: TSLAX.mint,
	usdcIn: 100,
	shares: 0.27531768,
	venuePrice: 363.2168,
	priceImpactBps: 16.63,
	route: "Whirlpool",
	multiplier: 1,
	liquidityUsd: 1_269_240.2,
	refPrice: 363.285,
	refAgeSecs: 3,
	confBps: 1,
	divergenceBps: -1.878,
	reason: REASON.OK,
	session: "regular session",
	error: null,
	...o,
});

test("defaults: every xStock, $100, the program's default limits", () => {
	const q = parseVerdictQuery(qs(""));
	assert.ok(q.ok);
	if (!q.ok) return;
	assert.deepEqual(
		q.value.stocks.map((s) => s.symbol),
		["TSLAx", "QQQx"],
	);
	assert.equal(q.value.usdc, 100);
	assert.deepEqual(q.value.limits, DEFAULT_THRESHOLDS);
});

test("symbols match the xStock or its ticker, in any case, without duplicates", () => {
	const q = parseVerdictQuery(qs("symbol=tsla,QQQx,tslax"));
	assert.ok(q.ok);
	if (!q.ok) return;
	assert.deepEqual(
		q.value.stocks.map((s) => s.symbol),
		["TSLAx", "QQQx"],
	);
	const one = parseVerdictQuery(qs("symbols=qqq"));
	assert.ok(one.ok && one.value.stocks.length === 1 && one.value.stocks[0] === QQQX);
});

test("bad input is refused with a message saying what is allowed", () => {
	const unknown = parseVerdictQuery(qs("symbol=VOOx"));
	assert.ok(!unknown.ok && /supported: TSLAx, QQQx/.test(unknown.message));
	for (const bad of ["usdc=0", "usdc=100001", "usdc=abc", "maxDivergenceBps=-1", "minLiquidityUsd=1e10", "maxStalenessSecs=999999"]) {
		assert.equal(parseVerdictQuery(qs(bad)).ok, false, bad);
	}
});

test("caller limits replace the defaults, with depth in USDC base units", () => {
	const q = parseVerdictQuery(qs("usdc=2500.25&maxDivergenceBps=40&maxStalenessSecs=30&maxConfBps=5&minLiquidityUsd=10000"));
	assert.ok(q.ok);
	if (!q.ok) return;
	assert.equal(q.value.usdc, 2500.25);
	assert.deepEqual(q.value.limits, { maxStalenessSecs: 30, maxConfBps: 5, maxDivergenceBps: 40, minLiquidityUsdc: 10_000_000_000 });
});

test("a passing check reads as buy, with the Pyth publish time recovered", () => {
	const r = toResult(row(), TSLAX);
	assert.equal(r.verdict, "buy");
	assert.equal(r.reason?.code, 0);
	assert.equal(r.reason?.name, "OK");
	assert.equal(r.reference?.publishTime, now - 3);
	assert.equal(r.gapBps, -1.9);
	assert.equal(r.venue?.pricePerShare, 363.2168);
	assert.equal(r.venue?.source, "jupiter");
	assert.equal(r.pythFeedId, TSLAX.feedId);
});

test("a stale reference reads as defer, named as the program names it", () => {
	const r = toResult(row({ reason: REASON.REFERENCE_STALE, refAgeSecs: 169_215 }), TSLAX);
	assert.equal(r.verdict, "defer");
	assert.equal(r.reason?.name, "REFERENCE_STALE");
	assert.equal(r.reference?.ageSecs, 169_215);
});

test("no pool is a defer without a venue; a failed source is unavailable", () => {
	const empty = { venuePrice: null, shares: null, refPrice: null, refAgeSecs: null, confBps: null, divergenceBps: null };
	const noPool = toResult(row({ ...empty, reason: REASON.LOW_LIQUIDITY, error: "not tradable" }), TSLAX);
	assert.equal(noPool.verdict, "defer");
	assert.equal(noPool.venue, null);
	assert.equal(noPool.reference, null);
	const down = toResult(row({ ...empty, reason: null, error: "Jupiter quote 503" }), TSLAX);
	assert.equal(down.verdict, "unavailable");
	assert.equal(down.reason, null);
});

test("overall: any defer defers, any missing answer is unavailable, else buy", () => {
	const buy = toResult(row(), TSLAX);
	const defer = toResult(row({ reason: REASON.DIVERGENCE }), QQQX);
	const down = toResult(row({ reason: null }), QQQX);
	assert.equal(overallVerdict([buy, buy]), "buy");
	assert.equal(overallVerdict([buy, defer, down]), "defer");
	assert.equal(overallVerdict([buy, down]), "unavailable");
	assert.equal(overallVerdict([]), "unavailable");
});

test("the body answers in request order and echoes the limits in dollars", () => {
	const q = parseVerdictQuery(qs("symbol=QQQx,TSLAx&minLiquidityUsd=750"));
	assert.ok(q.ok);
	if (!q.ok) return;
	const body = verdictBody([row(), row({ symbol: "QQQx", mint: QQQX.mint })], q.value, now);
	assert.deepEqual(
		body.results.map((r) => r.symbol),
		["QQQx", "TSLAx"],
	);
	assert.equal(body.limits.minLiquidityUsd, 750);
	assert.equal(body.overall, "buy");
	assert.equal(body.apiVersion, "1");
	assert.equal(body.network, "solana-mainnet");
});

test("history defaults to the last day and caps the page size", () => {
	const d = parseHistoryQuery(qs(""), now);
	assert.ok(d.ok && d.value.since === now - 86_400 && d.value.limit === 288);
	assert.equal(parseHistoryQuery(qs("limit=5000"), now).ok, false);
	assert.equal(parseHistoryQuery(qs(`since=${now + 10}`), now).ok, false);
});
