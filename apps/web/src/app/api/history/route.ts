// Keeper ledger for one plan, newest first, plus the guard's scorecard.
//
// The chain is the source of truth; this is the index the keeper writes
// (apps/keeper/src/ledger.ts). The scorecard arithmetic lives in
// lib/scorecard.ts, where it is unit tested.

import { NextResponse } from "next/server";
import { Pool } from "pg";
import deployment from "@/generated/devnet.json";
import { buildScorecard, type HistoryRow } from "@/lib/scorecard";

export type { FillLeg, GuardLeg, HistoryRow, Scorecard } from "@/lib/scorecard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Rows shown in the list. The scorecard always sees every row. */
const LIST_LIMIT = 100;

/** Pyth feed id to the mock stock mint, so a deferral snapshot (keyed by feed)
 *  can be paired with a fill (keyed by mint). */
const MINT_BY_FEED: Record<string, string> = Object.fromEntries(Object.values(deployment.markets).map((m) => [m.feedId, m.stockMint]));

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
	if (!p) return NextResponse.json({ rows: [], scorecard: null, note: "ledger not configured" });
	try {
		const r = await p.query(
			`SELECT id, ts, kind, reason, detail, signature, usdc_in, legs, forced, avoided_usdc
			   FROM executions WHERE plan = $1 ORDER BY ts DESC, id DESC`,
			[plan],
		);
		const rows: HistoryRow[] = r.rows.map((x) => ({
			id: Number(x.id),
			ts: Number(x.ts),
			kind: x.kind,
			reason: Number(x.reason),
			detail: x.detail,
			signature: x.signature,
			usdcIn: x.usdc_in === null ? null : Number(x.usdc_in) / 1e6,
			legs: x.legs,
			forced: !!x.forced,
			avoidedUsdc: x.avoided_usdc === null ? null : Number(x.avoided_usdc),
		}));
		return NextResponse.json({ rows: rows.slice(0, LIST_LIMIT), scorecard: buildScorecard(rows, MINT_BY_FEED) });
	} catch (err) {
		return NextResponse.json({ rows: [], scorecard: null, error: (err as Error).message }, { status: 200 });
	}
}
