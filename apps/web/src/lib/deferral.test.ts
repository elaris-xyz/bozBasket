import { test } from "node:test";
import assert from "node:assert/strict";
import { REASON } from "@bozbasket/shared";
import { deferralDetail, fmtAge, pythResumeLabel, retryNote } from "./deferral";

const legs = ["TSLA", "QQQ", "VOO"];

test("each reason reads its detail in its own unit", () => {
	// Details from the demo plan's ledger and the scenario sweep.
	assert.equal(deferralDetail(REASON.REFERENCE_STALE, "leg 0: 151609", legs), "TSLA price 42 h old");
	assert.equal(deferralDetail(REASON.REFERENCE_STALE, "leg 0: 144", legs), "TSLA price 2 min old");
	assert.equal(deferralDetail(REASON.CONFIDENCE_TOO_WIDE, "leg 1: 2", legs), "QQQ confidence 2 bps");
	assert.equal(deferralDetail(REASON.DIVERGENCE, "leg 0: 516", legs), "TSLA venue 516 bps from reference");
	assert.equal(deferralDetail(REASON.LOW_LIQUIDITY, "leg 1: 10000000", legs), "QQQ venue depth $10");
	assert.equal(deferralDetail(REASON.INSUFFICIENT_BALANCE, "leg 0: 99000000", legs), "vault holds $99.00, less than one period");
});

test("an unknown leg is named by its index", () => {
	assert.equal(deferralDetail(REASON.DIVERGENCE, "leg 3: 200", legs), "leg 3 venue 200 bps from reference");
	assert.equal(deferralDetail(REASON.DIVERGENCE, "leg 0: 200", []), "leg 0 venue 200 bps from reference");
});

test("text that is not an event detail is left alone", () => {
	assert.equal(deferralDetail(REASON.MARKET_CLOSED, "weekend; next open in 785 min", legs), null);
	assert.equal(deferralDetail(REASON.REFERENCE_STALE, null, legs), null);
	assert.equal(deferralDetail(REASON.OK, "leg 0: 5", legs), null);
});

test("ages below two minutes stay in seconds", () => {
	assert.equal(fmtAge(3), "3 s");
	assert.equal(fmtAge(120), "2 min");
	assert.equal(fmtAge(169_215), "47 h");
});

// Saturday 2026-09-19 12:00 ET; Pyth resumes Sunday 20:00 ET, 32 hours later.
const saturdayNoon = Date.parse("2026-09-19T16:00:00Z") / 1000;
const untilSunday = 32 * 3600;

test("a stale deferral names when Pyth publishes again, in New York time", () => {
	assert.equal(pythResumeLabel(saturdayNoon, untilSunday), "Sunday 20:00 ET, in 1d 8h");
	assert.equal(
		retryNote(REASON.REFERENCE_STALE, saturdayNoon, untilSunday, 0),
		"Pyth publishes no US equity prices until Sunday 20:00 ET, in 1d 8h. The keeper keeps trying and buys on the first fresh price.",
	);
});

test("while Pyth publishes, every other cause is retried on the next pass", () => {
	for (const reason of [REASON.REFERENCE_STALE, REASON.CONFIDENCE_TOO_WIDE, REASON.DIVERGENCE, REASON.LOW_LIQUIDITY]) {
		assert.match(retryNote(reason, saturdayNoon, 0, 0), /^The keeper tries again on its next pass, within a few minutes, and buys once /);
	}
});

test("a short vault says how much to deposit", () => {
	assert.equal(retryNote(REASON.INSUFFICIENT_BALANCE, saturdayNoon, 0, 1), "Nothing changes that on its own: deposit at least $1.00 and the next pass buys.");
});
