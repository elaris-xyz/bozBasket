import { test } from "node:test";
import assert from "node:assert/strict";
import { groupHistory } from "./historyGroups";
import type { HistoryRow } from "./scorecard";

let id = 0;
const row = (ts: number, kind: HistoryRow["kind"], reason = 0, forced = false): HistoryRow => ({
	id: ++id,
	ts,
	kind,
	reason,
	detail: null,
	signature: `s${id}`,
	usdcIn: kind === "executed" ? 100 : null,
	legs: null,
	forced,
	avoidedUsdc: null,
});
const shape = (rows: HistoryRow[]) => groupHistory(rows).map((g) => `${g.kind}:${g.reason}${g.forced ? "f" : ""}x${g.rows.length}`);

test("a weekend of hourly retries is one entry, newest first", () => {
	const rows = [row(900, "executed"), ...[800, 700, 600, 500, 400, 300, 200].map((ts) => row(ts, "deferred", 1)), row(100, "executed")];
	assert.deepEqual(shape(rows), ["executed:0x1", "deferred:1x7", "executed:0x1"]);
	assert.deepEqual(groupHistory(rows)[1].rows.map((r) => r.ts), [800, 700, 600, 500, 400, 300, 200]);
});

test("buys are never folded, even back to back", () => {
	assert.deepEqual(shape([row(300, "executed"), row(200, "executed"), row(100, "executed")]), ["executed:0x1", "executed:0x1", "executed:0x1"]);
});

test("a different reason, or a demo control, starts a new entry", () => {
	const rows = [row(600, "deferred", 1), row(500, "deferred", 1, true), row(400, "deferred", 4, true), row(300, "deferred", 4, true), row(200, "skipped", 3), row(100, "skipped", 3)];
	assert.deepEqual(shape(rows), ["deferred:1x1", "deferred:1fx1", "deferred:4fx2", "skipped:3x2"]);
});

test("every row lands in exactly one entry", () => {
	const rows = [row(5, "deferred", 1), row(4, "deferred", 1), row(3, "error"), row(2, "error"), row(1, "executed")];
	assert.equal(groupHistory(rows).reduce((n, g) => n + g.rows.length, 0), rows.length);
	assert.deepEqual(groupHistory([]), []);
});
