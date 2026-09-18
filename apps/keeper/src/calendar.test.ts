import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionAt, secondsUntilOpen, secondsUntilPythPublishes, localParts } from "@bozbasket/shared";

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

// Pyth's US equity window, as measured: Sunday 20:00 to Friday 20:00 ET.
const resumesAt = (d: Date) => new Date(d.getTime() + secondsUntilPythPublishes(d) * 1000).toISOString();

test("Pyth is publishing on a weekday night and after the Sunday reopen", () => {
	assert.equal(secondsUntilPythPublishes(new Date("2026-09-14T06:38:00Z")), 0); // Mon 02:38 ET, measured fresh
	assert.equal(secondsUntilPythPublishes(new Date("2026-09-14T00:26:00Z")), 0); // Sun 20:26 ET, measured fresh
	assert.equal(secondsUntilPythPublishes(new Date("2026-09-18T23:59:00Z")), 0); // Fri 19:59 ET
});

test("from Friday 20:00 ET the next Pyth price is due Sunday 20:00 ET", () => {
	assert.equal(resumesAt(new Date("2026-09-19T00:00:00Z")), "2026-09-21T00:00:00.000Z"); // Fri 20:00 ET
	assert.equal(resumesAt(saturday03ET), "2026-09-14T00:00:00.000Z");
	assert.equal(resumesAt(new Date("2026-09-13T23:59:00Z")), "2026-09-14T00:00:00.000Z"); // Sun 19:59 ET
});

test("a weekend scan stays cheap", () => {
	const t0 = performance.now();
	for (let i = 0; i < 10; i++) secondsUntilPythPublishes(new Date("2026-09-19T00:00:00Z"));
	assert.ok(performance.now() - t0 < 1000, "ten scans across a weekend should take well under a second");
});
