// One lock for every keeper, wherever it runs: the web app's serverless tick,
// the scheduled GitHub Action, or an always-on worker.
//
// Without it two keepers can attempt the same due plan. The chain stays
// correct, because the second `execute_basket` fails NotDue, but the loser has
// already paid to post Pyth updates and records an error row that a judge then
// reads in History. A single Postgres row prevents both.
//
// Two rules, enforced in one UPDATE so there is no race between check and set:
//   - at most one pass runs at a time (running_until), and a pass that dies
//     frees the lock when its hold expires;
//   - a new pass starts at most once per spacing window after the previous
//     one started (next_allowed), unless the caller forces it.
//
// Both statements are safe to send twice. On 2026-09-14 a release failed with
// "Connection terminated due to connection timeout" after a 15-second pass:
// the pooled connection had gone idle and reconnecting took too long. A
// connection-level failure leaves it unknown whether the statement landed, so
// each is retried once, and written so that a second copy changes nothing.

import { Pool } from "pg";

export type LockResult = { acquired: true } | { acquired: false; running: boolean; waitSecs: number };

const DDL = `
	CREATE TABLE IF NOT EXISTS keeper_lock (
		id            smallint    PRIMARY KEY,
		running_until timestamptz NOT NULL DEFAULT 'epoch',
		next_allowed  timestamptz NOT NULL DEFAULT 'epoch',
		holder        text,
		started_at    timestamptz
	);
	INSERT INTO keeper_lock (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
`;

/** The connection failed, so the statement may or may not have reached the
 *  database. A statement the database rejected is not retried. */
function isConnectionError(err: unknown): boolean {
	const e = err as { code?: string; message?: string } | null;
	if (e?.code && ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EPIPE", "ENOTFOUND", "57P01"].includes(e.code)) return true;
	return /connection terminated|connection timeout|timeout exceeded when trying to connect|client has encountered a connection error/i.test(e?.message ?? "");
}

export class PassLock {
	private pool: Pool;
	private ready: Promise<void> | null = null;

	constructor(databaseUrl: string) {
		this.pool = new Pool({
			connectionString: databaseUrl,
			max: 2,
			connectionTimeoutMillis: 15_000,
			// Long enough that the connection used to acquire is still open to
			// release after a short pass, instead of reconnecting for it.
			idleTimeoutMillis: 60_000,
		});
		this.pool.on("error", (err) => console.warn("keeper lock: pool error", err.message));
	}

	private async query(text: string, params?: unknown[]) {
		try {
			return await this.pool.query(text, params);
		} catch (err) {
			if (!isConnectionError(err)) throw err;
			return await this.pool.query(text, params);
		}
	}

	private ensure(): Promise<void> {
		this.ready ??= this.query(DDL)
			.then(() => undefined)
			.catch((err) => {
				this.ready = null;
				throw err;
			});
		return this.ready;
	}

	/** `force` skips the spacing window but never allows two passes at once.
	 *  A retry by the same holder, whose first attempt landed but whose reply
	 *  was lost, gets the lock back instead of being told it is busy. Holders
	 *  are unique per call, and release clears the holder, so this can never
	 *  hand the lock to a finished pass. */
	async acquire(holder: string, opts: { holdSecs: number; force?: boolean }): Promise<LockResult> {
		await this.ensure();
		const got = await this.query(
			`UPDATE keeper_lock
			    SET running_until = now() + make_interval(secs => $1),
			        started_at = CASE WHEN holder = $2 THEN started_at ELSE now() END,
			        holder = $2
			  WHERE id = 1
			    AND (holder = $2 OR (running_until < now() AND ($3::boolean OR next_allowed <= now())))
			  RETURNING id`,
			[opts.holdSecs, holder, !!opts.force],
		);
		if ((got.rowCount ?? 0) > 0) return { acquired: true };
		const r = await this.query(
			`SELECT running_until > now() AS running, GREATEST(0, CEIL(EXTRACT(EPOCH FROM next_allowed - now())))::int AS wait
			   FROM keeper_lock WHERE id = 1`,
		);
		const row = r.rows[0] ?? { running: false, wait: 0 };
		return { acquired: false, running: !!row.running, waitSecs: Number(row.wait) };
	}

	/** Frees the lock and opens the next spacing window from this pass's start.
	 *  Only the current holder can release, and releasing clears the holder, so
	 *  a repeated release, or one whose hold already expired, changes nothing. */
	async release(holder: string, spacingSecs: number): Promise<void> {
		await this.query(
			`UPDATE keeper_lock
			    SET running_until = 'epoch', next_allowed = started_at + make_interval(secs => $1), holder = NULL
			  WHERE id = 1 AND holder = $2`,
			[spacingSecs, holder],
		);
	}

	async close(): Promise<void> {
		await this.pool.end();
	}
}

/** Shared timing, so every keeper plays by the same rules. */
export const LOCK_TIMING = {
	/** Longest a pass may hold the lock; below the 300 s serverless limit. */
	holdSecs: 290,
	/** No new plan starts after this much of a pass has elapsed. */
	passBudgetMs: 200_000,
	/** Scheduled passes start at most once in this window. */
	spacingSecs: 55,
} as const;
