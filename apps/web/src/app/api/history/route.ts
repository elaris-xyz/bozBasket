// Keeper ledger for one plan, newest first. The chain is the source of
// truth; this is the fast index the keeper writes (apps/keeper/src/ledger.ts).

import { NextResponse } from "next/server";
import { Pool } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let pool: Pool | null = null;
function db(): Pool | null {
	if (!process.env.DATABASE_URL) return null;
	if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: 10_000 });
	return pool;
}

export type HistoryRow = {
	id: number;
	ts: number;
	kind: "executed" | "deferred" | "skipped" | "error";
	reason: number;
	detail: string | null;
	signature: string | null;
	usdcIn: number | null;
	legs: { mint: string; usdcIn: string; units: string; referencePrice: string; venuePrice: string; exponent: number }[] | null;
};

export async function GET(req: Request) {
	const plan = new URL(req.url).searchParams.get("plan");
	if (!plan) return NextResponse.json({ error: "plan required" }, { status: 400 });
	const p = db();
	if (!p) return NextResponse.json({ rows: [], note: "ledger not configured" });
	try {
		const r = await p.query(
			`SELECT id, ts, kind, reason, detail, signature, usdc_in, legs FROM executions WHERE plan = $1 ORDER BY ts DESC, id DESC LIMIT 100`,
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
		}));
		return NextResponse.json({ rows });
	} catch (err) {
		return NextResponse.json({ rows: [], error: (err as Error).message }, { status: 200 });
	}
}
