"use client";

import { useEffect, useState } from "react";
import type { HistoryRow, Scorecard } from "@/app/api/history/route";

export type HistoryState = { rows: HistoryRow[] | null; scorecard: Scorecard | null; note: string | null };

/** One fetch of the keeper ledger, shared by the scorecard and the history
 *  list so the page does not ask twice for the same rows. */
export function useHistory(plan: string, refreshKey: number): HistoryState {
	const [state, setState] = useState<HistoryState>({ rows: null, scorecard: null, note: null });
	useEffect(() => {
		let alive = true;
		fetch(`/api/history?plan=${plan}`)
			.then((r) => r.json())
			.then((b) => alive && setState({ rows: b.rows ?? [], scorecard: b.scorecard ?? null, note: b.note ?? b.error ?? null }))
			.catch((e) => alive && setState({ rows: [], scorecard: null, note: String(e) }));
		return () => {
			alive = false;
		};
	}, [plan, refreshKey]);
	return state;
}
