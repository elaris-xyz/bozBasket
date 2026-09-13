import { test } from "node:test";
import assert from "node:assert/strict";
import { buildScorecard, scaledPrice, type HistoryRow } from "./scorecard";

const TSLA = "16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1";
const QQQ = "9695e2b96ea7b3859da9ed25b7a46a920a776e2fdae19a7bcfdf2b219230452d";
const MINTS = { [TSLA]: "TSLAmint", [`0x${QQQ}`]: "QQQmint" };

const STALE = 1;
const DIVERGENCE = 4;

const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `expected ${expected}, got ${actual}`);

let id = 0;
const guardLeg = (feedId: string, referencePrice: number, legUsdc: number, reason = STALE) => ({
	feedId,
	referencePrice,
	venuePrice: null,
	legUsdc,
	ageSecs: 3600,
	confBps: 5,
	divergenceBps: null,
	reason,
});
const deferred = (ts: number, reason: number, legs: unknown[], extra: Partial<HistoryRow> = {}): HistoryRow => ({
	id: ++id,
	ts,
	kind: "deferred",
	reason,
	detail: null,
	signature: `d${id}`,
	usdcIn: null,
	legs: legs as HistoryRow["legs"],
	forced: false,
	avoidedUsdc: null,
	...extra,
});
const fill = (mint: string, usdc: number, ref: number, venue = ref) => ({
	mint,
	usdcIn: String(usdc * 1e6),
	units: "1",
	referencePrice: String(Math.round(ref * 1e8)),
	venuePrice: String(Math.round(venue * 1e8)),
	exponent: -8,
});
const executed = (ts: number, legs: unknown[]): HistoryRow => ({
	id: ++id,
	ts,
	kind: "executed",
	reason: 0,
	detail: null,
	signature: `e${id}`,
	usdcIn: 100,
	legs: legs as HistoryRow["legs"],
	forced: false,
	avoidedUsdc: null,
});

test("a retried divergence counts as one avoided overpayment, not one per retry", () => {
	const s = buildScorecard(
		[deferred(100, DIVERGENCE, [], { avoidedUsdc: 1.5 }), deferred(200, DIVERGENCE, [], { avoidedUsdc: 1.5 }), deferred(300, DIVERGENCE, [], { avoidedUsdc: 1.5 }), executed(400, [])],
		MINTS,
	);
	near(s.avoidedUsdc, 1.5);
	assert.equal(s.deferrals, 3);
	assert.equal(s.heldBackBuys, 1);
	assert.equal(s.byReason[DIVERGENCE], 3);
});

test("a period opened by a demo control is never credited, even if a later retry was organic", () => {
	const s = buildScorecard([deferred(100, DIVERGENCE, [], { forced: true, avoidedUsdc: 9 }), deferred(200, DIVERGENCE, [], { avoidedUsdc: 9 }), executed(300, [])], MINTS);
	near(s.avoidedUsdc, 0);
	assert.equal(s.forcedDeferrals, 1);
	assert.equal(s.heldBackBuys, 0);
	assert.equal(s.byReason[DIVERGENCE], 1);
});

test("stale legs pair with the fill by mint even after update_plan changed the amount", () => {
	// Deferred a $50 TSLA leg at 100; the plan was later raised, the fill spent $125.
	const s = buildScorecard([deferred(100, STALE, [guardLeg(TSLA, 100, 50)]), executed(500, [fill("TSLAmint", 125, 95, 95.19)])], MINTS);
	near(s.staleSavedUsdc, 2.5);
});

test("the venue spread is not reported as a market move", () => {
	const s = buildScorecard([deferred(100, STALE, [guardLeg(TSLA, 100, 50)]), executed(500, [fill("TSLAmint", 50, 100, 100.2)])], MINTS);
	near(s.staleSavedUsdc, 0);
});

