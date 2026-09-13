// Is the keeper alive? A judge must be able to tell "the guard deferred" from
// "nothing is running". The keeper writes one heartbeat row per loop.

import { NextResponse } from "next/server";
import { Pool } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A keeper polling every 60 s is late after this long. */
/** When the keeper counts as late. The GitHub Actions schedule is nominally
 *  every five minutes but routinely fires several minutes behind, so anything
 *  tighter than about fifteen minutes reports a healthy keeper as down. An
 *  always-on worker can set KEEPER_STALE_AFTER_SECS lower. */
const STALE_AFTER_SECS = Number(process.env.KEEPER_STALE_AFTER_SECS ?? 900);

let pool: Pool | null = null;
function db(): Pool | null {
	if (!process.env.DATABASE_URL) return null;
	if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: 10_000 });
	return pool;
}

export type KeeperStatus = {
	known: boolean;
	alive: boolean;
	ts: number | null;
	ageSecs: number | null;
	cluster: string | null;
	activePlans: number | null;
	duePlans: number | null;
	note: string | null;
};

export async function GET() {
	const p = db();
	const unknown: KeeperStatus = { known: false, alive: false, ts: null, ageSecs: null, cluster: null, activePlans: null, duePlans: null, note: null };
	if (!p) return NextResponse.json(unknown);
	try {
		const r = await p.query(`SELECT ts, cluster, active_plans, due_plans, note FROM keeper_heartbeat WHERE id = 1`);
		if (r.rowCount === 0) return NextResponse.json(unknown);
		const row = r.rows[0];
		const ts = Number(row.ts);
		const ageSecs = Math.max(0, Math.floor(Date.now() / 1000) - ts);
		const body: KeeperStatus = {
			known: true,
			alive: ageSecs <= STALE_AFTER_SECS,
			ts,
			ageSecs,
			cluster: row.cluster,
			activePlans: Number(row.active_plans),
			duePlans: Number(row.due_plans),
			note: row.note,
		};
		return NextResponse.json(body);
	} catch {
		return NextResponse.json(unknown);
	}
}
