import { test } from "node:test";
import assert from "node:assert/strict";
import { liveWeekendView, type LiveWeekendFile } from "./liveWeekend";
import file from "../generated/weekend-live.json";

const one = (premiums: number[], extra: Partial<LiveWeekendFile["symbols"][number]> = {}): LiveWeekendFile => ({
	window: { friday: "2026-09-18", closeTs: 0, reopenTs: 48 * 3600 },
	measuredAt: "2026-09-21T00:00:00Z",
	symbols: [
		{
			symbol: "TSLAx",
			checks: 10,
			maxRefAgeSecs: 7200,
			wouldDefer: 9,
			weekdayMedianAbsGapBps: 3,
			result: { tradedHours: premiums.length, hoursBeyondLimit: 0, timerPremiumBps: -10, reopenMoveBps: 20, premiums: premiums.map((bps, i) => ({ ts: i, bps })) },
			...extra,
		},
	],
});

test("the weekend gap is the median distance in either direction, not the signed median", () => {
	// Signed, these cancel to 0 and would read as "no gap at all". Nearest-rank:
	// the lower middle of 30, 30, 40, 40.
	const v = liveWeekendView(one([-40, -30, 30, 40]));
	assert.equal(v.symbols[0].weekendGapBps, 30);
	assert.equal(v.pauseHours, 48);
	assert.equal(v.symbols[0].maxAgeHours, 2);
});

test("a symbol with no traded hour has no gap, not a zero gap", () => {
	const v = liveWeekendView(one([], { result: null }));
	assert.equal(v.symbols[0].weekendGapBps, null);
	assert.equal(v.symbols[0].tradedHours, 0);
});

test("the committed weekend reproduces the numbers the script printed", () => {
	const v = liveWeekendView(file as unknown as LiveWeekendFile);
	const t = v.symbols.find((s) => s.symbol === "TSLAx");
	const q = v.symbols.find((s) => s.symbol === "QQQx");
	assert.ok(t && q);
	// weekend-live.ts on 2026-09-21: |median| 21.6 and 30.6 bps, Saturday noon -17.6 and -30.6.
	assert.equal(t.weekendGapBps?.toFixed(1), "21.6");
	assert.equal(q.weekendGapBps?.toFixed(1), "30.6");
	assert.equal(t.saturdayNoonBps?.toFixed(1), "-17.6");
	assert.equal(q.saturdayNoonBps?.toFixed(1), "-30.6");
	assert.equal(t.hoursBeyondLimit + q.hoursBeyondLimit, 0);
});
