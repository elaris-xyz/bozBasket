import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionAt, secondsUntilOpen, localParts } from "@bozbasket/shared";

// 2026-09-14 is a Monday. 14:00 UTC = 10:00 ET (EDT).
const monday10ET = new Date("2026-09-14T14:00:00Z");
const monday0900ET = new Date("2026-09-14T13:00:00Z");
const monday1600ET = new Date("2026-09-14T20:00:00Z");
const saturday03ET = new Date("2026-09-12T07:00:00Z");
const laborDay = new Date("2026-09-07T15:00:00Z"); // 0907/C in the schedule
const blackFriday1230ET = new Date("2026-11-27T17:30:00Z"); // half day 0930-1300
const blackFriday1330ET = new Date("2026-11-27T18:30:00Z");

test("weekday regular session is open", () => {
	assert.equal(sessionAt(monday10ET).open, true);
});

test("before the bell and at the close are outside hours", () => {
	assert.equal(sessionAt(monday0900ET).open, false);
	assert.equal(sessionAt(monday0900ET).reason, "outside_hours");
	assert.equal(sessionAt(monday1600ET).open, false);
});

test("saturday night is a weekend", () => {
	const s = sessionAt(saturday03ET);
	assert.equal(s.open, false);
	assert.equal(s.reason, "weekend");
});

test("holidays and half days follow the schedule string", () => {
	assert.equal(sessionAt(laborDay).reason, "holiday");
	assert.equal(sessionAt(blackFriday1230ET).open, true);
	assert.equal(sessionAt(blackFriday1330ET).open, false);
});

test("secondsUntilOpen from saturday reaches monday 09:30 ET", () => {
	const secs = secondsUntilOpen(saturday03ET);
	const open = new Date(saturday03ET.getTime() + secs * 1000);
	assert.equal(open.toISOString(), "2026-09-14T13:30:00.000Z");
});

test("localParts uses Pyth's Monday-first weekday index", () => {
	assert.equal(localParts(monday10ET, "America/New_York").weekdayIndex, 0);
	assert.equal(localParts(saturday03ET, "America/New_York").weekdayIndex, 5);
});