test("waiting that cost money is reported as a negative number", () => {
	const s = buildScorecard([deferred(100, STALE, [guardLeg(TSLA, 100, 50)]), executed(500, [fill("TSLAmint", 50, 110)])], MINTS);
	near(s.staleSavedUsdc, -5);
});

test("a stale buy is counted once however many times the keeper retried", () => {
	const s = buildScorecard(
		[
			deferred(100, STALE, [guardLeg(TSLA, 100, 50)]),
			deferred(200, STALE, [guardLeg(TSLA, 100, 50)]),
			deferred(300, STALE, [guardLeg(TSLA, 100, 50)]),
			executed(400, [fill("TSLAmint", 50, 95)]),
		],
		MINTS,
	);
	near(s.staleSavedUsdc, 2.5);
	assert.equal(s.heldBackBuys, 1);
	assert.equal(s.deferrals, 3);
});

test("every closed period counts; an open one with no fill yet adds nothing", () => {
	const s = buildScorecard(
		[
			deferred(100, STALE, [guardLeg(TSLA, 100, 50)]),
			executed(200, [fill("TSLAmint", 50, 95)]),
			deferred(300, STALE, [guardLeg(TSLA, 100, 50)]),
			executed(400, [fill("TSLAmint", 50, 90)]),
			deferred(500, STALE, [guardLeg(TSLA, 90, 50)]),
		],
		MINTS,
	);
	near(s.staleSavedUsdc, 2.5 + 5);
	assert.equal(s.heldBackBuys, 3);
	assert.equal(s.executions, 2);
});

test("feed ids match with or without 0x, and legs without a market are skipped", () => {
	const s = buildScorecard([deferred(100, STALE, [guardLeg(QQQ, 200, 30), guardLeg("ffff", 10, 20)]), executed(200, [fill("QQQmint", 30, 190)])], MINTS);
	near(s.staleSavedUsdc, 1.5);
});

test("rows may arrive newest first, as the database returns them", () => {
	const rows = [deferred(100, STALE, [guardLeg(TSLA, 100, 50)]), executed(500, [fill("TSLAmint", 50, 95)])];
	near(buildScorecard([...rows].reverse(), MINTS).staleSavedUsdc, 2.5);
});

test("scaledPrice is exact for Pyth integer prices", () => {
	assert.equal(scaledPrice("9500000000", -8), 95);
	assert.equal(scaledPrice("36527500", -5), 365.275);
	assert.equal(scaledPrice("12345", 0), 12345);
	assert.equal(scaledPrice("5", 2), 500);
});

test("a period opened by a row from before snapshots existed scores from its first stale snapshot", () => {
	// The opener came from an older keeper and has no guard snapshot; a later
	// stale retry in the same period has one, quoting the same frozen price.
	const s = buildScorecard([deferred(100, STALE, []), deferred(200, STALE, [guardLeg(TSLA, 100, 50)]), executed(500, [fill("TSLAmint", 50, 95)])], MINTS);
	near(s.staleSavedUsdc, 2.5);
	assert.equal(s.heldBackBuys, 1);
});

test("a stale snapshot never crosses into the next period", () => {
	// Period two opens without a snapshot and has no later one, so it scores
	// zero rather than borrowing period one's price.
	const s = buildScorecard(
		[deferred(100, STALE, [guardLeg(TSLA, 100, 50)]), executed(200, [fill("TSLAmint", 50, 95)]), deferred(300, STALE, []), executed(400, [fill("TSLAmint", 50, 80)])],
		MINTS,
	);
	near(s.staleSavedUsdc, 2.5);
});

test("a forced stale opener is excluded even when a later snapshot exists", () => {
	const s = buildScorecard([deferred(100, STALE, [], { forced: true }), deferred(200, STALE, [guardLeg(TSLA, 100, 50)]), executed(500, [fill("TSLAmint", 50, 95)])], MINTS);
	near(s.staleSavedUsdc, 0);
	assert.equal(s.heldBackBuys, 0);
});
