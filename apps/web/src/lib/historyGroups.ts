// History folds repeats. A weekend is one held-back buy the keeper retries
// every hour, so the demo plan's list ran to 44 rows, 57% of the plan page on
// a phone, for eight buys. Consecutive attempts with the same outcome (kind,
// reason, and whether a demo control caused it) become one entry; a buy is
// never folded, since each one moved money. Pure, so it is unit tested.

import type { HistoryRow } from "./scorecard";

export type HistoryGroup = {
	kind: HistoryRow["kind"];
	reason: number;
	forced: boolean;
	/** Newest first, as the list shows them. */
	rows: HistoryRow[];
};

/** `rows` newest first, as /api/history returns them. */
export function groupHistory(rows: HistoryRow[]): HistoryGroup[] {
	const out: HistoryGroup[] = [];
	for (const r of rows) {
		const last = out[out.length - 1];
		if (last && r.kind !== "executed" && last.kind === r.kind && last.reason === r.reason && last.forced === r.forced) last.rows.push(r);
		else out.push({ kind: r.kind, reason: r.reason, forced: r.forced, rows: [r] });
	}
	return out;
}
