// Postgres ledger of every keeper decision. The chain is the source of truth;
// this exists so the web app can list history and deferral reasons without
// scanning transaction logs.

import { Pool } from "pg";

export type LedgerRow = {
	plan: string;
	ts: number;
	kind: "executed" | "deferred" | "skipped" | "error";
	reason: number; // ReasonCode; 0 for executed
	detail: string | null;
	signature: string | null;
	usdcIn: string | null; // base units as string
	/** LegFill[] for an execution, the guard's per-leg snapshot for a deferral. */
	legs: unknown | null;
	/** True when a demo control caused this deferral rather than the market.
	 *  Forced deferrals are never counted as savings. */
	forced?: boolean;
	/** USDC the deferral avoided overpaying, where that is computable. */
	avoidedUsdc?: number | null;
};

/** Written once per keeper loop so the web app can tell "the guard deferred"
 *  apart from "nothing is running". */
export type Heartbeat = { ts: number; cluster: string; activePlans: number; duePlans: number; note: string };

export interface Ledger {
	record(row: LedgerRow): Promise<void>;
	beat(h: Heartbeat): Promise<void>;
	close(): Promise<void>;
}

export class PgLedger implements Ledger {
	private pool: Pool;
	constructor(databaseUrl: string) {
		this.pool = new Pool({ connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 30_000 });
		this.pool.on("error", (err) => console.warn("ledger: pool error", err.message));
	}

	async migrate() {
		await this.pool.query(`
			CREATE TABLE IF NOT EXISTS executions (
				id         bigserial PRIMARY KEY,
				plan       text        NOT NULL,
				ts         bigint      NOT NULL,
				kind       text        NOT NULL,
				reason     smallint    NOT NULL DEFAULT 0,
				detail     text,
				signature  text UNIQUE,
				usdc_in    numeric,
				legs       jsonb,
				created_at timestamptz NOT NULL DEFAULT now()
			);
			ALTER TABLE executions ADD COLUMN IF NOT EXISTS forced boolean NOT NULL DEFAULT false;
			ALTER TABLE executions ADD COLUMN IF NOT EXISTS avoided_usdc numeric;
			CREATE INDEX IF NOT EXISTS executions_plan_ts ON executions (plan, ts DESC);
			CREATE TABLE IF NOT EXISTS keeper_heartbeat (
				id           smallint PRIMARY KEY,
				ts           bigint  NOT NULL,
				cluster      text    NOT NULL,
				active_plans int     NOT NULL DEFAULT 0,
				due_plans    int     NOT NULL DEFAULT 0,
				note         text
			);
		`);
	}

	async record(r: LedgerRow) {
		try {
			await this.insert(r);
		} catch (err) {
			console.warn(`ledger: insert failed (${(err as Error).message}); row: ${r.kind} ${r.plan} ${r.signature ?? ""}`);
		}
	}

	private async insert(r: LedgerRow) {
		await this.pool.query(
			`INSERT INTO executions (plan, ts, kind, reason, detail, signature, usdc_in, legs, forced, avoided_usdc)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
			 ON CONFLICT (signature) DO NOTHING`,
			[r.plan, r.ts, r.kind, r.reason, r.detail, r.signature, r.usdcIn, r.legs === null ? null : JSON.stringify(r.legs), r.forced ?? false, r.avoidedUsdc ?? null],
		);
	}

	async beat(h: Heartbeat) {
		try {
			await this.pool.query(
				`INSERT INTO keeper_heartbeat (id, ts, cluster, active_plans, due_plans, note) VALUES (1,$1,$2,$3,$4,$5)
				 ON CONFLICT (id) DO UPDATE SET ts = EXCLUDED.ts, cluster = EXCLUDED.cluster, active_plans = EXCLUDED.active_plans, due_plans = EXCLUDED.due_plans, note = EXCLUDED.note`,
				[h.ts, h.cluster, h.activePlans, h.duePlans, h.note],
			);
		} catch (err) {
			console.warn(`ledger: heartbeat failed (${(err as Error).message})`);
		}
	}

	async close() {
		await this.pool.end();
	}
}

/** Used when DATABASE_URL is unset: prints instead of storing. */
export class LogLedger implements Ledger {
	async record(r: LedgerRow) {
		console.log(`[ledger] ${r.kind} plan=${r.plan} reason=${r.reason} ${r.detail ?? ""} ${r.signature ?? ""}`);
	}
	async beat(h: Heartbeat) {
		console.log(`[ledger] heartbeat ${new Date(h.ts * 1000).toISOString()} ${h.activePlans} active, ${h.duePlans} due`);
	}
	async close() {}
}
