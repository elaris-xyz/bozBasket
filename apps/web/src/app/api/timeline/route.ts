// A plan's invested amount and value over time, for the chart on the plan page.
//
// Fills and deferrals come from the keeper ledger, the prices between fills
// from the reference prices the keeper records every quarter hour
// (keeper/src/references.ts). Nothing here calls Hermes: its key is
// rate-limited and the executions need it. The arithmetic lives in
// lib/timeline.ts, where it is unit tested.

import { NextResponse } from "next/server";
import { Pool } from "pg";
import deployment from "@/generated/devnet.json";
import { buildTimeline, sampleGrid, samplesFromReferences, type ReferenceRow } from "@/lib/timeline";
import type { HistoryRow } from "@/lib/scorecard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MINT_BY_FEED: Record<string, string> = Object.fromEntries(Object.values(deployment.markets).map((m) => [m.feedId.replace(/^0x/i, "").toLowerCase(), m.stockMint]));

let pool: Pool | null = null;
function db(): Pool | null {
	if (!process.env.DATABASE_URL) return null;
	if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: 10_000 });
	return pool;
}

export async function GET(req: Request) {
	const plan = new URL(req.url).searchParams.get("plan");
	if (!plan) return NextResponse.json({ error: "plan required" }, { status: 400 });
	const p = db();
	if (!p) return NextResponse.json({ points: [], heldBack: [], invested: 0, note: "ledger not configured" });
	try {
		const r = await p.query(
			`SELECT id, ts, kind, reason, usdc_in, legs, forced
			   FROM executions WHERE plan = $1 AND kind IN ('executed', 'deferred') ORDER BY ts, id`,
			[plan],
		);
		const rows: HistoryRow[] = r.rows.map((x) => ({
			id: Number(x.id),
			ts: Number(x.ts),
			kind: x.kind,
			reason: Number(x.reason),
			detail: null,
			signature: null,
			usdcIn: x.usdc_in === null ? null : Number(x.usdc_in) / 1e6,
			legs: x.legs,
			forced: !!x.forced,
			avoidedUsdc: null,
		}));
		const firstFill = rows.find((x) => x.kind === "executed");
		if (!firstFill) return NextResponse.json({ ...buildTimeline(rows, []), note: null });

		const now = Math.floor(Date.now() / 1000);
		const grid = sampleGrid(firstFill.ts, now);
		// The fills alone still draw a chart, so a missing price table is a note, not an error.
		let refs: ReferenceRow[] = [];
		let note: string | null = null;
		try {
			const q = await p.query(`SELECT ts, feed_id, price, publish_time FROM reference_prices WHERE ts BETWEEN $1 AND $2 ORDER BY ts`, [firstFill.ts - 3600, now]);
			refs = q.rows.map((x) => ({ ts: Number(x.ts), feedId: x.feed_id, price: x.price === null ? null : Number(x.price), publishTime: x.publish_time === null ? null : Number(x.publish_time) }));
		} catch (err) {
			note = `prices between buys are unavailable (${(err as Error).message.slice(0, 80)})`;
		}
		return NextResponse.json({ ...buildTimeline(rows, samplesFromReferences(refs, grid, MINT_BY_FEED)), note });
	} catch (err) {
		return NextResponse.json({ points: [], heldBack: [], invested: 0, error: (err as Error).message });
	}
}
