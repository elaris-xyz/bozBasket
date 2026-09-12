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
	legs: unknown | null; // LegFill[] for executed
};

export interface Ledger {
	record(row: LedgerRow): Promise<void>;
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
			CREATE INDEX IF NOT EXISTS executions_plan_ts ON executions (plan, ts DESC);
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
			`INSERT INTO executions (plan, ts, kind, reason, detail, signature, usdc_in, legs)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
			 ON CONFLICT (signature) DO NOTHING`,
			[r.plan, r.ts, r.kind, r.reason, r.detail, r.signature, r.usdcIn, r.legs === null ? null : JSON.stringify(r.legs)],
		);
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
	async close() {}
}
