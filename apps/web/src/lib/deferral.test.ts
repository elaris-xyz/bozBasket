import { test } from "node:test";
import assert from "node:assert/strict";
import { REASON } from "@bozbasket/shared";
import { deferralDetail, fmtAge } from "./deferral";

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
